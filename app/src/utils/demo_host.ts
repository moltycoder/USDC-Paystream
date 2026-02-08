import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// Ephemeral Host Keypair for Demo
// PubKey: 4KAzRGNQ9WG1xWJqeVQsqh5qut6kwQmMLxensuB2fTqv
const HOST_SECRET = "5a27LSGzEHvVwYY8CixJy9AbZijGqRaUniV74htGaxQdFR5akbhGUJpVm1qRDSGgX8GZ2LrChrb9ho1bkQTgUsyW";

export const getDemoHostWallet = () => {
  const envKey = process.env.NEXT_PUBLIC_HOST_WALLET_KEY;
  if (envKey) {
      try {
          return Keypair.fromSecretKey(bs58.decode(envKey));
      } catch(e) {
          console.error("Invalid HOST env key", e);
      }
  }
  return Keypair.fromSecretKey(bs58.decode(HOST_SECRET));
};