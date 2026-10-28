// La Arena oficial. El organizador la escribe con `pnpm arena:deploy`.
import arena from "../../../config/arena.json";

export interface ArenaConfig {
  network: "testnet";
  rpcUrl: string;
  networkPassphrase: string;
  arenaId: string;
  sparringId: string;
  admin: string;
  deployedAt: string;
}

export const config: ArenaConfig = arena as ArenaConfig;

const EXPLORER = `https://stellar.expert/explorer/${config.network}`;

export const explorer = {
  contract: (id: string) => `${EXPLORER}/contract/${id}`,
  account: (address: string) => `${EXPLORER}/account/${address}`,
  tx: (hash: string) => `${EXPLORER}/tx/${hash}`,
};
