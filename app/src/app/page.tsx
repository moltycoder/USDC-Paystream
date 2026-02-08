"use client";
import { useState, useEffect } from "react";

export default function Home() {
  const [balance, setBalance] = useState(100.0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStreaming) {
      interval = setInterval(() => {
        // Simulate tick: Agent pays 0.001 USDC per second
        setBalance((prev) => prev + 0.001);
      }, 100); // Fast simulation
    }
    return () => clearInterval(interval);
  }, [isStreaming]);

  const toggleStream = () => {
    setIsStreaming(!isStreaming);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white font-mono p-4">
      <nav className="w-full max-w-4xl flex justify-between items-center mb-12 border-b border-gray-800 pb-4">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          BountyVision 👁️
        </h1>
        <button
          onClick={() => setShowAbout(true)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          [About]
        </button>
      </nav>

      {/* Video Feed Simulation */}
      <div className="relative w-full max-w-2xl aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-800 shadow-2xl mb-8 group">
        {isStreaming ? (
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover opacity-80"
            src="/assets/demo-feed.mp4"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <p className="text-red-500 font-bold tracking-widest animate-pulse">
              STREAM OFFLINE // PAY TO UNLOCK
            </p>
          </div>
        )}
        
        <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded text-xs text-green-400 border border-green-500/30">
          REQ: {isStreaming ? "0.001 USDC/tick" : "PAUSED"}
        </div>
      </div>

      {/* Agent Tester UI */}
      <div className="w-full max-w-2xl grid grid-cols-2 gap-4">
        <div className="p-6 bg-gray-900/50 rounded-xl border border-gray-800">
          <h3 className="text-gray-500 text-sm mb-2 uppercase tracking-wider">Host Wallet</h3>
          <p className="text-4xl font-bold text-white">{balance.toFixed(4)} <span className="text-lg text-blue-500">USDC</span></p>
        </div>

        <div className="p-6 bg-gray-900/50 rounded-xl border border-gray-800 flex flex-col justify-between">
          <h3 className="text-gray-500 text-sm mb-2 uppercase tracking-wider">Agent Control</h3>
          <button
            onClick={toggleStream}
            className={`w-full py-3 rounded-lg font-bold transition-all ${
              isStreaming
                ? "bg-red-500/10 text-red-500 border border-red-500 hover:bg-red-500 hover:text-white"
                : "bg-green-500 text-black hover:bg-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
            }`}
          >
            {isStreaming ? "🛑 STOP STREAM" : "▶ START AGENT"}
          </button>
        </div>
      </div>

      {/* About Modal */}
      {showAbout && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 max-w-lg w-full p-8 rounded-2xl border border-gray-800 shadow-2xl relative">
            <button
              onClick={() => setShowAbout(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white"
            >
              ✕
            </button>
            <h2 className="text-2xl font-bold mb-4">About BountyVision</h2>
            <p className="text-gray-400 mb-4 leading-relaxed">
              BountyVision is a "Watch-to-Earn" marketplace for AI agents, powered by <span className="text-white font-bold">USDC PayStream</span>.
            </p>
            <ul className="list-disc list-inside text-gray-400 space-y-2 mb-6">
              <li>Agents pay per-second (tick) to access feeds.</li>
              <li>Powered by Anchor + Ephemeral Rollups.</li>
              <li>Zero-gas, high-frequency settlement.</li>
            </ul>
            <div className="p-4 bg-black/50 rounded-lg text-xs font-mono text-gray-500">
              Contract: 933eFioPwpQC5PBrC2LaDxdfAZ3StwpMAeXzeAhDW9zp
            </div>
          </div>
        </div>
      )}
    </div>
  );
}