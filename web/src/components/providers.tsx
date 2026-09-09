"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { DemoModeProvider } from "@/lib/demo-mode";
import { PRIVY_APP_ID } from "@/lib/solana";

// External Solana wallets (Phantom, Solflare, …) are surfaced through Privy's
// connector rather than @solana/wallet-adapter, so there is one auth path for
// both crypto-native users and email/social users on an embedded wallet.
const solanaConnectors = toSolanaWalletConnectors();

export function Providers({ children }: { children: React.ReactNode }) {
  // Without an app id Privy throws on mount and takes the whole page with it.
  // Render the app unauthenticated instead: the desk is read-only anyway, and a
  // missing key should degrade to "can't sign in", not a blank screen.
  if (!PRIVY_APP_ID) {
    return <DemoModeProvider>{children}</DemoModeProvider>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google", "wallet"],
        // Anyone arriving without a wallet gets an embedded Solana one, so a
        // first-time viewer can sign an anchor without installing an extension.
        embeddedWallets: { solana: { createOnLogin: "users-without-wallets" } },
        externalWallets: { solana: { connectors: solanaConnectors } },
        appearance: {
          theme: "dark",
          accentColor: "#e01a2b",
          walletChainType: "solana-only",
          logo: "/logo.png",
        },
      }}
    >
      <DemoModeProvider>{children}</DemoModeProvider>
    </PrivyProvider>
  );
}
