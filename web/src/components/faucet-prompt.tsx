"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, RotateCw } from "lucide-react";
import { SOLANA_FAUCET_URL } from "@/lib/solana";
import { useAuth } from "@/lib/auth";
import { useDemoMode } from "@/lib/demo-mode";
import { useBalance } from "@/lib/useBalance";
import { Button } from "@/components/ui";

/**
 * An advisory strap under the channel bar. When the viewer has chosen to sign
 * with their own wallet, that wallet pays Solana devnet fees — so a zero SOL
 * balance is a warning worth reading aloud, not an error.
 */
export function FaucetPrompt() {
  const { authenticated, address } = useAuth();
  const { demoMode } = useDemoMode();
  const { isZero, refetch } = useBalance(authenticated ? address : null);
  const [copied, setCopied] = useState(false);

  // Only run the strap when it matters: connected, signing yourself, confirmed 0.
  if (!authenticated || demoMode || !isZero) return null;

  const copy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div role="status" className="border-b border-hold/30 bg-hold/10">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
        <span className="chyron shrink-0 bg-hold px-2 py-0.5 text-studio">
          Advisory
        </span>
        <p className="min-w-0 text-[12px] text-dim">
          Your wallet holds <span className="numeric text-hold">0 SOL</span> on
          Solana devnet. It pays the fees while it is signing, so top it up from
          the faucet and re-check.
        </p>

        <div className="ml-auto flex items-center gap-2">
          {address && (
            <Button
              variant="ghost"
              onClick={copy}
              title="Copy your wallet address"
              aria-label={copied ? "Copied your wallet address" : "Copy your wallet address"}
              className="numeric whitespace-nowrap py-1"
            >
              {copied ? (
                <Check className="size-3 text-up" strokeWidth={2} aria-hidden />
              ) : (
                <Copy className="size-3" strokeWidth={2} aria-hidden />
              )}
              {`${address.slice(0, 4)}…${address.slice(-4)}`}
            </Button>
          )}
          <a
            href={SOLANA_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="chyron inline-flex items-center gap-2 whitespace-nowrap border border-hold/50 bg-hold/10 px-3 py-1 text-hold transition-colors hover:bg-hold/20"
          >
            Get devnet SOL
            <ExternalLink className="size-3" strokeWidth={2} aria-hidden />
          </a>
          <Button
            variant="ghost"
            onClick={refetch}
            className="whitespace-nowrap py-1"
          >
            <RotateCw className="size-3" strokeWidth={2} aria-hidden />
            Re-check
          </Button>
        </div>
      </div>
    </div>
  );
}
