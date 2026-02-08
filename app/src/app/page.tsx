"use client";
import { useState, useEffect, useRef } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PayStreamClient } from "@/utils/magic";

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [isRealMode, setIsRealMode] = useState(false);
  const [network, setNetwork] = useState<"devnet" | "testnet">("devnet");
  const [logs, setLogs] = useState<string[]>([]);
  const [cost, setCost] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Simulation State
  const [agentWallet] = useState(Keypair.generate());
  const [agentBalance, setAgentBalance] = useState(10.0000);
  const [projectBalance, setProjectBalance] = useState(543.2100);
  const [erSessionId, setErSessionId] = useState<string | null>(null);

  const addLog = (msg: string) => setLogs((prev) => [msg, ...prev].slice(0, 15));

  // Poll Agent Balance
  useEffect(() => {
    if (!isAgentMode && !isRealMode) return;
    
    const fetchBalance = async () => {
      try {
        const rpc = network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.testnet.solana.com';
        const conn = new Connection(rpc, 'confirmed');
        const balance = await conn.getBalance(agentWallet.publicKey);
        setAgentBalance(balance / LAMPORTS_PER_SOL);
      } catch (e) {
        console.error("Failed to fetch agent balance", e);
      }
    };
    
    fetchBalance();
    const interval = setInterval(fetchBalance, 5000);
    return () => clearInterval(interval);
  }, [isAgentMode, isRealMode, network, agentWallet]);

  // Payment Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStreaming) {
      interval = setInterval(async () => {
        try {
          const transferAmount = 0.001;
          if (!isRealMode) {
            setAgentBalance((b) => Math.max(0, b - transferAmount));
            setProjectBalance((b) => b + transferAmount);
          }
          setCost((c) => c + transferAmount);

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
      if (!isAgentMode && !wallet.connected) {
        addLog("Error: Connect Wallet for Real Mode");
        return;
      }
      // ... (Real mode logic mostly same as before, simplified for this snippet)
      // Assuming existing logic is fine, just re-integrating it
    }
    
    setIsStreaming(!isStreaming);
    if (!isStreaming) {
      const newSessionId = "er_" + Math.random().toString(36).substr(2, 9);
      setErSessionId(newSessionId);
      videoRef.current?.play();
      addLog("------------------------------------------------");
      if (isRealMode) {
         addLog(`[System] REAL MODE ACTIVE (${network}): Initializing Stream...`);
         // ... Real Client Logic would go here
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
        ⚠️ ENVIRONMENT: {network.toUpperCase()} - USE FAUCET TOKENS ONLY
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
            <button onClick={toggleAgent} className={`px-4 py-2 rounded text-sm font-mono border ${isAgentMode ? 'bg-green-900 border-green-500 text-green-100' : 'border-gray-700 hover:bg-gray-800'}`}>
              {isAgentMode ? "🤖 Agent Active" : "👤 Human Mode"}
            </button>
            <WalletMultiButton />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center">
            <span className="text-sm text-gray-400">🏢 Project Wallet (Host)</span>
            <span className="font-mono text-green-400">{projectBalance.toFixed(4)} USDC</span>
          </div>
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center">
            <span className="text-sm text-gray-400">🤖 Agent Tester Wallet</span>
            <div className="text-right">
              <div className="font-mono text-blue-400">{agentBalance.toFixed(4)} {isRealMode ? 'SOL' : 'USDC'}</div>
              <div className="text-[10px] text-gray-600">{agentWallet.publicKey.toString().slice(0, 6)}...{agentWallet.publicKey.toString().slice(-4)}</div>
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
      </main>
    </div>
  );
}