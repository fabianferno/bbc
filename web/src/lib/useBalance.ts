"use client";

import { useCallback, useEffect, useState } from "react";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { BBC_MINT, SOLANA_RPC_ENDPOINT, toPublicKey } from "./solana";

const connection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed");

export type TokenBalance = {
  /** Raw amount in the token's base units. */
  raw: bigint;
  /** Human-readable amount, e.g. "12.5000". */
  formatted: string;
};

export type WalletBalance = {
  /** Native balance in lamports, or null until/if it loads. */
  lamports: bigint | null;
  /** Human-readable SOL, e.g. "0.5000". Kept as `formatted` for callers. */
  formatted: string | null;
  /** $BBC SPL balance, or null when no mint is configured / it can't be read. */
  bbc: TokenBalance | null;
  /** True only once a SOL balance has loaded AND it is exactly zero. */
  isZero: boolean;
  refetch: () => void;
};

/**
 * Reads the connected wallet's SOL balance (needed to pay Solana fees) and, when
 * NEXT_PUBLIC_BBC_MINT is set, its $BBC SPL token balance. Polls gently and
 * re-reads on demand (e.g. after a faucet drip). Every failure path resolves to
 * null rather than throwing, so a transient RPC error never nags the user and a
 * missing $BBC mint (the token is not launched yet) is simply "no balance".
 */
export function useBalance(address: string | null): WalletBalance {
  const [lamports, setLamports] = useState<bigint | null>(null);
  const [bbc, setBbc] = useState<TokenBalance | null>(null);

  const refetch = useCallback(() => {
    const owner = toPublicKey(address);
    if (!owner) {
      setLamports(null);
      setBbc(null);
      return;
    }

    connection
      .getBalance(owner)
      .then((v) => setLamports(BigInt(v)))
      .catch(() => setLamports(null));

    if (!BBC_MINT) {
      setBbc(null);
      return;
    }
    getAssociatedTokenAddress(BBC_MINT, owner)
      .then((ata) => connection.getTokenAccountBalance(ata))
      .then((res) =>
        setBbc({
          raw: BigInt(res.value.amount),
          formatted: res.value.uiAmountString ?? "0",
        }),
      )
      // no ATA yet (never received $BBC) or RPC hiccup — treat as "no balance"
      .catch(() => setBbc(null));
  }, [address]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
    if (!address) return;
    const t = setInterval(refetch, 20_000);
    return () => clearInterval(t);
  }, [address, refetch]);

  return {
    lamports,
    formatted:
      lamports == null
        ? null
        : (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4),
    bbc,
    isZero: lamports === BigInt(0),
    refetch,
  };
}
