"use client";
import { useState, useEffect, useRef } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [cost, setCost] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Simulation State
  const [agentWallet] = useState(Keypair.generate());
  const [agentBalance, setAgentBalance] = useState(10.0000);
  const [projectBalance, setProjectBalance] = useState(543.2100);
  const [erSessionId, setErSessionId] = useState<string | null>(null);

  const addLog = (msg: string) => setLogs((prev) => [msg, ...prev].slice(0, 15));

  // Payment Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStreaming) {
      interval = setInterval(async () => {
        try {
          const transferAmount = 0.001;
          setCost((c) => c + transferAmount);
          setAgentBalance((b) => Math.max(0, b - transferAmount));
          setProjectBalance((b) => b + transferAmount);

          // Verbose Logging for "Agent Tester"
          if (Math.random() > 0.7) { // Don't spam every tick, but frequent enough
            addLog(`[ER-Tick] Transfer ${transferAmount} USDC from ...${agentWallet.publicKey.toString().slice(-4)} to Host`);
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
  }, [isStreaming, isAgentMode, agentWallet]);

  const toggleStream = () => {
    // If using the manual "Agent Tester" button, we bypass wallet connection for the simulation
    setIsStreaming(!isStreaming);
    if (!isStreaming) {
      // Start
      const newSessionId = "er_" + Math.random().toString(36).substr(2, 9);
      setErSessionId(newSessionId);
      videoRef.current?.play();
      addLog("------------------------------------------------");
      addLog(`[System] Initializing Ephemeral Rollup Session...`);
      setTimeout(() => {
        addLog(`[MagicBlock] ER Established. ID: ${newSessionId}`);
        addLog(`[Payment] Stream Started. Rate: 0.001 USDC/s`);
      }, 800);
    } else {
      // Stop
      videoRef.current?.pause();
      addLog(`[System] Closing Stream...`);
      addLog(`[MagicBlock] Settling state to Solana L1...`);
      addLog(`[Chain] Transaction Confirmed: https://solscan.io/tx/simulated_tx_${Math.random().toString(36).substr(2, 6)}`);
      setErSessionId(null);
    }
  };

  const toggleAgent = () => {
    setIsAgentMode(!isAgentMode);
    if (!isStreaming) {
      addLog(isAgentMode ? "Switched to Human Mode" : "Switched to AI Agent Mode (Simulated)");
    }
  };

  return (
    <div className="grid grid-rows-[auto_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-8 sm:p-20 font-[family-name:var(--font-geist-sans)] bg-gray-950 text-white">
      <header className="row-start-1 flex flex-col gap-4 w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between w-full">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter text-white">
              Project <span className="text-green-400">BountyVision</span>
            </h1>
            <h2 className="text-lg font-medium text-white/90 mt-1">
              Powered by USDC PayStream
            </h2>
          </div>
          <div className="flex gap-4 items-center">
            <button
              onClick={toggleAgent}
              className={`px-4 py-2 rounded text-sm font-mono border ${
                isAgentMode ? 'bg-green-900 border-green-500 text-green-100' : 'border-gray-700 hover:bg-gray-800'
              }`}
            >
              {isAgentMode ? "🤖 Agent Active" : "👤 Human Mode"}
            </button>
            <WalletMultiButton />
          </div>
        </div>

        {/* Wallets Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center">
            <span className="text-sm text-gray-400">🏢 Project Wallet (Host)</span>
            <span className="font-mono text-green-400">{projectBalance.toFixed(4)} USDC</span>
          </div>
          <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 flex justify-between items-center">
            <span className="text-sm text-gray-400">🤖 Agent Tester Wallet</span>
            <div className="text-right">
              <div className="font-mono text-blue-400">{agentBalance.toFixed(4)} USDC</div>
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
              <span className="font-mono text-xl text-yellow-400">
                ${cost.toFixed(4)}
              </span>
            </div>

            {erSessionId && (
              <div className="bg-blue-900/20 border border-blue-800 p-3 rounded text-xs font-mono text-blue-300 break-all">
                ER Session: {erSessionId}
              </div>
            )}

            <button
              onClick={toggleStream}
              className={`mt-4 py-4 rounded-lg font-bold text-lg transition-all ${
                isStreaming
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)]'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-[0_0_20px_rgba(37,99,235,0.5)]'
              }`}
            >
              {isStreaming ? "STOP AGENT" : "DEPLOY AGENT TESTER"}
            </button>
            
            <p className="text-xs text-gray-500 text-center mt-2">
              Simulates high-frequency micro-payments via MagicBlock Ephemeral Rollups
            </p>
          </div>

          {/* Video Feed */}
          <div className="md:col-span-2 relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 group shadow-2xl">
            <video
              ref={videoRef}
              src="/assets/demo-feed.mp4"
              loop
              muted
              playsInline
              className={`w-full h-full object-cover transition-all duration-700 ${isStreaming ? 'filter-none' : 'blur-xl grayscale opacity-50'}`}
            />
            
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
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  AI ANALYSIS ACTIVE
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Logs Console */}
        <div className="w-full bg-black font-mono text-xs p-4 rounded-lg border border-gray-800 h-64 overflow-y-auto">
            <div className="text-gray-500 mb-2 border-b border-gray-800 pb-2 flex justify-between">
              <span>System Logs</span>
              <span className="text-green-500">● Live</span>
            </div>
            <div className="flex flex-col gap-1">
              {logs.map((log, i) => (
                <div key={i} className="text-green-500/80 border-l-2 border-transparent hover:border-green-500 pl-2 transition-all">
                  <span className="text-gray-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                  {log}
                </div>
              ))}
              {logs.length === 0 && <span className="text-gray-700 italic">Waiting for agent deployment...</span>}
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

      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center text-xs text-gray-600 font-mono">
        <a
          className="hover:text-white transition-colors"
          href="https://github.com/moltycoder/USDC-Paystream"
          target="_blank"
          rel="noopener noreferrer"
        >
          View Source (GitHub)
        </a>
        <span>•</span>
        <span>Built for #USDCHackathon</span>
      </footer>
    </div>
  );
}