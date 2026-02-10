"use client";
import bs58 from "bs58";
import { useState, useEffect, useRef } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { PayStreamClient } from "@/utils/magic";
import { getDemoHostWallet } from "@/utils/demo_host";
import { executeTick } from "@/utils/paystream";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import idl from "../types/paystream_idl.json";

class SimpleWallet {
  constructor(readonly payer: Keypair) {}
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      tx.partialSign(this.payer);
    } else {
      tx.sign([this.payer]);
    }
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return txs.map((t) => {
      if (t instanceof Transaction) {
        t.partialSign(this.payer);
      } else {
        t.sign([this.payer]);
      }
      return t;
    });
  }
  get publicKey() {
    return this.payer.publicKey;
  }
}

const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
// Fallback for testnet if distinct, otherwise use same or config
const USDC_TESTNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); 

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  
  // UI State
  const [isStreaming, setIsStreaming] = useState(false);
  // Default to Agent Mode (Theatre)
  const [isAgentMode, setIsAgentMode] = useState(true);
  const [isRealMode, setIsRealMode] = useState(false);
  const [network, setNetwork] = useState<"devnet" | "testnet">("devnet");
  const [isLoading, setIsLoading] = useState(false);
  
  // Data State
  const [logs, setLogs] = useState<string[]>([]);
  const [cost, setCost] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Simulation State
  const [erSessionId, setErSessionId] = useState<string | null>(null);
  
  // Balances
  const [agentSol, setAgentSol] = useState(0);
  const [agentUsdc, setAgentUsdc] = useState(0);
  const [hostSol, setHostSol] = useState(0);
  const [hostUsdc, setHostUsdc] = useState(0);

  // Agent Identity
  const [agentWallet] = useState(() => {
    const envKey = process.env.NEXT_PUBLIC_AGENT_WALLET_KEY;
    if (envKey) {
      try {
        return Keypair.fromSecretKey(bs58.decode(envKey));
      } catch (e) {
        console.error("Failed to load agent wallet from env:", e);
      }
    }
    return Keypair.generate();
  });
  
  // Demo Host Identity (for Theatre Mode)
  const [demoHostWallet] = useState(getDemoHostWallet());

  const addLog = (msg: string) => setLogs((prev) => [msg, ...prev].slice(0, 15));
  
  const copyToClipboard = (text: string, label: string) => {
      navigator.clipboard.writeText(text);
      addLog(`${label} copied to clipboard!`);
  };

  // Balance Fetcher
  const fetchBalances = async () => {
    setIsLoading(true);
    // Reset balances immediately when fetching to avoid stale data during switch
    // Optional: setAgentSol(0); setAgentUsdc(0); setHostSol(0); setHostUsdc(0);
    // But better to just let them update or fail-safe.
    
    try {
      const rpc = network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.testnet.solana.com';
      const conn = new Connection(rpc, 'confirmed');
      const usdcMint = network === 'devnet' ? USDC_DEVNET : USDC_TESTNET;

      // 1. Agent Balances (Real)
      const agSol = await conn.getBalance(agentWallet.publicKey);
      setAgentSol(agSol / LAMPORTS_PER_SOL);

      const agTokens = await conn.getParsedTokenAccountsByOwner(agentWallet.publicKey, { mint: usdcMint });
      const agUsdcVal = agTokens.value[0]?.account.data.parsed.info.tokenAmount.uiAmount || 0;
      setAgentUsdc(agUsdcVal);

      // 2. Host Balances (Real or Demo)
      let hostPubkey = demoHostWallet.publicKey;
      if (wallet.connected && wallet.publicKey) {
         hostPubkey = wallet.publicKey;
      }
      
      const hSol = await conn.getBalance(hostPubkey);
      setHostSol(hSol / LAMPORTS_PER_SOL);

      const hTokens = await conn.getParsedTokenAccountsByOwner(hostPubkey, { mint: usdcMint });
      const hUsdcVal = hTokens.value[0]?.account.data.parsed.info.tokenAmount.uiAmount || 0;
      setHostUsdc(hUsdcVal);

    } catch (e) {
      console.error("Balance fetch error:", e);
      // On error, we should probably set to 0 or indicate error, 
      // but if it's just a blip, maybe keep old? 
      // User complaint "shows same" implies stale data persistence is bad.
      setAgentSol(0);
      setAgentUsdc(0);
      setHostSol(0);
      setHostUsdc(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Poll Balances
  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 5000);
    return () => clearInterval(interval);
  }, [network, wallet.connected, agentWallet]);

  // Payment Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStreaming) {
      interval = setInterval(async () => {
        try {
          const transferAmount = 0.001;
          setCost((c) => c + transferAmount);
          
          if (isRealMode) {
              const rpc = network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.testnet.solana.com';
              const conn = new Connection(rpc, 'confirmed');
              const usdcMint = network === 'devnet' ? USDC_DEVNET : USDC_TESTNET;
              
              // Setup Provider for Agent
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const provider = new AnchorProvider(conn, new SimpleWallet(agentWallet) as any, {});
              // @ts-expect-error Program constructor signature varies by version
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const program = new Program(idl as any, new PublicKey(process.env.NEXT_PUBLIC_PAYSTREAM_PROGRAM_ID || "933eFioPwpQC5PBrC2LaDxdfAZ3StwpMAeXzeAhDW9zp"), provider);

              // Derive session (assuming created in toggleStream)
              const [sessionPda] = PublicKey.findProgramAddressSync(
                  [Buffer.from("session"), agentWallet.publicKey.toBuffer(), agentWallet.publicKey.toBuffer()],
                  program.programId
              );

              // Execute Tick
              const hostPubkey = wallet.connected && wallet.publicKey ? wallet.publicKey : demoHostWallet.publicKey;
              const tx = await executeTick(program, sessionPda, hostPubkey, usdcMint);
              addLog(`[ER-Tick] TX: ${tx.slice(0, 8)}... | ${transferAmount} USDC`);
          } else {
             // Sim mode logic
             if (Math.random() > 0.7) {
                addLog(`[Sim-Tick] Transfer ${transferAmount} USDC to Host`);
             }
          }

          if (isAgentMode) {
            const time = videoRef.current?.currentTime || 0;
            if (time > 10 && time < 12) {
              addLog("[Sentry-AI] ALERT: Red Car Detected!");
            }
          }
        } catch (e) {
          console.error("Tick error:", e);
          addLog(`[Error] Tick failed: ${(e as Error).message}`);
          // Don't stop streaming immediately on one failure, but warn
        }
      }, 1000); // 1 tick per second for demo visibility
    }
    return () => clearInterval(interval);
  }, [isStreaming, isAgentMode, agentWallet, isRealMode, network, wallet.connected, demoHostWallet]);

  const toggleStream = async () => {
    if (isRealMode) {
      if (!isAgentMode && !wallet.connected) {
        addLog("Error: Connect Wallet for Human Mode");
        return;
      }
      // For Agent Mode, we can start without host wallet connected (using demo host)
    }
    
    if (!isStreaming) {
      // STARTING
      setIsStreaming(true);
      videoRef.current?.play();
      addLog("------------------------------------------------");
      
      if (isRealMode) {
         addLog(`[System] REAL MODE ACTIVE (${network}): Initializing Session...`);
         // Session ID generation (Optimistic for demo)
         const sessionId = "er_" + agentWallet.publicKey.toString().slice(0, 8);
         setErSessionId(sessionId);
         addLog(`[MagicBlock] Session Ready: ${sessionId}`);
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
      addLog(`[System] Closing Stream...`);
      setErSessionId(null);
    }
  };

  const toggleAgent = () => {
    setIsAgentMode(!isAgentMode);
    if (!isStreaming) addLog(isAgentMode ? "Switched to Human Mode" : "Switched to AI Agent Mode");
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 font-[family-name:var(--font-geist-sans)] bg-gray-950 text-white relative">
      <div className={`fixed top-0 left-0 w-full text-[10px] sm:text-xs font-mono font-bold text-center py-2 border-b z-50 ${network === 'devnet' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
        ⚠️ ENVIRONMENT: {network.toUpperCase()} - {isLoading ? "REFRESHING..." : "LIVE DATA"}
      </div>

      <header className="flex flex-col gap-6 w-full max-w-6xl mx-auto mt-12 mb-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 w-full text-center md:text-left">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tighter text-white">
              Project <span className="text-green-400">BountyVision</span>
            </h1>
            <h2 className="text-sm sm:text-lg font-medium text-white/90 mt-1">Powered by USDC PayStream</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-center w-full md:w-auto">
            <div className="flex bg-gray-800 rounded p-1 border border-gray-700 w-full sm:w-auto justify-center">
                <button onClick={() => setNetwork('devnet')} className={`flex-1 sm:flex-none px-3 py-1 rounded text-xs ${network === 'devnet' ? 'bg-green-900 text-green-100' : 'text-gray-400'}`}>Devnet</button>
                <button onClick={() => setNetwork('testnet')} className={`flex-1 sm:flex-none px-3 py-1 rounded text-xs ${network === 'testnet' ? 'bg-red-900 text-red-100' : 'text-gray-400'}`}>Testnet</button>
            </div>
            {wallet.connected && (
              <button onClick={toggleAgent} className={`w-full sm:w-auto px-4 py-2 rounded text-sm font-mono border ${isAgentMode ? 'bg-green-900 border-green-500 text-green-100' : 'border-gray-700 hover:bg-gray-800'}`}>
                {isAgentMode ? "🤖 Agent Mode" : "👤 Manual Mode"}
              </button>
            )}
            <div className="w-full sm:w-auto flex justify-center"><WalletMultiButton /></div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          {/* Host Wallet */}
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center cursor-pointer hover:border-green-500/50 transition-colors"
               onClick={() => copyToClipboard(wallet.connected && wallet.publicKey ? wallet.publicKey.toString() : demoHostWallet.publicKey.toString(), "Host Address")}>
            <div className="flex flex-col">
                 <span className="text-xs sm:text-sm text-gray-400">
                  {wallet.connected ? "🏢 Project Wallet (Host)" : "🎭 Demo Host"}
                </span>
                <span className="text-[10px] text-gray-600 truncate max-w-[120px] sm:max-w-none">
                    {(wallet.connected && wallet.publicKey ? wallet.publicKey : demoHostWallet.publicKey).toString().slice(0, 6)}...{(wallet.connected && wallet.publicKey ? wallet.publicKey : demoHostWallet.publicKey).toString().slice(-4)}
                </span>
            </div>
            <div className="text-right">
                 <div className="font-mono text-green-400 text-sm sm:text-base">{hostUsdc.toFixed(2)} USDC</div>
                 <div className="text-[10px] text-gray-500">{hostSol.toFixed(4)} SOL</div>
            </div>
          </div>
          
          {/* Agent Wallet */}
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center cursor-pointer hover:border-blue-500/50 transition-colors"
               onClick={() => copyToClipboard(agentWallet.publicKey.toString(), "Agent Address")}>
            <div className="flex flex-col">
                <span className="text-xs sm:text-sm text-gray-400">🤖 Agent Tester Wallet</span>
                <span className="text-[10px] text-gray-600 truncate max-w-[120px] sm:max-w-none">
                  {agentWallet.publicKey.toString().slice(0, 6)}...{agentWallet.publicKey.toString().slice(-4)}
                </span>
            </div>
            <div className="text-right">
              {isLoading ? (
                  <span className="text-xs animate-pulse text-blue-400">Fetching...</span>
              ) : (
                  <>
                    <div className="font-mono text-blue-400 text-sm sm:text-base">{agentUsdc.toFixed(2)} USDC</div>
                    <div className="text-[10px] text-gray-500">{agentSol.toFixed(4)} SOL</div>
                  </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-8 w-full max-w-6xl mx-auto">
        {/* Funding Instructions */}
        <div className="w-full bg-blue-900/20 border border-blue-800/50 p-4 rounded-lg flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-center md:text-left">
             <div className="flex flex-col sm:flex-row items-center gap-2 text-blue-200">
                 <span className="text-xl">ℹ️</span>
                 <span>To run the demo, please fund these wallets on <strong>{network.toUpperCase()}</strong>:</span>\n             </div>\n             <div className=\"flex flex-col sm:flex-row gap-4 font-mono text-xs w-full md:w-auto\">\n                 <div className=\"bg-black/40 px-3 py-2 rounded flex flex-col w-full sm:w-auto\">\n                     <span className=\"text-gray-500 mb-1\">HOST ADDRESS</span>\n                     <span className=\"text-white select-all break-all sm:break-normal\">{(wallet.connected && wallet.publicKey ? wallet.publicKey : demoHostWallet.publicKey).toString()}</span>\n                 </div>\n                 <div className=\"bg-black/40 px-3 py-2 rounded flex flex-col w-full sm:w-auto\">\n                     <span className=\"text-gray-500 mb-1\">AGENT ADDRESS</span>\n                     <span className=\"text-white select-all break-all sm:break-normal\">{agentWallet.publicKey.toString()}</span>\n                 </div>\n             </div>\n        </div>\n\n        <div className=\"grid grid-cols-1 lg:grid-cols-3 gap-8 w-full\">\n          {/* Control Panel */}\n          <div className=\"flex flex-col gap-4 p-6 bg-gray-900 rounded-xl border border-gray-800 h-fit order-2 lg:order-1\">\n            <h2 className=\"text-xl font-bold mb-4\">Control Center</h2>\n            <div className=\"flex justify-between items-center bg-black/50 p-4 rounded-lg\">\n              <span className=\"text-gray-400\">Status</span>\n              <span className={`font-mono font-bold ${isStreaming ? 'text-green-400 animate-pulse' : 'text-red-400'}`}>\n                {isStreaming ? \"STREAMING\" : \"OFFLINE\"}\n              </span>\n            </div>\n            <div className=\"flex justify-between items-center bg-black/50 p-4 rounded-lg\">\n              <span className=\"text-gray-400\">Session Cost</span>\n              <span className=\"font-mono text-xl text-yellow-400\">${cost.toFixed(4)}</span>\n            </div>\n            \n            <div className=\"flex items-center gap-2 mt-4 p-2 bg-gray-800 rounded border border-gray-700\">\n                <input type=\"checkbox\" id=\"realMode\" checked={isRealMode} onChange={(e) => setIsRealMode(e.target.checked)} className=\"w-4 h-4 text-blue-600 rounded bg-gray-700 border-gray-600\" />\n                <label htmlFor=\"realMode\" className=\"text-xs font-medium text-gray-300 cursor-pointer select-none\">Enable Real Transactions</label>\n            </div>\n\n            <button onClick={toggleStream} className={`mt-2 py-4 rounded-lg font-bold text-lg transition-all ${isStreaming ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>\n              {isStreaming ? \"STOP AGENT\" : (isRealMode ? \"START REAL STREAM\" : \"DEPLOY AGENT TESTER\")}\n            </button>\n             <p className=\"text-xs text-gray-500 text-center mt-2\">\n              {isRealMode ? `Connected to ${network.toUpperCase()}.` : \"Simulates high-frequency micro-payments.\"}\n            </p>\n          </div>\n\n          {/* Video Feed */}\n          <div className=\"lg:col-span-2 relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 group shadow-2xl order-1 lg:order-2\">\n            <video ref={videoRef} src=\"/assets/demo-feed.mp4\" loop muted playsInline className={`w-full h-full object-cover transition-all duration-700 ${isStreaming ? 'filter-none' : 'blur-xl grayscale opacity-50'}`} />\n            {!isStreaming && (\n              <div className=\"absolute inset-0 flex items-center justify-center z-10\">\n                <div className=\"bg-black/80 px-6 py-3 rounded-full border border-gray-700 backdrop-blur-md\">\n                  <span className=\"text-gray-300 font-mono text-sm sm:text-base\">🔒 Payment Required (402)</span>\n                </div>\n              </div>\n            )}\n            {isStreaming && isAgentMode && (\n              <div className=\"absolute top-4 left-4\">\n                <div className=\"flex items-center gap-2 bg-green-900/80 text-green-400 px-3 py-1 rounded border border-green-500/50 text-xs font-mono animate-pulse\">\n                  <div className=\"w-2 h-2 bg-green-500 rounded-full\"></div> AI ANALYSIS ACTIVE\n                </div>\n              </div>\n            )}\n          </div>\n        </div>\n        \n        {/* Logs */}\n        <div className=\"w-full bg-black font-mono text-xs p-4 rounded-lg border border-gray-800 h-64 overflow-y-auto order-3\">\n            <div className=\"text-gray-500 mb-2 border-b border-gray-800 pb-2 flex justify-between\">\n              <span>System Logs</span>\n              <span className=\"text-green-500\">● Live</span>\n            </div>\n            <div className=\"flex flex-col gap-1\">\n              {logs.map((log, i) => (\n                <div key={i} className=\"text-green-500/80 border-l-2 border-transparent hover:border-green-500 pl-2 transition-all\">\n                  <span className=\"text-gray-600 mr-2\">[{new Date().toLocaleTimeString()}]</span>{log}\n                </div>\n              ))}\n            </div>\n        </div>\n        \n         {/* About / Pitch Module */}\n        <div className=\"w-full grid grid-cols-1 md:grid-cols-2 gap-8 mt-8 border-t border-gray-800 pt-8 order-4\">\n          <div className=\"space-y-4\">\n            <h3 className=\"text-xl font-bold text-white\">Why USDC PayStream?</h3>\n            <p className=\"text-gray-400 leading-relaxed text-sm sm:text-base\">\n              AI Agents are the new economic actors, but they face a critical barrier: <span className=\"text-white font-medium\"> Friction</span>. Standard crypto payments (gas fees, block times) are too slow and expensive for machine-to-machine commerce.\n            </p>\n            \n            <div className=\"bg-red-900/10 p-4 rounded-lg border border-red-900/30\">\n              <h4 className=\"font-bold text-red-400 mb-2 text-sm uppercase tracking-wide\">The Paymaster Problem</h4>\n              <p className=\"text-sm text-gray-400\">\n                Traditional &quot;Gasless&quot; solutions (EVM Paymasters) are broken for high-frequency use cases. They abstract gas, but <span className=\"text-white font-bold\">someone still pays L2 fees</span> for every transaction. This makes $0.001 micro-payments economically impossible.\n              </p>\n            </div>\n\n            <div className=\"bg-gray-900/50 p-4 rounded-lg border border-gray-800\">\n              <h4 className=\"font-bold text-blue-400 mb-2\">The PayStream Solution</h4>\n              <p className=\"text-sm text-gray-300\">\n                PayStream utilizes <span className=\"text-white\">Ephemeral Rollups</span> to achieve <span className=\"text-white font-bold\">True Zero-Marginal-Cost</span>. We move the state off-chain, enabling thousands of micro-transactions per second with literally zero gas cost.\n              </p>\n            </div>\n          </div>\n          <div className=\"space-y-4\">\n            <h3 className=\"text-xl font-bold text-white\">Hackathon Track: Agentic Commerce</h3>\n            <ul className=\"space-y-3\">\n              <li className=\"flex gap-3\">\n                <div className=\"mt-1 w-6 h-6 rounded-full bg-green-900/50 flex items-center justify-center text-green-400 text-sm\">✓</div>\n                <div>\n                  <strong className=\"block text-white\">High Velocity</strong>\n                  <span className=\"text-sm text-gray-400\">Supports 1000+ micro-transactions per second per agent.</span>\n                </div>\n              </li>\n              <li className=\"flex gap-3\">\n                <div className=\"mt-1 w-6 h-6 rounded-full bg-green-900/50 flex items-center justify-center text-green-400 text-sm\">✓</div>\n                <div>\n                  <strong className=\"block text-white\">Gasless Experience</strong>\n                  <span className=\"text-sm text-gray-400\">Agents only need USDC. No need to manage SOL for gas.</span>\n                </div>\n              </li>\n              <li className=\"flex gap-3\">\n                <div className=\"mt-1 w-6 h-6 rounded-full bg-green-900/50 flex items-center justify-center text-green-400 text-sm\">✓</div>\n                <div>\n                  <strong className=\"block text-white\">Atomic Settlement</strong>\n                  <span className=\"text-sm text-gray-400\">Instant finality ensures service stops immediately if payment stops.</span>\n                </div>\n              </li>\n            </ul>\n          </div>\n        </div>\n\n        {/* FAQ Section */}\n        <div className=\"w-full mt-12 border-t border-gray-800 pt-8 order-5 pb-16\">\n            <h2 className=\"text-2xl font-bold mb-8 text-center text-white\">Advanced Mechanics (FAQ)</h2>\n            <div className=\"grid grid-cols-1 md:grid-cols-2 gap-6\">\n                <div className=\"bg-gray-900/30 p-5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors\">\n                    <h3 className=\"font-bold text-green-400 mb-2 text-sm\">Q: Is an Ephemeral Rollup just a &quot;state channel&quot;?</h3>\n                    <p className=\"text-sm text-gray-400 leading-relaxed\">No, it&apos;s <strong className=\"text-white\">State Delegation</strong>. Like moving a Google Doc to the cloud to type privately, then printing the PDF to L1. The state exists independently of the user once delegated.</p>\n                </div>\n\n                <div className=\"bg-gray-900/30 p-5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors\">\n                    <h3 className=\"font-bold text-green-400 mb-2 text-sm\">Q: Can we switch the recipient mid-stream?</h3>\n                    <p className=\"text-sm text-gray-400 leading-relaxed\"><strong className=\"text-white\">YES.</strong> Because the &quot;Session Wallet&quot; is delegated to a Program, the Program can route funds to different servers (e.g., if a Load Balancer switches video hosts) without closing the session.</p>\n                </div>\n\n                <div className=\"bg-gray-900/30 p-5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors\">\n                    <h3 className=\"font-bold text-green-400 mb-2 text-sm\">Q: Can I keep the ER open and just swap users?</h3>\n                    <p className=\"text-sm text-gray-400 leading-relaxed\"><strong className=\"text-white\">YES (The &quot;Lobby&quot; Model).</strong> Think of the ER as a Game Server. Host boots it up once. Users plug in (delegate) and unplug (undelegate). You don&apos;t have the overhead of booting a new rollup for every user.</p>\n                </div>\n\n                <div className=\"bg-gray-900/30 p-5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors\">\n                    <h3 className=\"font-bold text-green-400 mb-2 text-sm\">Q: Is this like UDP Streaming?</h3>\n                    <p className=\"text-sm text-gray-400 leading-relaxed\"><strong className=\"text-white\">YES.</strong> UDP is &quot;connectionless&quot; data streaming. PayStream is &quot;frictionless&quot; money streaming. Just like UDP drops packets if bandwidth is low, PayStream stops paying if the service stops.</p>\n                </div>\n            </div>\n        </div>\n      </main>\n    </div>\n  );\n}
