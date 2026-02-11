"use client";

import { useState, useEffect, useRef } from "react";
import { Connection, PublicKey, Transaction, VersionedTransaction, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { PayStreamClient, USDC_DEVNET, PAYSTREAM_PROGRAM_ID } from "../utils/magic";
import { executeTick, createTickTx } from "../utils/paystream";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import idl from "../types/paystream_idl.json";
import { Geist, Geist_Mono } from "next/font/google";
import { getAgentPublicKey, getHostPublicKey, signTransactionServer, recycleFundsServer } from "./actions";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Mock USDC Mint for Testnet (placeholder)
const USDC_TESTNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// Server-Connected Wallet Adapter for Agent (Legacy - kept for reference if needed elsewhere)
class ServerWallet {
    publicKey: PublicKey;
    
    constructor(publicKey: PublicKey) {
        this.publicKey = publicKey;
    }

    async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
        if (tx instanceof Transaction) {
            // Serialize the transaction to base64 to send to server
            const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
            
            // Call Server Action to sign (Legacy flow without workerId)
            const signedBase64 = await signTransactionServer(serialized);

            // Deserialize back to Transaction object
            return Transaction.from(Buffer.from(signedBase64, 'base64')) as T;
        }
        throw new Error("VersionedTransaction not yet supported in ServerWallet");
    }

    async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
        return Promise.all(txs.map(t => this.signTransaction(t)));
    }
}

