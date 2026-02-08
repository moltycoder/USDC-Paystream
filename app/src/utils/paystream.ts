import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Paystream } from "../../../target/types/paystream";

export const executeTick = async (program: Program<Paystream>, sessionPda: PublicKey) => {
  console.log("Executing tick for session:", sessionPda.toBase58());
  try {
    const tx = await program.methods
      .tick()
      .accounts({
        session: sessionPda,
      })
      .rpc();
    console.log("Tick successful, tx:", tx);
    return tx;
  } catch (error) {
    console.error("Tick failed:", error);
    throw error;
  }
};
