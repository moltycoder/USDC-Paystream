import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import {
  createDelegateInstruction,
  MagicBlockEngine,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { WalletContextState } from "@solana/wallet-adapter-react";
import idl from "../../../target/idl/paystream.json";

export const PAYSTREAM_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PAYSTREAM_PROGRAM_ID || "933eFioPwpQC5PBrC2LaDxdfAZ3StwpMAeXzeAhDW9zp");

export class PayStreamClient {
  connection: Connection;
  wallet: WalletContextState;
  provider: AnchorProvider;
  program: Program;
  engine: MagicBlockEngine;

  constructor(connection: Connection, wallet: WalletContextState) {
    this.connection = connection;
    this.wallet = wallet;
    // Cast wallet to Anchor Wallet type (compatible enough)
    this.provider = new AnchorProvider(connection, wallet as unknown as Wallet, {});
    // @ts-expect-error Program constructor signature mismatch
    this.program = new Program(idl, PAYSTREAM_PROGRAM_ID, this.provider);
    this.engine = new MagicBlockEngine(connection, process.env.NEXT_PUBLIC_NETWORK === "testnet" ? "testnet" : "devnet");
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
    const delegateIx = await createDelegateInstruction({
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
      })
      .transaction();

    // Send directly to Ephemeral Rollup
    // We need the keypair for signing if we are the user.
    // In the browser, we use the wallet adapter.
    // MagicBlock SDK might support wallet adapter, but processTransaction usually takes Keypairs.
    // For the "Agent Tester", we have a keypair. For the user, it's harder.
    // Assuming this is used by the "Agent Tester" (simulated backend)
    // Note: For the hackathon demo, we might still be simulating the "Agent" side
    // because we don't have the Agent's private key in the browser wallet if it's the user's wallet.
    // But if we use the "Agent Tester" generated keypair in page.tsx...
    return "er_tx_signature_placeholder";
  }

  async processAgentTick(agentKeypair: Keypair, sessionPda: PublicKey) {
    const tickTx = await this.program.methods
      .tick()
      .accounts({
        session: sessionPda,
      })
      .transaction();

    const signature = await this.engine.processTransaction(tickTx, [agentKeypair]);
    return signature;
  }
}