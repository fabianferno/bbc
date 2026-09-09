"use client";

// Explicit `buffer` import: Turbopack does not polyfill a global Buffer in
// client bundles, and @solana/web3.js types instruction data as Buffer.
import { Buffer } from "buffer";
import { useCallback, useMemo } from "react";
import bs58 from "bs58";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { api } from "./api";
import { useAuth } from "./auth";
import {
  BBC_MINT,
  MEMO_PROGRAM_ID,
  SOLANA_TREASURY_ADDRESS,
  USDC_DEVNET_MINT,
  SOLANA_CAIP2,
  explorerTxUrl,
  getConnection,
  toPublicKey,
} from "./solana";
import type { AnchorRequest, OnchainTx, SettleRequest } from "./types";

export type OnchainExecutor = {
  /** Sign the trace-hash anchor with the user's wallet, then persist it. */
  anchor: (req: AnchorRequest) => Promise<OnchainTx>;
  /** Sign the symbolic SPL settle with the user's wallet, then persist it. */
  settle: (req: SettleRequest) => Promise<OnchainTx>;
};

/**
 * Personal-mode signer: the server never holds the user's key, so the browser
 * signs the Solana anchor + settle txns with the connected wallet and reports
 * the resulting signatures back to be recorded in the ledger.
 *
 * anchor → an SPL Memo instruction carrying the reasoning-trace hash.
 * settle → an SPL token transfer (USDC-devnet, or $BBC once its mint is set).
 */
export function useOnchainExecutor(): OnchainExecutor {
  const connection = getConnection();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  // signer address — recorded as from_address so the ledger can attribute these
  // txns (and their positions) to this user in personal mode.
  const { address } = useAuth();

  const wallet = wallets[0] ?? null;
  const publicKey = useMemo(() => toPublicKey(address), [address]);

  const send = useCallback(
    async (instructions: TransactionInstruction[], payer: PublicKey) => {
      if (!wallet) throw new Error("Sign in first.");
      const tx = new Transaction().add(...instructions);
      tx.feePayer = payer;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      // Privy takes the serialised wire format, not a web3.js Transaction, and
      // the transaction is unsigned here — requireAllSignatures must be off or
      // serialize() throws on the missing signature.
      const wire = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const { signature: sigBytes } = await signAndSendTransaction({
        transaction: new Uint8Array(wire),
        wallet,
        // Privy defaults to mainnet. This build is devnet, so the cluster is
        // named explicitly — otherwise the txn is broadcast to the wrong chain.
        chain: SOLANA_CAIP2,
      });
      // Privy returns raw signature bytes; the ledger stores base58.
      const signature = bs58.encode(sigBytes);

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      return signature;
    },
    [connection, signAndSendTransaction, wallet],
  );

  const anchor = useCallback(
    async (req: AnchorRequest): Promise<OnchainTx> => {
      if (!publicKey) throw new Error("Sign in to sign this transaction.");
      const memo = new TransactionInstruction({
        keys: [{ pubkey: publicKey, isSigner: true, isWritable: true }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(`bbc:trace:${req.trace_hash}`, "utf8"),
      });
      const signature = await send([memo], publicKey);
      const rec = await api.recordAnchor({
        decision_id: req.decision_id,
        market_id: req.market_id,
        kind: "anchor",
        tx_hash: signature,
        trace_hash: req.trace_hash,
        from_address: address,
      });
      return { ...rec, tx_hash: signature, explorer_url: explorerTxUrl(signature) };
    },
    [publicKey, send, address],
  );

  const settle = useCallback(
    async (req: SettleRequest): Promise<OnchainTx> => {
      if (!publicKey) throw new Error("Sign in to sign this transaction.");

      // Prefer $BBC once its mint exists; otherwise the devnet USDC stand-in.
      // Anything the server sent that isn't valid base58 (e.g. a legacy EVM
      // address) is ignored rather than crashing the flow.
      const mint =
        toPublicKey(req.mint) ??
        BBC_MINT ??
        toPublicKey(req.usdc_address) ??
        new PublicKey(USDC_DEVNET_MINT);

      // Treasury: server value → env default → self-send (symbolic).
      const treasury =
        toPublicKey(req.treasury) ??
        toPublicKey(SOLANA_TREASURY_ADDRESS) ??
        publicKey;

      const decimals = req.decimals ?? 6;
      const amount = BigInt(
        Math.round(req.amount_usdc * 10 ** decimals),
      );

      const from = await getAssociatedTokenAddress(mint, publicKey);
      const to = await getAssociatedTokenAddress(mint, treasury);

      const ixs: TransactionInstruction[] = [];
      // Create the treasury's ATA on first settle so the transfer can land.
      const toInfo = await connection.getAccountInfo(to);
      if (!toInfo) {
        ixs.push(
          createAssociatedTokenAccountInstruction(publicKey, to, treasury, mint),
        );
      }
      ixs.push(
        createTransferCheckedInstruction(
          from,
          mint,
          to,
          publicKey,
          amount,
          decimals,
        ),
      );

      const signature = await send(ixs, publicKey);
      const rec = await api.recordAnchor({
        decision_id: req.decision_id,
        market_id: req.market_id,
        kind: "settle",
        tx_hash: signature,
        usdc_amount: req.amount_usdc,
        to_address: treasury.toBase58(),
        from_address: address,
      });
      return { ...rec, tx_hash: signature, explorer_url: explorerTxUrl(signature) };
    },
    [publicKey, connection, send, address],
  );

  return { anchor, settle };
}
