"use client";

/**
 * The viewer's wallet, on the channel bar. Nothing here belongs to the agent —
 * this is the audience's own connection, so the copy always says "your wallet".
 * Below `sm` it collapses to a single control: the header has no room for the
 * signing toggle, balances or the address chip on a phone.
 */

import { Check, Copy, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useDemoMode } from "@/lib/demo-mode";
import { useBalance } from "@/lib/useBalance";
import { Button } from "@/components/ui";

function shortAddr(a: string | null) {
  return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "wallet";
}

export function AuthControls() {
  const { ready, authenticated, address, login, logout } = useAuth();
  const { demoMode, setDemoMode } = useDemoMode();
  const { formatted: sol, bbc } = useBalance(authenticated ? address : null);
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (!ready) {
    return (
      <span className="chyron text-faint" aria-live="polite">
        Cueing
      </span>
    );
  }

  if (!authenticated) {
    return (
      <Button
        variant="ghost"
        onClick={login}
        aria-label="Sign in"
        className="whitespace-nowrap px-2.5 sm:px-3.5"
      >
        <Wallet
          className="hidden size-3.5 shrink-0 sm:block"
          strokeWidth={2}
          aria-hidden
        />
        <span className="sm:hidden">Sign in</span>
        <span className="hidden sm:inline">Sign in</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* Who signs: the studio's demo wallet, or the viewer's own. */}
      <div
        role="switch"
        aria-checked={!demoMode}
        aria-label="Signing wallet: studio demo wallet or your own wallet"
        title={
          demoMode
            ? "Demo: the studio wallet signs on Solana devnet. Switch to sign with your own wallet."
            : "Your wallet signs on Solana devnet and needs devnet SOL for fees. Switch back to the studio wallet."
        }
        className="chyron relative hidden select-none items-center border border-rule sm:flex"
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 w-1/2 border transition-[left,border-color,background-color] duration-200 ease-out",
            demoMode
              ? "left-0 border-hold/50 bg-hold/10"
              : "left-1/2 border-red/60 bg-red/10",
          )}
        />
        <button
          type="button"
          onClick={() => setDemoMode(true)}
          className={cn(
            "relative z-10 px-2.5 py-1 transition-colors",
            demoMode ? "text-hold" : "text-faint hover:text-dim",
          )}
        >
          Demo
        </button>
        <button
          type="button"
          onClick={() => setDemoMode(false)}
          className={cn(
            "relative z-10 px-2.5 py-1 transition-colors",
            demoMode ? "text-faint hover:text-dim" : "text-red-bright",
          )}
        >
          Yours
        </button>
      </div>

      {/* Balances. $BBC stays hidden until the mint exists — that is normal. */}
      <div className="chyron numeric hidden items-center gap-2 text-faint lg:flex">
        <span title="Your devnet SOL balance">{sol ?? "—"} SOL</span>
        {bbc && <span title="Your $BBC balance">{bbc.formatted} $BBC</span>}
      </div>

      <div className="chyron hidden items-center border border-rule sm:flex">
        <span className="numeric px-2.5 py-1 text-dim" title={address ?? undefined}>
          {shortAddr(address)}
        </span>
        <button
          type="button"
          onClick={copyAddress}
          title={copied ? "Copied" : "Copy your wallet address"}
          aria-label={copied ? "Copied your wallet address" : "Copy your wallet address"}
          className="cursor-pointer border-l border-rule px-2 py-1 text-faint transition-colors hover:text-white"
        >
          {copied ? (
            <Check className="size-3 text-up" strokeWidth={2} aria-hidden />
          ) : (
            <Copy className="size-3" strokeWidth={2} aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={logout}
          className="border-l border-rule px-2.5 py-1 text-dim transition-colors hover:text-white"
        >
          Disconnect
        </button>
      </div>

      {/* Phone: one control, the way out. */}
      <button
        type="button"
        onClick={logout}
        title={`Disconnect ${shortAddr(address)}`}
        aria-label="Disconnect your wallet"
        className="border border-rule px-2 py-1.5 text-dim transition-colors hover:text-white sm:hidden"
      >
        <LogOut className="size-3.5" strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
