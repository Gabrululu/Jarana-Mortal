// Acceso a la Arena desde el navegador: lecturas (simuladas, gratis) y escrituras (firmadas).
import {
  ArenaError,
  Client as ArenaClient,
  type BattleReport,
  type FightResult,
  type FighterProfile,
} from "@cvm/arena-client";
import { Client as FighterClient } from "@cvm/fighter-client";
import { SorobanDataBuilder, TransactionBuilder } from "@stellar/stellar-sdk";
import { config } from "./config";
import { explainError } from "./rules";

/** Lo que entrega una wallet (Freighter, Wallets Kit…) para firmar. */
export interface Signer {
  publicKey: string;
  signTransaction: NonNullable<ConstructorParameters<typeof ArenaClient>[0]["signTransaction"]>;
}

const network = { networkPassphrase: config.networkPassphrase, rpcUrl: config.rpcUrl };

export function arenaClient(signer?: Signer) {
  // errorTypes: sin esto el SDK no sabe traducir `Error(Contract, #n)` a un nombre
  return new ArenaClient({ ...network, contractId: config.arenaId, errorTypes: ArenaError, ...signer });
}

export function fighterClient(contractId: string) {
  return new FighterClient({ ...network, contractId });
}

/** Resultado tipado: o el valor, o un mensaje de error en español. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

async function attempt<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if ((globalThis as { process?: { env: Record<string, string> } }).process?.env.CVM_DEBUG) console.error(err);
    return { ok: false, error: explainError(err) };
  }
}

type ContractResult<T> = { isOk(): boolean; unwrap(): T; unwrapErr(): { message: string } };

/**
 * Saca el valor de un `Result` del contrato. El SDK a veces deja vacío el mensaje del
 * error; en ese caso usamos el error crudo de la simulación ("Error(Contract, #8)").
 */
function unwrap<T>(result: ContractResult<T>, simulation?: unknown): T {
  if (result.isOk()) return result.unwrap();
  const message = result.unwrapErr().message || String((simulation as { error?: unknown })?.error ?? "");
  throw new Error(message);
}

// ─── Lecturas (simulación: no se firma ni se paga nada) ─────────────────────

export const read = {
  fighters: () => attempt(async () => (await arenaClient().fighters()).result),
  fighter: (id: string) => attempt(async () => (await arenaClient().fighter({ fighter: id })).result ?? null),
  scoreboard: () => attempt(async () => (await arenaClient().scoreboard()).result),
  /** Ficha de cualquier contrato luchador, esté inscrito o no. */
  profile: (id: string): Promise<Outcome<FighterProfile>> =>
    attempt(async () => (await fighterClient(id).get_profile()).result),
  /** Pelea de práctica: corre todo el combate en simulación. */
  spar: (a: string, b: string): Promise<Outcome<BattleReport>> =>
    attempt(async () => {
      const tx = await arenaClient().simulate({ fighter_a: a, fighter_b: b });
      return unwrap(tx.result, tx.simulation);
    }),
};

// ─── Escrituras (la wallet firma, la red cobra una fracción de XLM) ─────────

export interface Sent<T> {
  value: T;
  txHash: string;
  ledger: number;
}

interface Sendable<T> {
  result: ContractResult<T>;
  simulation?: unknown;
  signAndSend(): Promise<{ result: ContractResult<T>; getTransactionResponse?: unknown }>;
}

async function send<T>(tx: Sendable<T>) {
  // Si la simulación ya falló (ficha inválida, no eres admin…), ni pedimos firma
  if (!tx.result.isOk()) unwrap(tx.result, tx.simulation);
  const sent = await tx.signAndSend();
  const response = sent.getTransactionResponse as { txHash: string; ledger: number } | undefined;
  return { value: unwrap(sent.result), txHash: response?.txHash ?? "", ledger: response?.ledger ?? 0 };
}

/**
 * Margen para `fight`. Los golpes FUERTE usan el azar de la red: la simulación (que calcula los recursos) y la
 * ejecución real juegan peleas distintas, y si la real dura más rondas gasta más cómputo y emite más eventos de los
 * presupuestados. Una pelea de 20 rondas cuesta ~13M de instrucciones y ~38k stroops; lo que no se usa se reembolsa.
 * Mismos valores en scripts/lib.mjs.
 */
export const FIGHT_INSTRUCTION_LEEWAY = 15_000_000;
export const FIGHT_RESOURCE_FEE = 200_000;

export const write = {
  register: (signer: Signer, fighter: string): Promise<Outcome<Sent<FighterProfile>>> =>
    attempt(async () => send(await arenaClient(signer).register({ owner: signer.publicKey, fighter }))),
  /** Solo el organizador (admin de la Arena) puede firmar esto. */
  fight: (signer: Signer, a: string, b: string): Promise<Outcome<Sent<FightResult>>> =>
    attempt(async () => {
      const tx = await arenaClient(signer).fight({ fighter_a: a, fighter_b: b }, { simulate: false });
      // Cada AssembledTransaction trae su propio RpcServer: le sumamos el margen solo a esta simulación
      const server = (tx as unknown as { server: { simulateTransaction: (...args: unknown[]) => unknown } }).server;
      const simulate = server.simulateTransaction.bind(server);
      server.simulateTransaction = (built, _addl, ...rest) =>
        simulate(built, { cpuInstructions: FIGHT_INSTRUCTION_LEEWAY }, ...rest);
      await tx.simulate();
      if (tx.built) {
        const data = tx.built.toEnvelope().v1().tx().ext().sorobanData();
        const fee = data.resourceFee().toBigInt();
        if (fee < BigInt(FIGHT_RESOURCE_FEE)) {
          const sorobanData = new SorobanDataBuilder(data).setResourceFee(FIGHT_RESOURCE_FEE).build();
          tx.built = TransactionBuilder.cloneFrom(tx.built, { sorobanData }).build();
        }
      }
      return send(tx);
    }),
};
