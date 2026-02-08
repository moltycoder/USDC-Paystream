"use client";
import { useState } from "react";

export default function Home() {
  const [balance, setBalance] = useState(100.0); // Mock balance

  const handleManualTick = () => {
    // Simulate tick effect
    setBalance(prev => prev + 0.1);
    console.log("Manual tick triggered");
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-8">Agent PayStream Dashboard</h1>
      
      <div className="p-6 bg-gray-800 rounded-xl border border-gray-700 shadow-lg">
        <h2 className="text-2xl mb-4">Stream Status: <span className="text-green-400">Active 🟢</span></h2>
        
        <div className="mb-6">
          <p className="text-gray-400">Current Host Balance:</p>
          <p className="text-5xl font-mono text-blue-400">{balance.toFixed(2)} USDC</p>
        </div>

        <button 
          onClick={handleManualTick}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold transition-all"
        >
          ⚡ Manual Tick
        </button>
      </div>
    </div>
  );
}
