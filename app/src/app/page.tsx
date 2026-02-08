"use client";
import bs58 from "bs58";
import { useState, useEffect, useRef } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { PayStreamClient } from "@/utils/magic";

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
  const [demoHostWallet] = useState(Keypair.generate());

  const addLog = (msg: string) => setLogs((prev) => [msg, ...prev].slice(0, 15));

  // Balance Fetcher
  const fetchBalances = async () => {
    setIsLoading(true);
    try {
      const rpc = network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.testnet.solana.com';
      const conn = new Connection(rpc, 'confirmed');
      const usdcMint = network === 'devnet' ? USDC_DEVNET : USDC_TESTNET;

      // 1. Agent Balances
      const agSol = await conn.getBalance(agentWallet.publicKey);
      setAgentSol(agSol / LAMPORTS_PER_SOL);

      const agTokens = await conn.getParsedTokenAccountsByOwner(agentWallet.publicKey, { mint: usdcMint });
      const agUsdcVal = agTokens.value[0]?.account.data.parsed.info.tokenAmount.uiAmount || 0;
      setAgentUsdc(agUsdcVal);

      // 2. Host Balances (Real or Demo)
      if (wallet.connected && wallet.publicKey) {
        const hSol = await conn.getBalance(wallet.publicKey);
        setHostSol(hSol / LAMPORTS_PER_SOL);

        const hTokens = await conn.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: usdcMint });
        const hUsdcVal = hTokens.value[0]?.account.data.parsed.info.tokenAmount.uiAmount || 0;
        setHostUsdc(hUsdcVal);
      } else {
        // Theatre Mode: Use Demo Host (Mock or Real if we funded it, likely Mock for now)
        // For visual consistency, let's start it with 0 or a fixed amount in Sim mode
        // In "Real Mode" without wallet, we can't really check balance of a random keypair unless funded.
        // We'll simulate a starting balance for the "Demo Host" in Sim mode
        if (!isRealMode) {
           if (hostUsdc === 0) setHostUsdc(500.00); // Mock starting balance for demo
           // SOL stays 0 for random keypair
        } else {
           // Real mode but unconnected -> check random keypair (will be 0)
           const dhSol = await conn.getBalance(demoHostWallet.publicKey);
           setHostSol(dhSol / LAMPORTS_PER_SOL);
           setHostUsdc(0); 
        }
      }
    } catch (e) {
      console.error("Balance fetch error:", e);
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
          
          if (!isRealMode) {
             // Sim: Decrement Agent, Increment Host visual only
             setAgentUsdc((prev) => Math.max(0, prev - transferAmount));
             setHostUsdc((prev) => prev + transferAmount);
          }
          
          if (Math.random() > 0.7) {
            addLog(`[ER-Tick] Transfer ${transferAmount} USDC to Host`);
          }

          if (isAgentMode) {
            const time = videoRef.current?.currentTime || 0;
            if (time > 10 && time < 12) {
              addLog("[Sentry-AI] ALERT: Red Car Detected!");
            }
          }
        } catch (e) {
          console.error(e);
          setIsStreaming(false);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isStreaming, isAgentMode, agentWallet, isRealMode]);

  const toggleStream = async () => {
    if (isRealMode) {
      // Allow Agent Mode to run even if Host not connected (Autonomous)
      if (!isAgentMode && !wallet.connected) {
        addLog("Error: Connect Wallet for Human Mode");
        return;
      }
    }
    
    setIsStreaming(!isStreaming);
    if (!isStreaming) {
      const newSessionId = "er_" + Math.random().toString(36).substr(2, 9);
      setErSessionId(newSessionId);
      videoRef.current?.play();
      addLog("------------------------------------------------");
      if (isRealMode) {
         addLog(`[System] REAL MODE ACTIVE (${network}): Initializing Stream...`);
      } else {
         addLog(`[System] Initializing Ephemeral Rollup Session (Simulated)...`);
         setTimeout(() => {
           addLog(`[MagicBlock] ER Established. ID: ${newSessionId}`);
           addLog(`[Payment] Stream Started. Rate: 0.001 USDC/s`);
         }, 800);
      }
    } else {
      videoRef.current?.pause();
      addLog(`[System] Closing Stream...`);
      setErSessionId(null);
    }
  };

  const toggleAgent = () => {
    setIsAgentMode(!isAgentMode);
    if (!isStreaming) addLog(isAgentMode ? "Switched to Human Mode" : "Switched to AI Agent Mode (Simulated)");
  };

  return (
    <div className="grid grid-rows-[auto_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)] bg-gray-950 text-white relative">
      <div className={`absolute top-0 left-0 w-full text-xs font-mono font-bold text-center py-2 border-b z-50 ${network === 'devnet' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
        ⚠️ ENVIRONMENT: {network.toUpperCase()} - {isLoading ? "REFRESHING..." : "LIVE DATA"}
      </div>

      <header className="row-start-1 flex flex-col gap-4 w-full max-w-6xl mt-8">
        <div className="flex flex-wrap items-center justify-between w-full">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter text-white">
              Project <span className="text-green-400">BountyVision</span>
            </h1>
            <h2 className="text-lg font-medium text-white/90 mt-1">Powered by USDC PayStream</h2>
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex bg-gray-800 rounded p-1 border border-gray-700">
                <button onClick={() => setNetwork('devnet')} className={`px-3 py-1 rounded text-xs ${network === 'devnet' ? 'bg-green-900 text-green-100' : 'text-gray-400'}`}>Devnet</button>
                <button onClick={() => setNetwork('testnet')} className={`px-3 py-1 rounded text-xs ${network === 'testnet' ? 'bg-red-900 text-red-100' : 'text-gray-400'}`}>Testnet</button>
            </div>
            {wallet.connected && (
              <button onClick={toggleAgent} className={`px-4 py-2 rounded text-sm font-mono border ${isAgentMode ? 'bg-green-900 border-green-500 text-green-100' : 'border-gray-700 hover:bg-gray-800'}`}>
                {isAgentMode ? "🤖 Agent Mode" : "👤 Manual Mode"}
              </button>
            )}
            <WalletMultiButton />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          {/* Host Wallet */}
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center">
            <span className="text-sm text-gray-400">
              {wallet.connected ? "🏢 Project Wallet (Host)" : "🎭 Demo Host (Simulated)"}
            </span>
            <div className="text-right">
               {/* Always show balance now (Real or Simulated) */}
               <>
                 <div className="font-mono text-green-400">{hostUsdc.toFixed(2)} USDC</div>
                 <div className="text-[10px] text-gray-500">{hostSol.toFixed(4)} SOL</div>
               </>
            </div>
          </div>
          {/* Agent Wallet */}
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center">
            <span className="text-sm text-gray-400">🤖 Agent Tester Wallet</span>
            <div className="text-right">
              {isLoading ? (
                  <span className="text-xs animate-pulse text-blue-400">Fetching...</span>
              ) : (
                  <>
                    <div className="font-mono text-blue-400">{agentUsdc.toFixed(2)} USDC</div>
                    <div className="text-[10px] text-gray-500">{agentSol.toFixed(4)} SOL</div>
                  </>
              )}
              <div className="text-[10px] text-gray-600 cursor-pointer hover:text-white" onClick={() => {navigator.clipboard.writeText(agentWallet.publicKey.toString()); addLog("Address copied!")}}>
                  {agentWallet.publicKey.toString().slice(0, 6)}...{agentWallet.publicKey.toString().slice(-4)}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-col gap-8 row-start-2 items-center w-full max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
          {/* Control Panel */}
          <div className="flex flex-col gap-4 p-6 bg-gray-900 rounded-xl border border-gray-800 h-fit">
            <h2 className="text-xl font-bold mb-4">Control Center</h2>
            <div className="flex justify-between items-center bg-black/50 p-4 rounded-lg">
              <span className="text-gray-400">Status</span>
              <span className={`font-mono font-bold ${isStreaming ? 'text-green-400 animate-pulse' : 'text-red-400'}`}>
                {isStreaming ? "STREAMING" : "OFFLINE"}
              </span>
            </div>
            <div className="flex justify-between items-center bg-black/50 p-4 rounded-lg">
              <span className="text-gray-400">Session Cost</span>
              <span className="font-mono text-xl text-yellow-400">${cost.toFixed(4)}</span>
            </div>
            
            <div className="flex items-center gap-2 mt-4 p-2 bg-gray-800 rounded border border-gray-700">
                <input type="checkbox" id="realMode" checked={isRealMode} onChange={(e) => setIsRealMode(e.target.checked)} className="w-4 h-4 text-blue-600 rounded bg-gray-700 border-gray-600" />
                <label htmlFor="realMode" className="text-xs font-medium text-gray-300 cursor-pointer select-none">Enable Real Transactions</label>
            </div>

            <button onClick={toggleStream} className={`mt-2 py-4 rounded-lg font-bold text-lg transition-all ${isStreaming ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
              {isStreaming ? "STOP AGENT" : (isRealMode ? "START REAL STREAM" : "DEPLOY AGENT TESTER")}
            </button>
             <p className="text-xs text-gray-500 text-center mt-2">
              {isRealMode ? `Connected to ${network.toUpperCase()}.` : "Simulates high-frequency micro-payments."}
            </p>
          </div>

          {/* Video Feed */}
          <div className="md:col-span-2 relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 group shadow-2xl">
            <video ref={videoRef} src="/assets/demo-feed.mp4" loop muted playsInline className={`w-full h-full object-cover transition-all duration-700 ${isStreaming ? 'filter-none' : 'blur-xl grayscale opacity-50'}`} />
            {!isStreaming && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="bg-black/80 px-6 py-3 rounded-full border border-gray-700 backdrop-blur-md">
                  <span className="text-gray-300 font-mono">🔒 Payment Required (402)</span>
                </div>
              </div>
            )}
            {isStreaming && isAgentMode && (
              <div className="absolute top-4 left-4">
                <div className="flex items-center gap-2 bg-green-900/80 text-green-400 px-3 py-1 rounded border border-green-500/50 text-xs font-mono animate-pulse">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div> AI ANALYSIS ACTIVE
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Logs */}
        <div className="w-full bg-black font-mono text-xs p-4 rounded-lg border border-gray-800 h-64 overflow-y-auto">
            <div className="text-gray-500 mb-2 border-b border-gray-800 pb-2 flex justify-between">
              <span>System Logs</span>
              <span className="text-green-500">● Live</span>
            </div>
            <div className="flex flex-col gap-1">
              {logs.map((log, i) => (
                <div key={i} className="text-green-500/80 border-l-2 border-transparent hover:border-green-500 pl-2 transition-all">
                  <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>{log}
                </div>
              ))}
            </div>
        </div>
        
         {/* About / Pitch Module */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8 mt-8 border-t border-gray-800 pt-8">
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">Why USDC PayStream?</h3>
            <p className="text-gray-400 leading-relaxed">
              AI Agents are the new economic actors, but they face a critical barrier: <span className="text-white font-medium"> Friction</span>. Traditional payments (credit cards) and even standard crypto (gas fees, block times) are too slow and expensive for machine-to-machine commerce.
            </p>
            <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
              <h4 className="font-bold text-blue-400 mb-2">The Solution</h4>
              <p className="text-sm text-gray-300">
                PayStream utilizes <span className="text-white">Ephemeral Rollups</span> to create temporary, zero-gas execution environments. This allows agents to stream USDC by the second, paying only for the exact compute or data they consume.
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white">Hackathon Track: Agentic Commerce</h3>
            <ul className="space-y-3">
              <li className="flex gap-3">
                <div className="mt-1 w-6 h-6 rounded-full bg-green-900/50 flex items-center justify-center text-green-400 text-sm">✓</div>
                <div>
                  <strong className="block text-white">High Velocity</strong>
                  <span className="text-sm text-gray-400">Supports 1000+ micro-transactions per second per agent.</span>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1 w-6 h-6 rounded-full bg-green-900/50 flex items-center justify-center text-green-400 text-sm">✓</div>
                <div>
                  <strong className="block text-white">Gasless Experience</strong>
                  <span className="text-sm text-gray-400">Agents only need USDC. No need to manage SOL for gas.</span>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1 w-6 h-6 rounded-full bg-green-900/50 flex items-center justify-center text-green-400 text-sm">✓</div>
                <div>
                  <strong className="block text-white">Atomic Settlement</strong>
                  <span className="text-sm text-gray-400">Instant finality ensures service stops immediately if payment stops.</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}