import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export const createTickTx = async (
  program: Program,
  sessionPda: PublicKey,
  host: PublicKey,
  mint: PublicKey
) => {
  // Derive vault PDA
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), sessionPda.toBuffer()],
    program.programId
  );

  // Derive host ATA
  const hostToken = getAssociatedTokenAddressSync(mint, host);

  // Cast program to any to avoid "excessively deep" TS inference error with Anchor 0.30+
  return await (program as any).methods
    .tick()
    .accounts({
      session: sessionPda,
    })
    .transaction();
};

export const executeTick = async (
  program: Program,
  sessionPda: PublicKey,
  host: PublicKey,
  mint: PublicKey
) => {
  try {
    const tx = await createTickTx(program, sessionPda, host, mint);
    const sig = await program.provider.sendAndConfirm!(tx);
    console.log("Tick successful, tx:", sig);
    return sig;
  } catch (error) {
    console.error("Tick failed:", error);
    throw error;
  }
};
