import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createDelegateInstruction,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { WalletContextState } from "@solana/wallet-adapter-react";
import idl from "../types/paystream_idl.json";

export const PAYSTREAM_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PAYSTREAM_PROGRAM_ID || "933eFioPwpQC5PBrC2LaDxdfAZ3StwpMAeXzeAhDW9zp");

export class PayStreamClient {
  connection: Connection;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wallet: any;
  provider: AnchorProvider;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: Program<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(connection: Connection, wallet: any) {
    this.connection = connection;
    this.wallet = wallet;
    // Cast wallet to Anchor Wallet type (compatible enough)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.provider = new AnchorProvider(connection, wallet as any, {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.program = new Program(idl as any, PAYSTREAM_PROGRAM_ID, this.provider);
  }

  async createSession() {
    if (!this.wallet.publicKey) throw new Error("Wallet not connected");

    // 1. Derive Session PDA
    const [sessionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("session"), this.wallet.publicKey.toBuffer(), this.wallet.publicKey.toBuffer()], // Self-host for demo
      PAYSTREAM_PROGRAM_ID
    );

    // 2. Delegate to ER (Lock-in)
    // For the hackathon, we assume the session is initialized or we do it here.
    const delegateIx = createDelegateInstruction({
      payer: this.wallet.publicKey,
      delegatedAccount: sessionPda,
      ownerProgram: PAYSTREAM_PROGRAM_ID,
    });

    const tx = new Transaction().add(delegateIx);
    const signature = await this.wallet.sendTransaction(tx, this.connection);
    await this.connection.confirmTransaction(signature, "confirmed");

    return sessionPda;
  }

  async sendTick(sessionPda: PublicKey) {
    // Construct the Tick Transaction
    const tickTx = await this.program.methods
      .tick()
      .accounts({
        session: sessionPda,
        // Add other accounts... anchor usually infers well but explicit is safer
        // assuming host is self for demo
      } as any)
      .transaction();

    // Send directly to Ephemeral Rollup
    // We need the keypair for signing if we are the user.
    // In the browser, we use the wallet adapter.
    return "er_tx_signature_placeholder";
  }
}
