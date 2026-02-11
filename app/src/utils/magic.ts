import { Connection, PublicKey, Transaction, Keypair, VersionedTransaction } from "@solana/web3.js";
import { 
    delegateBufferPdaFromDelegatedAccountAndOwnerProgram, 
    delegationRecordPdaFromDelegatedAccount, 
    delegationMetadataPdaFromDelegatedAccount, 
    DELEGATION_PROGRAM_ID, 
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idl from "../types/paystream_idl.json";
import { signTransactionServer, getAgentPublicKey, getHostPublicKey } from "@/app/actions";

export const PAYSTREAM_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PAYSTREAM_PROGRAM_ID || "9vuRDYCkXmYx7vkfxzEm4biKEVyqShfSbAik1uK3y72t");
export const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// Minimal Wallet interface for AnchorProvider
class ReadOnlyWallet implements Wallet {
    constructor(public publicKey: PublicKey) {}

    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
        return tx;
    }

    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
        return txs;
    }

    get payer() {
        return new Keypair(); // Dummy
    }
}

export class PayStreamClient {
    connection: Connection;
    provider: AnchorProvider;
    program: Program;

    // Session State
    agentPubkey: PublicKey | null = null;
    hostPubkey: PublicKey | null = null;
    sessionPda: PublicKey | null = null;

    constructor(connection: Connection) {
        this.connection = connection;
        const dummyWallet = new ReadOnlyWallet(PublicKey.default);
        this.provider = new AnchorProvider(connection, dummyWallet, {});
        
        // Monkey-patch IDL
        const initInstr = idl.instructions.find(i => i.name === 'initializeStream');
        if (initInstr) {
            initInstr.accounts.forEach((acc: any) => {
                if (acc.name === 'session' || acc.name === 'vault') {
                    acc.isSigner = false;
                }
            });
        }
        
        this.program = new Program(idl as any, this.provider);
    }

    async createSession() {
        console.log("Initializing Session (Check-Reuse Mode)...");

        const masterAgentStr = await getAgentPublicKey();
        const masterHostStr = await getHostPublicKey();

        this.agentPubkey = new PublicKey(masterAgentStr);
        this.hostPubkey = new PublicKey(masterHostStr);
        
        console.log(`Agent (Master): ${this.agentPubkey.toBase58()}`);
        console.log(`Host (Master): ${this.hostPubkey.toBase58()}`);

        // 1. Derive Session PDA
        const [sessionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("session_v1"), this.agentPubkey.toBuffer(), this.hostPubkey.toBuffer()],
            PAYSTREAM_PROGRAM_ID
        );
        this.sessionPda = sessionPda;
        console.log(`Session PDA: ${sessionPda.toBase58()}`);

        // 2. Check Existence
        let isInitialized = false;
        try {
            // Use fetchNullable to avoid throwing if not found
            // Cast to any to bypass strict type check for now if needed
            const account = await (this.program.account as any).streamSession.fetchNullable(sessionPda);
            if (account) {
                console.log("Session Account already exists. Reusing...");
                isInitialized = true;
            } else {
                console.log("Session Account does not exist. Will initialize.");
            }
        } catch (e) {
            console.warn("Failed to fetch session state, assuming not initialized:", e);
        }

        const tx1 = new Transaction();

        // 3. Initialize Stream (L1) - Only if not exists
        if (!isInitialized) {
            const [vaultPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), sessionPda.toBuffer()],
                PAYSTREAM_PROGRAM_ID
            );
            
            const payerToken = getAssociatedTokenAddressSync(USDC_DEVNET, this.agentPubkey!);
            
            const initIx = await this.program.methods
                .initializeStream(new BN(1000), new BN(1000000))
                .accounts({
                    session: sessionPda,
                    vault: vaultPda,
                    payer: this.agentPubkey,
                    host: this.hostPubkey,
                    mint: USDC_DEVNET,
                    payerToken: payerToken,
                    systemProgram: PublicKey.default,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    rent: new PublicKey("SysvarRent111111111111111111111111111111111")
                })
                .instruction();
                
            // Ensure no unexpected signers on PDAs
            initIx.keys.forEach(key => {
                if (key.pubkey.equals(sessionPda) || key.pubkey.equals(vaultPda)) {
                    key.isSigner = false;
                }
            });
            
            tx1.add(initIx);
        }

        // 4. Delegate to Ephemeral Rollup (L1) - VIA CPI
        const delegationRecordPda = delegationRecordPdaFromDelegatedAccount(sessionPda);
        let isDelegated = false;

        try {
            const delegationInfo = await this.connection.getAccountInfo(delegationRecordPda);
            isDelegated = delegationInfo !== null;
        } catch (e) {
            console.warn("Failed to check delegation status", e);
        }

        if (!isDelegated) {
            console.log("Delegation Record not found. Delegating...");
            try {
                const bufferPda = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(sessionPda, PAYSTREAM_PROGRAM_ID);
                const delegationMetadataPda = delegationMetadataPdaFromDelegatedAccount(sessionPda);

                const delegateIx = await this.program.methods
                    .delegate()
                    .accounts({
                        payer: this.agentPubkey,
                        pda: sessionPda,
                        host: this.hostPubkey,
                        ownerProgram: PAYSTREAM_PROGRAM_ID,
                        buffer: bufferPda,
                        delegationRecord: delegationRecordPda,
                        delegationMetadata: delegationMetadataPda,
                        delegationProgram: DELEGATION_PROGRAM_ID,
                        systemProgram: PublicKey.default,
                    })
                    .instruction();

                delegateIx.keys.forEach(key => {
                    if (key.pubkey.equals(sessionPda)) {
                        key.isSigner = false;
                    }
                });

                tx1.add(delegateIx);
            } catch (e) {
                console.warn("Error creating delegate instruction:", e);
                throw e;
            }
        } else {
            console.log("Session is already delegated. Skipping delegation step.");
        }

        if (tx1.instructions.length === 0) {
            console.log("Session is fully ready (Initialized & Delegated). No transaction needed.");
            return { sessionPda, hostPubkey: this.hostPubkey, workerId: null };
        }

        // 5. Sign with Master Agent (Server-Side)
        tx1.recentBlockhash = (await this.connection.getLatestBlockhash()).blockhash;
        tx1.feePayer = this.agentPubkey!;
        
        const serializedTx = tx1.serialize({ requireAllSignatures: false }).toString('base64');
        console.log("Signing initialization/delegation transaction...");
        
        const signedTxBase64 = await signTransactionServer(serializedTx); // No workerId needed
        const signedTx = Transaction.from(Buffer.from(signedTxBase64, 'base64'));
        
        console.log("Sending transaction...");
        try {
            const sig = await this.connection.sendRawTransaction(signedTx.serialize());
            await this.connection.confirmTransaction(sig, "confirmed");
            console.log("Transaction Success:", sig);
        } catch (e: any) {
            console.error("Transaction Failed:", e);
            throw e;
        }

        return { sessionPda, hostPubkey: this.hostPubkey, workerId: null };
    }

    async closeSession() {
        console.log("Ending session (Local State Clear)...");
        this.agentPubkey = null;
        this.hostPubkey = null;
        this.sessionPda = null;
    }
}
