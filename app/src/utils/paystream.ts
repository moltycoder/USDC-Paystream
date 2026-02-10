import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Paystream } from "../types/paystream";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export const executeTick = async (
  program: Program<Paystream>, 
  sessionPda: PublicKey, 
  host: PublicKey, 
  mint: PublicKey
) => {
  console.log("Executing tick for session:", sessionPda.toBase58());
  
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), sessionPda.toBuffer()],
    program.programId
  );

  const hostToken = getAssociatedTokenAddressSync(mint, host);

  try {
    const tx = await program.methods
      .tick()
      .accounts({
        session: sessionPda as any,
        vault: vaultPda as any,
        hostToken: hostToken as any,
      } as any)
      .rpc();
    console.log("Tick successful, tx:", tx);
    return tx;
  } catch (error) {
    console.error("Tick failed:", error);
    throw error;
  }
};
