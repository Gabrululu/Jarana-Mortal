import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}





export interface RoundLog {
  countered_a: boolean;
  countered_b: boolean;
  damage_to_a: u32;
  damage_to_b: u32;
  hp_a: u32;
  hp_b: u32;
  missed_a: boolean;
  missed_b: boolean;
  move_a: u32;
  move_b: u32;
  round: u32;
}

export const ArenaError = {
  1: {message:"AlreadyRegistered"},
  2: {message:"NotRegistered"},
  /**
   * El contrato no respondió `get_profile` como un Luchador.
   */
  3: {message:"NotAFighter"},
  4: {message:"TooManyPoints"},
  5: {message:"StatTooLow"},
  6: {message:"InvalidTeam"},
  7: {message:"InvalidName"},
  8: {message:"SameFighter"},
  9: {message:"ArenaFull"},
  /**
   * Ya hay un luchador inscrito con ese nombre (sin importar mayúsculas).
   */
  10: {message:"NameTaken"}
}


/**
 * Marcador global. Solo los duelos Jarana vs. Terror entre asistentes suman punto de bando.
 */
export interface Scoreboard {
  fights: u32;
  jarana: u32;
  terror: u32;
}



export interface FightResult {
  fight_id: u32;
  knockout: boolean;
  loser: string;
  rounds: u32;
  winner: string;
  winner_team: string;
}



export interface BattleReport {
  knockout: boolean;
  log: Array<RoundLog>;
  loser: string;
  max_hp_a: u32;
  max_hp_b: u32;
  rounds: u32;
  winner: string;
}


export interface FighterRecord {
  fighter: string;
  /**
 * Luchador de la casa (Saco de Box): sus peleas no suman al marcador de bandos.
 */
house: boolean;
  losses: u32;
  owner: string;
  profile: FighterProfile;
  wins: u32;
}




/**
 * Ficha del luchador. La Arena la lee una sola vez, al inscribirte,
 * y guarda una copia: cambiarla después no sirve de nada.
 */
export interface FighterProfile {
  attack: u32;
  defense: u32;
  hp: u32;
  name: string;
  team: string;
}