export default function Home() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [logs, setLogs] = useState<Array<{ time: string, message: string, link?: string }>>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [agentPubkey, setAgentPubkey] = useState<PublicKey | null>(null);
  const [hostPubkey, setHostPubkey] = useState<PublicKey | null>(null);
  const [erSessionId, setErSessionId] = useState<string | null>(null);
  const [network, setNetwork] = useState<'devnet' | 'testnet'>('devnet');
  const [isLoading, setIsLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(69);
  const [cost, setCost] = useState(0.00);
  const [isRealMode, setIsRealMode] = useState(true);
  const [workerId, setWorkerId] = useState<number | null>(null);

  const addLog = (message: string, link?: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ time, message, link }, ...prev]);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    addLog(`[System] Copied ${label} to clipboard`);
  };

  const fetchBalances = async () => {
    setIsLoading(true);
    try {
      const agentKey = await getAgentPublicKey();
      const hostKey = await getHostPublicKey();
      
      if (!agentPubkey || agentPubkey.toBase58() !== agentKey) {
        setAgentPubkey(new PublicKey(agentKey));
      }
      if (!hostPubkey || hostPubkey.toBase58() !== hostKey) {
        setHostPubkey(new PublicKey(hostKey));
      }

      const rpc = network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.testnet.solana.com';
      const conn = new Connection(rpc, 'confirmed');
      const pubKey = new PublicKey(agentKey);

      // 1. SOL Balance
      const bal = await conn.getBalance(pubKey);
      setBalance(bal / LAMPORTS_PER_SOL);

      // 2. USDC Balance (SPL Token)
      try {
        const usdcMint = network === 'devnet' ? USDC_DEVNET : USDC_TESTNET;
        
        // Get ATA
        const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pubKey, { mint: usdcMint });
        
        if (tokenAccounts.value.length > 0) {
            const usdcAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            setUsdcBalance(usdcAmount);
        } else {
            setUsdcBalance(0);
        }
      } catch (e) {
        console.warn("Failed to fetch USDC balance", e);
        setUsdcBalance(0);
      }
      
    } catch (e) {
      // Suppress 429 errors from logging to console to reduce noise
      const errMessage = e instanceof Error ? e.message : String(e);
      if (!errMessage.includes("429")) {
        console.error("Failed to fetch balances:", e);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchBalances();
  }, [network]);

  // Poll Balances
  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [network]);

  // Payment Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isStreaming) {
      interval = setInterval(async () => {
        try {
          const transferAmount = 0.001;
          setCost((c) => c + transferAmount);

          if (isRealMode && agentPubkey && hostPubkey) {
            
            // Derive Session PDA
            const [sessionPda] = PublicKey.findProgramAddressSync(
              [Buffer.from("session_v1"), agentPubkey.toBuffer(), hostPubkey.toBuffer()],
              PAYSTREAM_PROGRAM_ID
            );
            
            // Initialize ER Provider
            const erRpc = "https://devnet-as.magicblock.app";
            const erConnection = new Connection(erRpc, "confirmed");
            
            const dummyWallet = { 
                publicKey: agentPubkey, 
                signTransaction: async (t: Transaction) => t, 
                signAllTransactions: async (t: Transaction[]) => t 
            };
            const erProvider = new AnchorProvider(erConnection, dummyWallet as any, {});
            const erProgram = new Program(idl as any, erProvider);

            // 1. Create Transaction
            const tickTx = await createTickTx(
              erProgram, 
              sessionPda, 
              hostPubkey,
              USDC_DEVNET
            );

            // 2. Sign with Agent (Server-Side)
            tickTx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
            tickTx.feePayer = agentPubkey;
            
            const serializedTx = tickTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
            const signedTxBase64 = await signTransactionServer(serializedTx);
            const signedTx = Transaction.from(Buffer.from(signedTxBase64, 'base64'));

            // 3. Send to Ephemeral Rollup
            const sig = await erConnection.sendRawTransaction(signedTx.serialize());
            await erConnection.confirmTransaction(sig, "confirmed");
            
            addLog(`[ER-Tick] Payment Sent: ${transferAmount} USDC`);
            
          } else {
            // Sim mode logic
            if (Math.random() > 0.7) {
              addLog(`[Sim-Tick] Transfer ${transferAmount} USDC to Host`);
            }
          }

          // AI Analysis visual feedback
          const time = videoRef.current?.currentTime || 0;
          if (time > 10 && time < 12) {
             addLog("[Sentry-AI] ALERT: Red Car Detected!");
          }
        } catch (e) {
          const errStr = e instanceof Error ? e.message : String(e);
          if (errStr.includes("429")) {
            // Rate limited - skip tick log
            console.warn("Rate Limited (Skipping Tick)");
          } else {
            console.error("Tick error:", e);
            addLog(`[Error] Tick failed: ${errStr}`);
          }
        }
      }, 1000); // 1s per tick (ER is fast!)
    }
    return () => clearInterval(interval);
  }, [isStreaming, agentPubkey, hostPubkey, isRealMode, network, workerId]);

  const toggleStream = async () => {
    if (isRealMode) {
      if (!agentPubkey) {
        addLog("Error: Agent Wallet not loaded. Check server logs.");
        return;
      }
    }

    if (!isStreaming) {
      // STARTING
      setIsStreaming(true);
      setTimeLeft(69); // Reset Timer
      videoRef.current?.play();
      addLog("------------------------------------------------");
      
      if (isRealMode && agentPubkey) {
        addLog(`[System] REAL MODE ACTIVE (${network})`);
        addLog(`[Step 1] Initializing L1 Stream Accounts...`);
        
        try {
          const rpc = network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.testnet.solana.com';
          const conn = new Connection(rpc, 'confirmed');
          
          // Use PayStreamClient directly (keys managed by server pool)
          const client = new PayStreamClient(conn);
          
          // Create session (Delegation)
          addLog(`[Step 2] Delegating to Ephemeral Rollup...`);
          const sessionInfo = await client.createSession();
          
          setErSessionId(sessionInfo.sessionPda.toBase58());
          setWorkerId(null); // No worker ID in new architecture
          
          addLog(`[MagicBlock] Session Established!`, `https://explorer.solana.com/address/${sessionInfo.sessionPda.toBase58()}?cluster=devnet`);
          addLog(`[Info] State is now delegated to ER. Gas fees are 0.`);
          addLog(`[Info] Using Master Session (Reused if available).`);

        } catch (e) {
          console.error("Session init error:", e);
          addLog(`[Error] Session Init Failed: ${(e as Error).message}`);
          setIsStreaming(false);
          videoRef.current?.pause();
        }
      } else {
        const newSessionId = "er_" + Math.random().toString(36).substr(2, 9);
        setErSessionId(newSessionId);
        addLog(`[System] Initializing Ephemeral Rollup Session (Simulated)...`);
        
        setTimeout(() => {
          addLog(`[MagicBlock] ER Established. ID: ${newSessionId}`);
          addLog(`[Payment] Stream Started. Rate: 0.001 USDC/s`);
        }, 800);
      }
    } else {
      // STOPPING
      setIsStreaming(false);
      videoRef.current?.pause();
      
      if (isRealMode && agentPubkey && erSessionId) {
        addLog(`[System] Closing Stream Session (Local)...`);
        // In Check-Reuse mode, we just clear local state.
        // The session remains valid on-chain for reuse.
        addLog(`[System] Stream Stopped.`);
      } else {
        addLog(`[System] Stream Stopped.`);
      }
      setErSessionId(null);
      setWorkerId(null);
    }
  };

  return (
    <div className={`min-h-screen p-4 sm:p-8 font-[family-name:var(--font-geist-sans)] bg-gray-950 text-white relative ${geistSans.className} ${geistMono.className}`}>
      <div className={`fixed top-0 left-0 w-full text-[10px] sm:text-xs font-mono font-bold text-center py-2 border-b z-50 ${network === 'devnet' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
        ⚠️ ENVIRONMENT: {network.toUpperCase()} - {isLoading ? "REFRESHING..." : "LIVE DATA"}
      </div>

      <header className="flex flex-col gap-6 w-full max-w-6xl mx-auto mt-12 mb-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full text-center md:text-left">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tighter text-white">
              Project Paystream
            </h1>
            <h2 className="text-sm sm:text-lg font-medium text-green-400 mt-1">USDC Bounty Vision</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-center w-full md:w-auto">
            <div className="flex bg-gray-800 rounded p-1 border border-gray-700 w-full sm:w-auto justify-center">
              <button onClick={() => setNetwork('devnet')} className={`flex-1 sm:flex-none px-3 py-1 rounded text-xs ${network === 'devnet' ? 'bg-green-900 text-green-100' : 'text-gray-400'}`}>Devnet</button>
              <button onClick={() => setNetwork('testnet')} className={`flex-1 sm:flex-none px-3 py-1 rounded text-xs ${network === 'testnet' ? 'bg-red-900 text-red-100' : 'text-gray-400'}`}>Testnet</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          {/* Host Wallet */}
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center cursor-pointer hover:border-green-500/50 transition-colors" onClick={() => copyToClipboard(hostPubkey?.toString() || "", "Host Address")}>
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm text-gray-400">
                🏢 Project Wallet (Host)
              </span>
              <span className="font-mono text-xs sm:text-sm text-gray-300 truncate w-32 sm:w-64">
                {hostPubkey ? hostPubkey.toString() : "Loading..."}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs sm:text-sm font-bold text-green-400 block">{balance !== null ? balance.toFixed(4) : "0.00"} SOL</span>
              <span className="text-[10px] sm:text-xs text-gray-500">$0.00</span>
            </div>
          </div>

          {/* Agent Wallet */}
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center cursor-pointer hover:border-green-500/50 transition-colors" onClick={() => copyToClipboard(agentPubkey?.toString() || "", "Agent Address")}>
            <div className="flex flex-col">
              <span className="text-xs sm:text-sm text-gray-400">
                🤖 AI Agent (Payer)
              </span>
              <span className="font-mono text-xs sm:text-sm text-gray-300 truncate w-32 sm:w-64">
                {agentPubkey ? agentPubkey.toString() : "Loading..."}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs sm:text-sm font-bold text-blue-400 block">{usdcBalance !== null ? usdcBalance.toFixed(2) : "0.00"} USDC</span>
              <span className="text-[10px] sm:text-xs text-gray-500">Auto-Refill</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-8 items-center sm:items-start w-full max-w-6xl mx-auto">
        {/* Video Player Section */}
        <section className="w-full bg-black rounded-xl overflow-hidden shadow-2xl relative border border-gray-800">
          <div className="aspect-video relative">
            <video ref={videoRef} className="w-full h-full object-cover" src="/assets/demo-feed.mp4" playsInline loop muted />
            
            {/* Overlay UI */}
            <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm px-3 py-1 rounded text-xs font-mono border border-gray-700">
              <span className="text-green-400">● LIVE</span> {isStreaming ? "STREAMING" : "STANDBY"}
            </div>

            {/* AI Bounding Box Simulation */}
            {isStreaming && (
              <div className="absolute top-1/4 left-1/4 w-32 h-32 border-2 border-red-500/70 rounded-lg animate-pulse pointer-events-none">
                <div className="absolute -top-6 left-0 bg-red-500 text-white text-[10px] px-1 font-bold">
                  OBJECT: CAR (98%)
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="p-4 bg-gray-900 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button onClick={toggleStream} className={`px-6 py-2 rounded-full font-bold transition-all ${isStreaming ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-black`} >
                {isStreaming ? "Stop Stream" : "Start Stream"}
              </button>
              <div className="flex flex-col">
                <span className="text-xs text-gray-400">Session Status</span>
                <span className={`text-sm font-mono ${erSessionId ? 'text-green-400' : 'text-gray-500'}`}>
                  {erSessionId ? "⚡ ER ACTIVE" : "IDLE"}
                </span>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <span className="block text-xs text-gray-400">Total Cost</span>
              <span className="text-xl font-mono text-green-400">${cost.toFixed(4)}</span>
            </div>
          </div>
        </section>

        {/* Logs Console */}
        <section className="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs">
          <div className="flex justify-between items-center mb-2 sticky top-0 bg-gray-950 pb-2 border-b border-gray-800">
            <h3 className="font-bold text-gray-400">SYSTEM LOGS</h3>
            <span className="text-gray-600">{logs.length} events</span>
          </div>
          <div className="flex flex-col gap-1">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-600">[{log.time}]</span>
                <span className={log.message.includes("Error") ? "text-red-400" : log.message.includes("MagicBlock") ? "text-purple-400" : "text-gray-300"}>
                  {log.message}
                  {log.link && (
                    <a href={log.link} target="_blank" rel="noreferrer" className="ml-2 text-blue-400 hover:underline">
                      [View Tx]
                    </a>
                  )}
                </span>
              </div>
            ))}
            {logs.length === 0 && <span className="text-gray-700 italic">Waiting for stream to start...</span>}
          </div>
        </section>

        {/* Explainer / FAQ */}
        <section className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 mb-12">
          {/* Row 1: The Core Tech */}
          <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800">
            <h3 className="font-bold text-green-400 mb-2 text-sm">Q: Is an Ephemeral Rollup just a "state channel"?</h3>
            <p className="text-sm text-gray-400 leading-relaxed">No, it's <strong className="text-white">State Delegation</strong>. Like moving a Google Doc to the cloud to type privately, then printing the PDF to L1. The state exists independently of the user once delegated.</p>
          </div>
          <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800">
            <h3 className="font-bold text-red-400 mb-2 text-sm">Q: Can the Payer rug the Host?</h3>
            <p className="text-sm text-gray-400 leading-relaxed">No. Funds are locked in the <strong>Vault PDA</strong> on L1 immediately. The Program enforces that the Host is paid the accumulated amount tracked by the Ephemeral Rollup before any refund is issued to the Payer.</p>
          </div>
          <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800">
            <h3 className="font-bold text-purple-400 mb-2 text-sm">Q: Can I close the browser safely?</h3>
            <p className="text-sm text-gray-400 leading-relaxed">Yes! It's "fire and forget" for payments. If one packet (transaction) drops, the stream continues. The state is on the ER, not your browser.</p>
          </div>

          {/* Row 2: The Market Strategy */}
          <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800">
            <h3 className="font-bold text-blue-400 mb-2 text-sm">Q: Who is the target market?</h3>
            <p className="text-sm text-gray-400 leading-relaxed">Two worlds: <strong className="text-white">AI Agents</strong> paying for millisecond-latency data (e.g., CCTV feeds) and <strong className="text-white">Human Creators</strong> earning pay-per-second revenue without forcing monthly subscriptions.</p>
          </div>
          <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800">
            <h3 className="font-bold text-yellow-400 mb-2 text-sm">Q: Why USDC instead of SOL?</h3>
            <p className="text-sm text-gray-400 leading-relaxed"><strong className="text-white">The "Gas Barrier".</strong> Corporations and normal users want to pay in Dollars, not volatile tokens. PayStream abstracts gas (Host-sponsored), creating pure USDC flows that keep CFOs happy.</p>
          </div>
          <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800">
            <h3 className="font-bold text-cyan-400 mb-2 text-sm">Q: Can multiple people subscribe to one Host?</h3>
            <p className="text-sm text-gray-400 leading-relaxed">Yes. The architecture is <strong className="text-white">Many-to-One</strong>. A single Host (e.g., a high-value API) can accept thousands of concurrent streams. The ER aggregates state, and settlement happens atomically per session.</p>
          </div>

          {/* Row 3: Technical Robustness */}
          <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800">
            <h3 className="font-bold text-orange-400 mb-2 text-sm">Q: Scale vs Payment Channels?</h3>
            <p className="text-sm text-gray-400 leading-relaxed">Payment channels require 1-to-1 liveness (both signing). PayStream allows <strong className="text-white">passive reception</strong>. The Host doesn't sign every tick; the ER verifies the Payer autonomously.</p>
          </div>
          <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800">
            <h3 className="font-bold text-emerald-400 mb-2 text-sm">Q: Is it truly "Zero Gas"?</h3>
            <p className="text-sm text-gray-400 leading-relaxed">For the streaming phase, <strong className="text-white">yes</strong>. The Payer signs data packets, not L1 transactions. The L1 settlement cost is paid <em>once</em> at the end by the Host, amortized over thousands of ticks.</p>
          </div>
          <div className="bg-gray-900/30 p-4 rounded-xl border border-gray-800">
            <h3 className="font-bold text-pink-400 mb-2 text-sm">Q: What if the Ephemeral Rollup goes down?</h3>
            <p className="text-sm text-gray-400 leading-relaxed"><strong className="text-white">L1 Security Guarantee.</strong> The state on the ER can be "undelegated" back to Solana L1. No funds are lost; the accumulated balance is preserved and settled on the base layer.</p>
          </div>
        </section>

      </main>
    </div>
  );
}
