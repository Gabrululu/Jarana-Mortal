// Conexión con Freighter (la wallet de navegador de Stellar). Solo se usa para firmar:
// las lecturas de la Arena son simulaciones y no necesitan wallet.
import { getNetworkDetails, isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import { config, type Signer } from "@cvm/game";

export async function connectFreighter(): Promise<Signer> {
  const installed = await isConnected();
  if (installed.error || !installed.isConnected) {
    throw new Error("No encontré Freighter. Instálala desde freighter.app y recarga la página.");
  }
  const access = await requestAccess();
  if (access.error || !access.address) throw new Error(access.error?.message ?? "Cancelaste la conexión.");

  const net = await getNetworkDetails();
  if (net.networkPassphrase !== config.networkPassphrase) {
    throw new Error("Freighter está en otra red. Cámbiala a Testnet y vuelve a intentar.");
  }

  const address = access.address;
  return {
    publicKey: address,
    signTransaction: async (xdr, opts) => {
      const res = await signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? config.networkPassphrase,
        address,
      });
      if (res.error) throw new Error(res.error.message ?? "User declined");
      return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
    },
  };
}