export interface Client {
  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a fight transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Ejecuta un duelo oficial. Solo el organizador puede iniciarlo.
   */
  fight: ({fighter_a, fighter_b}: {fighter_a: string, fighter_b: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<FightResult>>>

  /**
   * Construct and simulate a fighter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  fighter: ({fighter}: {fighter: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<FighterRecord>>>

  /**
   * Construct and simulate a fighters transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  fighters: (options?: MethodOptions) => Promise<AssembledTransaction<Array<FighterRecord>>>

  /**
   * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Inscribe un Luchador. `owner` firma la transacción (es quien lo inscribe).
   */
  register: ({owner, fighter}: {owner: string, fighter: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<FighterProfile>>>

  /**
   * Construct and simulate a simulate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pelea de práctica: no exige inscripción, no guarda nada, no emite eventos.
   * Úsala con simulación (`stellar contract invoke --send=no ...`).
   */
  simulate: ({fighter_a, fighter_b}: {fighter_a: string, fighter_b: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<BattleReport>>>

  /**
   * Construct and simulate a scoreboard transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  scoreboard: (options?: MethodOptions) => Promise<AssembledTransaction<Scoreboard>>

  /**
   * Construct and simulate a register_house transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Inscribe un luchador de la casa (el Saco de Box). Pelea como cualquiera, pero no suma al marcador:
   * si no, cada paliza que recibe le daría un punto al bando contrario.
   */
  register_house: ({fighter}: {fighter: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<FighterProfile>>>

  /**
   * Construct and simulate a remove_fighter transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * El organizador puede expulsar a un Luchador (p. ej. si agota el presupuesto a propósito).
   */
  remove_fighter: ({fighter}: {fighter: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin}: {admin: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAAAAAAAAAAAACFJvdW5kTG9nAAAACwAAAAAAAAALY291bnRlcmVkX2EAAAAAAQAAAAAAAAALY291bnRlcmVkX2IAAAAAAQAAAAAAAAALZGFtYWdlX3RvX2EAAAAABAAAAAAAAAALZGFtYWdlX3RvX2IAAAAABAAAAAAAAAAEaHBfYQAAAAQAAAAAAAAABGhwX2IAAAAEAAAAAAAAAAhtaXNzZWRfYQAAAAEAAAAAAAAACG1pc3NlZF9iAAAAAQAAAAAAAAAGbW92ZV9hAAAAAAAEAAAAAAAAAAZtb3ZlX2IAAAAAAAQAAAAAAAAABXJvdW5kAAAAAAAABA==",
        "AAAABAAAAAAAAAAAAAAACkFyZW5hRXJyb3IAAAAAAAoAAAAAAAAAEUFscmVhZHlSZWdpc3RlcmVkAAAAAAAAAQAAAAAAAAANTm90UmVnaXN0ZXJlZAAAAAAAAAIAAAA5RWwgY29udHJhdG8gbm8gcmVzcG9uZGnDsyBgZ2V0X3Byb2ZpbGVgIGNvbW8gdW4gTHVjaGFkb3IuAAAAAAAAC05vdEFGaWdodGVyAAAAAAMAAAAAAAAADVRvb01hbnlQb2ludHMAAAAAAAAEAAAAAAAAAApTdGF0VG9vTG93AAAAAAAFAAAAAAAAAAtJbnZhbGlkVGVhbQAAAAAGAAAAAAAAAAtJbnZhbGlkTmFtZQAAAAAHAAAAAAAAAAtTYW1lRmlnaHRlcgAAAAAIAAAAAAAAAAlBcmVuYUZ1bGwAAAAAAAAJAAAARllhIGhheSB1biBsdWNoYWRvciBpbnNjcml0byBjb24gZXNlIG5vbWJyZSAoc2luIGltcG9ydGFyIG1hecO6c2N1bGFzKS4AAAAAAAlOYW1lVGFrZW4AAAAAAAAK",
        "AAAAAQAAAFlNYXJjYWRvciBnbG9iYWwuIFNvbG8gbG9zIGR1ZWxvcyBKYXJhbmEgdnMuIFRlcnJvciBlbnRyZSBhc2lzdGVudGVzIHN1bWFuIHB1bnRvIGRlIGJhbmRvLgAAAAAAAAAAAAAKU2NvcmVib2FyZAAAAAAAAwAAAAAAAAAGZmlnaHRzAAAAAAAEAAAAAAAAAAZqYXJhbmEAAAAAAAQAAAAAAAAABnRlcnJvcgAAAAAABA==",
        "AAAABQAAAAAAAAAAAAAACkZpZ2h0RW5kZWQAAAAAAAEAAAALZmlnaHRfZW5kZWQAAAAABwAAAAAAAAAIZmlnaHRfaWQAAAAEAAAAAQAAAAAAAAAJZmlnaHRlcl9hAAAAAAAAEwAAAAAAAAAAAAAACWZpZ2h0ZXJfYgAAAAAAABMAAAAAAAAAAAAAAAZ3aW5uZXIAAAAAABMAAAAAAAAAAAAAAAt3aW5uZXJfdGVhbQAAAAARAAAAAAAAAAAAAAAGcm91bmRzAAAAAAAEAAAAAAAAAAAAAAAIa25vY2tvdXQAAAABAAAAAAAAAAI=",
        "AAAAAQAAAAAAAAAAAAAAC0ZpZ2h0UmVzdWx0AAAAAAYAAAAAAAAACGZpZ2h0X2lkAAAABAAAAAAAAAAIa25vY2tvdXQAAAABAAAAAAAAAAVsb3NlcgAAAAAAABMAAAAAAAAABnJvdW5kcwAAAAAABAAAAAAAAAAGd2lubmVyAAAAAAATAAAAAAAAAAt3aW5uZXJfdGVhbQAAAAAR",
        "AAAABQAAAAAAAAAAAAAAC1JvdW5kUGxheWVkAAAAAAEAAAAMcm91bmRfcGxheWVkAAAADAAAAAAAAAAIZmlnaHRfaWQAAAAEAAAAAQAAAAAAAAAFcm91bmQAAAAAAAAEAAAAAAAAAAAAAAAGbW92ZV9hAAAAAAAEAAAAAAAAAAAAAAAGbW92ZV9iAAAAAAAEAAAAAAAAAAAAAAALZGFtYWdlX3RvX2EAAAAABAAAAAAAAAAAAAAAC2RhbWFnZV90b19iAAAAAAQAAAAAAAAAAAAAAARocF9hAAAABAAAAAAAAAAAAAAABGhwX2IAAAAEAAAAAAAAAAAAAAAIbWlzc2VkX2EAAAABAAAAAAAAAAAAAAAIbWlzc2VkX2IAAAABAAAAAAAAAAAAAAALY291bnRlcmVkX2EAAAAAAQAAAAAAAAAAAAAAC2NvdW50ZXJlZF9iAAAAAAEAAAAAAAAAAg==",
        "AAAAAQAAAAAAAAAAAAAADEJhdHRsZVJlcG9ydAAAAAcAAAAAAAAACGtub2Nrb3V0AAAAAQAAAAAAAAADbG9nAAAAA+oAAAfQAAAACFJvdW5kTG9nAAAAAAAAAAVsb3NlcgAAAAAAABMAAAAAAAAACG1heF9ocF9hAAAABAAAAAAAAAAIbWF4X2hwX2IAAAAEAAAAAAAAAAZyb3VuZHMAAAAAAAQAAAAAAAAABndpbm5lcgAAAAAAEw==",
        "AAAAAQAAAAAAAAAAAAAADUZpZ2h0ZXJSZWNvcmQAAAAAAAAGAAAAAAAAAAdmaWdodGVyAAAAABMAAABNTHVjaGFkb3IgZGUgbGEgY2FzYSAoU2FjbyBkZSBCb3gpOiBzdXMgcGVsZWFzIG5vIHN1bWFuIGFsIG1hcmNhZG9yIGRlIGJhbmRvcy4AAAAAAAAFaG91c2UAAAAAAAABAAAAAAAAAAZsb3NzZXMAAAAAAAQAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAHcHJvZmlsZQAAAAfQAAAADkZpZ2h0ZXJQcm9maWxlAAAAAAAAAAAABHdpbnMAAAAE",
        "AAAABQAAAAAAAAAAAAAADkZpZ2h0ZXJSZW1vdmVkAAAAAAABAAAAD2ZpZ2h0ZXJfcmVtb3ZlZAAAAAABAAAAAAAAAAdmaWdodGVyAAAAABMAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEUZpZ2h0ZXJSZWdpc3RlcmVkAAAAAAAAAQAAABJmaWdodGVyX3JlZ2lzdGVyZWQAAAAAAAQAAAAAAAAAB2ZpZ2h0ZXIAAAAAEwAAAAEAAAAAAAAABW93bmVyAAAAAAAAEwAAAAAAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAEdGVhbQAAABEAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAD5FamVjdXRhIHVuIGR1ZWxvIG9maWNpYWwuIFNvbG8gZWwgb3JnYW5pemFkb3IgcHVlZGUgaW5pY2lhcmxvLgAAAAAABWZpZ2h0AAAAAAAAAgAAAAAAAAAJZmlnaHRlcl9hAAAAAAAAEwAAAAAAAAAJZmlnaHRlcl9iAAAAAAAAEwAAAAEAAAPpAAAH0AAAAAtGaWdodFJlc3VsdAAAAAfQAAAACkFyZW5hRXJyb3IAAA==",
        "AAAAAAAAAAAAAAAHZmlnaHRlcgAAAAABAAAAAAAAAAdmaWdodGVyAAAAABMAAAABAAAD6AAAB9AAAAANRmlnaHRlclJlY29yZAAAAA==",
        "AAAAAAAAAAAAAAAIZmlnaHRlcnMAAAAAAAAAAQAAA+oAAAfQAAAADUZpZ2h0ZXJSZWNvcmQAAAA=",
        "AAAAAAAAAEtJbnNjcmliZSB1biBMdWNoYWRvci4gYG93bmVyYCBmaXJtYSBsYSB0cmFuc2FjY2nDs24gKGVzIHF1aWVuIGxvIGluc2NyaWJlKS4AAAAACHJlZ2lzdGVyAAAAAgAAAAAAAAAFb3duZXIAAAAAAAATAAAAAAAAAAdmaWdodGVyAAAAABMAAAABAAAD6QAAB9AAAAAORmlnaHRlclByb2ZpbGUAAAAAB9AAAAAKQXJlbmFFcnJvcgAA",
        "AAAAAAAAAI5QZWxlYSBkZSBwcsOhY3RpY2E6IG5vIGV4aWdlIGluc2NyaXBjacOzbiwgbm8gZ3VhcmRhIG5hZGEsIG5vIGVtaXRlIGV2ZW50b3MuCsOac2FsYSBjb24gc2ltdWxhY2nDs24gKGBzdGVsbGFyIGNvbnRyYWN0IGludm9rZSAtLXNlbmQ9bm8gLi4uYCkuAAAAAAAIc2ltdWxhdGUAAAACAAAAAAAAAAlmaWdodGVyX2EAAAAAAAATAAAAAAAAAAlmaWdodGVyX2IAAAAAAAATAAAAAQAAA+kAAAfQAAAADEJhdHRsZVJlcG9ydAAAB9AAAAAKQXJlbmFFcnJvcgAA",
        "AAAAAAAAAAAAAAAKc2NvcmVib2FyZAAAAAAAAAAAAAEAAAfQAAAAClNjb3JlYm9hcmQAAA==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAKdJbnNjcmliZSB1biBsdWNoYWRvciBkZSBsYSBjYXNhIChlbCBTYWNvIGRlIEJveCkuIFBlbGVhIGNvbW8gY3VhbHF1aWVyYSwgcGVybyBubyBzdW1hIGFsIG1hcmNhZG9yOgpzaSBubywgY2FkYSBwYWxpemEgcXVlIHJlY2liZSBsZSBkYXLDrWEgdW4gcHVudG8gYWwgYmFuZG8gY29udHJhcmlvLgAAAAAOcmVnaXN0ZXJfaG91c2UAAAAAAAEAAAAAAAAAB2ZpZ2h0ZXIAAAAAEwAAAAEAAAPpAAAH0AAAAA5GaWdodGVyUHJvZmlsZQAAAAAH0AAAAApBcmVuYUVycm9yAAA=",
        "AAAAAAAAAFpFbCBvcmdhbml6YWRvciBwdWVkZSBleHB1bHNhciBhIHVuIEx1Y2hhZG9yIChwLiBlai4gc2kgYWdvdGEgZWwgcHJlc3VwdWVzdG8gYSBwcm9ww7NzaXRvKS4AAAAAAA5yZW1vdmVfZmlnaHRlcgAAAAAAAQAAAAAAAAAHZmlnaHRlcgAAAAATAAAAAQAAA+kAAAACAAAH0AAAAApBcmVuYUVycm9yAAA=",
        "AAAAAQAAAHpGaWNoYSBkZWwgbHVjaGFkb3IuIExhIEFyZW5hIGxhIGxlZSB1bmEgc29sYSB2ZXosIGFsIGluc2NyaWJpcnRlLAp5IGd1YXJkYSB1bmEgY29waWE6IGNhbWJpYXJsYSBkZXNwdcOpcyBubyBzaXJ2ZSBkZSBuYWRhLgAAAAAAAAAAAA5GaWdodGVyUHJvZmlsZQAAAAAABQAAAAAAAAAGYXR0YWNrAAAAAAAEAAAAAAAAAAdkZWZlbnNlAAAAAAQAAAAAAAAAAmhwAAAAAAAEAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAEdGVhbQAAABE=" ]),
      options
    )
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<string>,
        fight: this.txFromJSON<Result<FightResult>>,
        fighter: this.txFromJSON<Option<FighterRecord>>,
        fighters: this.txFromJSON<Array<FighterRecord>>,
        register: this.txFromJSON<Result<FighterProfile>>,
        simulate: this.txFromJSON<Result<BattleReport>>,
        scoreboard: this.txFromJSON<Scoreboard>,
        register_house: this.txFromJSON<Result<FighterProfile>>,
        remove_fighter: this.txFromJSON<Result<void>>
  }
}