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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
          {/* Main Video Area */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-gray-800 shadow-2xl group">
              <video
                ref={videoRef}
                src="/assets/demo-feed.mp4"
                className={`w-full h-full object-cover transition-all duration-700 ${isStreaming ? "grayscale-0 blur-0" : "grayscale blur-sm opacity-50"}`}
                loop
                muted
                playsInline
              />
              
              {/* Overlay UI */}
              <div className="absolute top-4 left-4 flex gap-2">
                <div className={`px-2 py-1 rounded text-xs font-bold ${isStreaming ? "bg-red-600 text-white animate-pulse" : "bg-gray-700 text-gray-400"}`}>
                  {isStreaming ? "● LIVE FEED" : "○ OFFLINE"}
                </div>
                {isStreaming && (
                  <div className="px-2 py-1 rounded text-xs font-bold bg-blue-600/80 text-white backdrop-blur">
                    ER SESSION: {erSessionId}
                  </div>
                )}
              </div>

              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-6 bg-black/80 backdrop-blur-md rounded-xl border border-gray-800">
                    <p className="text-gray-400 mb-4 text-sm font-mono">PAYMENT STREAM REQUIRED</p>
                    <button 
                      onClick={toggleStream}
                      className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors flex items-center gap-2 mx-auto"
                    >
                      <span>⚡</span> Start Stream (0.001 USDC/s)
                    </button>
                  </div>
                </div>
              )}

              {/* Agent Vision Overlay (Simulated) */}
              {isStreaming && isAgentMode && (
                <div className="absolute inset-0 pointer-events-none border-4 border-green-500/30">
                  <div className="absolute bottom-4 right-4 text-green-400 font-mono text-xs bg-black/70 p-2 rounded">
                    <div>AI VISION: ACTIVE</div>
                    <div>CONFIDENCE: 98.4%</div>
                    <div>OBJECTS: 3</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Terminal / Logs */}
          <div className="bg-black rounded-xl border border-gray-800 p-4 font-mono text-xs flex flex-col h-[400px] lg:h-auto">
            <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
              <span className="text-gray-400">System Logs</span>
              <span className="text-green-500 animate-pulse">● Connected</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
              {logs.length === 0 && <span className="text-gray-600 italic">Waiting for events...</span>}
              {logs.map((log, i) => (
                <div key={i} className="border-l-2 border-gray-800 pl-2 py-1">
                  <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span>{" "}
                  <span className={log.includes("ALERT") ? "text-red-400 font-bold" : "text-gray-300"}>
                    {log}
                  </span>
                </div>
              ))}
            </div>
            {isStreaming && (
               <div className="mt-4 pt-4 border-t border-gray-800">
                 <button 
                   onClick={toggleStream}
                   className="w-full py-2 bg-red-900/30 text-red-400 border border-red-900 rounded hover:bg-red-900/50 transition-colors"
                 >
                   Stop Stream & Settle
                 </button>
               </div>
            )}
          </div>
        </div>
      </main>

      <footer className="row-start-3 flex gap-6 flex-wrap items-center justify-center text-xs text-gray-600 font-mono">
        <a className="hover:text-white transition-colors" href="https://github.com/moltycoder/USDC-Paystream" target="_blank" rel="noopener noreferrer">
          View Source (GitHub)
        </a>
        <span>•</span>
        <span>Built for #USDCHackathon</span>
      </footer>
    </div>
  );
}