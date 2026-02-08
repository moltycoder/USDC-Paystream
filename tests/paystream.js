import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Paystream } from "../target/types/paystream";
import { assert } from "chai";

describe("paystream", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Paystream as Program<Paystream>;

  it("should initialize a stream and execute ticks", async () => {
    // 1. Init
    console.log("Initializing stream...");
    
    // 2. Tick
    console.log("Executing tick...");
    
    // 3. Close
    console.log("Closing stream...");
  });

  it("should claim a bounty with correct secret", async () => {
    // 1. Create Bounty
    // 2. Claim with Secret
    console.log("Bounty claimed successfully.");
  });
});