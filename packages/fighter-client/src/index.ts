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





/**
 * Cómo está un luchador en medio de la pelea. La Arena te pasa el tuyo
 * y el de tu rival en cada turno para que decidas tu movimiento.
 */
export interface FighterState {
  attack: u32;
  defense: u32;
  hp: u32;
  /**
 * Movimiento del turno anterior (0 en la primera ronda).
 */
last_move: u32;
  max_hp: u32;
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
   * Construct and simulate a decide_move transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  decide_move: ({me, enemy, round}: {me: FighterState, enemy: FighterState, round: u32}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_profile transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * La Arena llama esto una vez, cuando te inscribes.
   */
  get_profile: (options?: MethodOptions) => Promise<AssembledTransaction<FighterProfile>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
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
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAAAAAAALZGVjaWRlX21vdmUAAAAAAwAAAAAAAAACbWUAAAAAB9AAAAAMRmlnaHRlclN0YXRlAAAAAAAAAAVlbmVteQAAAAAAB9AAAAAMRmlnaHRlclN0YXRlAAAAAAAAAAVyb3VuZAAAAAAAAAQAAAABAAAABA==",
        "AAAAAAAAADFMYSBBcmVuYSBsbGFtYSBlc3RvIHVuYSB2ZXosIGN1YW5kbyB0ZSBpbnNjcmliZXMuAAAAAAAAC2dldF9wcm9maWxlAAAAAAAAAAABAAAH0AAAAA5GaWdodGVyUHJvZmlsZQAA",
        "AAAAAQAAAIVDw7NtbyBlc3TDoSB1biBsdWNoYWRvciBlbiBtZWRpbyBkZSBsYSBwZWxlYS4gTGEgQXJlbmEgdGUgcGFzYSBlbCB0dXlvCnkgZWwgZGUgdHUgcml2YWwgZW4gY2FkYSB0dXJubyBwYXJhIHF1ZSBkZWNpZGFzIHR1IG1vdmltaWVudG8uAAAAAAAAAAAAAAxGaWdodGVyU3RhdGUAAAAFAAAAAAAAAAZhdHRhY2sAAAAAAAQAAAAAAAAAB2RlZmVuc2UAAAAABAAAAAAAAAACaHAAAAAAAAQAAAA2TW92aW1pZW50byBkZWwgdHVybm8gYW50ZXJpb3IgKDAgZW4gbGEgcHJpbWVyYSByb25kYSkuAAAAAAAJbGFzdF9tb3ZlAAAAAAAABAAAAAAAAAAGbWF4X2hwAAAAAAAE",
        "AAAAAQAAAHpGaWNoYSBkZWwgbHVjaGFkb3IuIExhIEFyZW5hIGxhIGxlZSB1bmEgc29sYSB2ZXosIGFsIGluc2NyaWJpcnRlLAp5IGd1YXJkYSB1bmEgY29waWE6IGNhbWJpYXJsYSBkZXNwdcOpcyBubyBzaXJ2ZSBkZSBuYWRhLgAAAAAAAAAAAA5GaWdodGVyUHJvZmlsZQAAAAAABQAAAAAAAAAGYXR0YWNrAAAAAAAEAAAAAAAAAAdkZWZlbnNlAAAAAAQAAAAAAAAAAmhwAAAAAAAEAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAEdGVhbQAAABE=" ]),
      options
    )
  }
  public readonly fromJSON = {
    decide_move: this.txFromJSON<u32>,
        get_profile: this.txFromJSON<FighterProfile>
  }
}