// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Cluster, PublicKey } from "@solana/web3.js";
import PayfluxIDL from "../program/idl/payflux.json";
import type { Payflux } from "../program/types/payflux";

// Re-export the generated IDL and type
export { Payflux, PayfluxIDL };

// The programId is imported from the program IDL.
export const PAYFLUX_PROGRAM_ID = new PublicKey(PayfluxIDL.address);

// This is a helper function to get the Payflux Anchor program.
export function getPayfluxProgram(provider: AnchorProvider, address?: PublicKey) {
  return new Program(
    { ...PayfluxIDL, address: address ? address.toBase58() : PayfluxIDL.address } as Payflux,
    provider
  );
}

// This is a helper function to get the program ID for the Payflux program depending on the cluster.
export function getPayfluxProgramId(cluster: Cluster) {
  switch (cluster) {
    case "devnet":
    case "testnet":
      // This is the program ID for the Payflux program on devnet and testnet.
      return new PublicKey("coUnmi3oBUtwtd9fjeAvSsJssXh5A5xyPbhpewyzRVF");
    case "mainnet-beta":
    default:
      return PAYFLUX_PROGRAM_ID;
  }
}
