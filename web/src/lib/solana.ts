import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

export type SolanaCluster = "devnet" | "testnet" | "mainnet-beta";

/** Privy app id. Public by design — the app secret is server-side only and must
 * never be exposed through a NEXT_PUBLIC_* variable. */
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

/** Cluster the app talks to. Devnet for the hackathon build. */
export const SOLANA_CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ||
  "devnet") as SolanaCluster;

/**
 * RPC endpoint. Overridable so a Helius (or other paid) endpoint can be dropped
 * in without a code change; falls back to the public cluster endpoint.
 */
export const SOLANA_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(SOLANA_CLUSTER);

/** CAIP-2 chain id Privy uses to pick which cluster to broadcast to. */
export const SOLANA_CAIP2 = `solana:${SOLANA_CLUSTER}` as
  | "solana:devnet"
  | "solana:testnet"
  | "solana:mainnet";

/** Shared RPC connection. One per app: the wallet-adapter ConnectionProvider that
 * used to own this is gone now that auth runs through Privy. */
let _conn: Connection | null = null;
export function getConnection(): Connection {
  if (!_conn) _conn = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");
  return _conn;
}

/** SPL Memo program — the anchor writes the reasoning-trace hash through this. */
export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

/**
 * $BBC mint. NOT launched yet — empty until the ClawPump mint exists, so every
 * consumer must treat "no mint" as a first-class state rather than an error.
 */
export const BBC_MINT_ADDRESS = process.env.NEXT_PUBLIC_BBC_MINT || "";

/** Circle USDC on devnet — used for the symbolic settle until $BBC ships. */
export const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** Treasury the settle transfer goes to; falls back to the signer (self-send). */
export const SOLANA_TREASURY_ADDRESS =
  process.env.NEXT_PUBLIC_SOLANA_TREASURY || "";

/** Devnet SOL faucet. */
export const SOLANA_FAUCET_URL = "https://faucet.solana.com";

const clusterQuery =
  SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`;

export const explorerTxUrl = (signature: string) =>
  `https://explorer.solana.com/tx/${signature}${clusterQuery}`;

export const explorerAddressUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}${clusterQuery}`;

/** Safe base58 pubkey parse — returns null instead of throwing on junk input. */
export function toPublicKey(value?: string | null): PublicKey | null {
  if (!value) return null;
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

/** The $BBC mint as a PublicKey, or null while the token is unlaunched. */
export const BBC_MINT = toPublicKey(BBC_MINT_ADDRESS);
export const HAS_BBC_MINT = BBC_MINT !== null;
