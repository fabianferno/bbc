"use client";

import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

/**
 * Solana wallet connection is always available (the adapter needs no API key),
 * so this is a constant `true`. Kept as an exported flag because the UI still
 * branches on "is wallet auth wired up at all".
 */
export const HAS_WALLET_AUTH = true;

export type Auth = {
  /** Adapter has finished restoring any prior connection. */
  ready: boolean;
  /** A wallet is connected. */
  authenticated: boolean;
  /** Wallet auth is configured (always true on Solana). */
  hasWallet: boolean;
  /** Base58 public key of the connected wallet. */
  address: string | null;
  /** Open the wallet-selection modal. */
  login: () => void;
  /** Disconnect the wallet. */
  logout: () => void;
};

export function useAuth(): Auth {
  const { connected, connecting, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const login = useCallback(() => setVisible(true), [setVisible]);
  const logout = useCallback(() => {
    void disconnect().catch(() => {});
  }, [disconnect]);

  return {
    ready: !connecting,
    authenticated: connected && publicKey != null,
    hasWallet: HAS_WALLET_AUTH,
    address: publicKey?.toBase58() ?? null,
    login,
    logout,
  };
}

/**
 * Returns a wrapper that runs `fn` only when a wallet is connected, otherwise
 * opening the wallet modal. Used to gate action buttons (discover, run).
 */
export function useRequireAuth() {
  const { authenticated, login } = useAuth();
  return useCallback(
    (fn: () => void) => {
      if (!authenticated) {
        login();
        return;
      }
      fn();
    },
    [authenticated, login],
  );
}
