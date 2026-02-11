"use server";

import { Connection, Keypair, Transaction, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferInstruction, getAccount } from "@solana/spl-token";
import bs58 from "bs58";

// Server-side ONLY variables (no NEXT_PUBLIC needed, but we check for compatibility)
const AGENT_SECRET = process.env.AGENT_WALLET_KEY || process.env.NEXT_PUBLIC_AGENT_WALLET_KEY;
const HOST_SECRET = process.env.DEMO_HOST_WALLET_KEY || process.env.NEXT_PUBLIC_DEMO_HOST_KEY;
const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// Lazy load keypairs to avoid build time errors if env missing
function getAgentKeypair() {
    if (!AGENT_SECRET) {
        throw new Error("AGENT_WALLET_KEY not set in env.");
    }
    return Keypair.fromSecretKey(bs58.decode(AGENT_SECRET));
}

function getHostKeypair() {
    if (!HOST_SECRET) {
        throw new Error("DEMO_HOST_WALLET_KEY not set in env.");
    }
    return Keypair.fromSecretKey(bs58.decode(HOST_SECRET));
}

export async function getAgentPublicKey() {
    return getAgentKeypair().publicKey.toBase58();
}

export async function getHostPublicKey() {
    return getHostKeypair().publicKey.toBase58();
}

export async function signTransactionServer(serializedTx: string, _workerId?: number): Promise<string> {
    const tx = Transaction.from(Buffer.from(serializedTx, 'base64'));
    const agent = getAgentKeypair();
    const host = getHostKeypair();

    console.log("Signing with Master Agent (Payer) + Master Host (Static)");

    // Sign with Agent (Master Payer)
    tx.partialSign(agent);
    
    // Attempt Host Sign (if needed by instruction, e.g. for seeds derivation if not using stored seeds)
    // Even if using stored seeds, passing a valid signature from the correct host is good practice if required.
    try {
        tx.partialSign(host);
    } catch (e) {
        // Ignore if host is not a required signer
    }

    return tx.serialize().toString('base64');
}

export async function recycleFundsServer(): Promise<string | null> {
    try {
        const host = getHostKeypair();
        const agentPubkey = getAgentKeypair().publicKey;
        
        const conn = new Connection("https://api.devnet.solana.com", "confirmed");
        
        const hostToken = getAssociatedTokenAddressSync(USDC_DEVNET, host.publicKey);
        const agentToken = getAssociatedTokenAddressSync(USDC_DEVNET, agentPubkey);

        const account = await getAccount(conn, hostToken);
        const amount = account.amount;

        if (amount <= BigInt(0)) return null;

        const ix = createTransferInstruction(
            hostToken,
            agentToken,
            host.publicKey,
            amount
        );

        const tx = new Transaction().add(ix);
        tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
        tx.feePayer = host.publicKey;
        tx.sign(host);

        const sig = await conn.sendRawTransaction(tx.serialize());
        await conn.confirmTransaction(sig, "confirmed");
        return sig;
    } catch (e) {
        console.error("Recycle failed:", e);
        return null;
    }
}
