"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";
import { PRIVY_APP_ID } from "./solana";

/**
 * Whether auth is wired up at all. False when NEXT_PUBLIC_PRIVY_APP_ID is unset,
 * in which case the app still renders read-only rather than crashing.
 */
export const HAS_WALLET_AUTH = Boolean(PRIVY_APP_ID);

export type Auth = {
  /** Privy has finished restoring any prior session. */
  ready: boolean;
  /** A user is signed in AND has a usable Solana wallet. */
  authenticated: boolean;
  /** Auth is configured. */
  hasWallet: boolean;
  /** Base58 public key of the active Solana wallet (embedded or external). */
  address: string | null;
  /** Open the Privy login modal. */
  login: () => void;
  /** End the session. */
  logout: () => void;
};

export function useAuth(): Auth {
  const { ready, authenticated, login, logout } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();

  // Privy can report `authenticated` before the embedded wallet finishes
  // provisioning. Signing needs an address, so treat "signed in without a
  // wallet yet" as not-ready rather than authenticated — otherwise the first
  // anchor after login throws.
  const address = wallets[0]?.address ?? null;

  return {
    ready: ready && (!authenticated || walletsReady),
    authenticated: authenticated && address != null,
    hasWallet: HAS_WALLET_AUTH,
    address,
    login,
    logout,
  };
}

/**
 * Returns a wrapper that runs `fn` only when a wallet is connected, otherwise
 * opening the login modal. Used to gate action buttons (discover, run).
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
