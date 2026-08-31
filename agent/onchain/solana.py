"""Solana client (solana-py + solders).

Two operations:
  - anchor(trace_hash):  write `bbc:trace:<hash>` through the SPL Memo program, so the
    reasoning-trace hash is permanently on-chain and verifiable from the explorer.
  - transfer_usdc:       settle a symbolic SPL-token amount (stake/fee) to the treasury,
    using the $BBC mint when one is configured, otherwise devnet USDC.

Every method degrades gracefully to a clearly-flagged mock txn when `SOLANA_ENABLED=false`,
no keypair is configured, or the RPC call fails — so the demo is never blocked. Mocked
results carry `mocked: True` and a random base58 signature-shaped id.
"""

from __future__ import annotations

import json
import secrets
from typing import Any

from agent.config import settings
from agent.logging import get_logger

log = get_logger(__name__)

_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
USDC_DECIMALS = 6
NETWORK_PREFIX = "solana"


def b58encode(raw: bytes) -> str:
    """Minimal base58 encoder (no dependency needed on the mock path)."""
    n = int.from_bytes(raw, "big")
    out = ""
    while n > 0:
        n, r = divmod(n, 58)
        out = _B58[r] + out
    pad = len(raw) - len(raw.lstrip(b"\x00"))
    return "1" * pad + (out or "1")


def explorer_tx_url(signature: str, *, cluster: str | None = None) -> str:
    """Solana Explorer tx link. Non-mainnet clusters need an explicit ?cluster= query."""
    return _explorer(f"/tx/{signature}", cluster)


def explorer_address_url(address: str, *, cluster: str | None = None) -> str:
    return _explorer(f"/address/{address}", cluster)


def _explorer(path: str, cluster: str | None = None) -> str:
    c = (cluster or settings.solana_cluster or "devnet").strip()
    base = settings.solana_explorer_base.rstrip("/")
    url = f"{base}{path}"
    if c and c not in ("mainnet", "mainnet-beta"):
        url += f"?cluster={c}"
    return url


def network_name(cluster: str | None = None) -> str:
    return f"{NETWORK_PREFIX}-{(cluster or settings.solana_cluster or 'devnet')}"


def _load_keypair(path: Any) -> Any:
    """Load a Solana keypair from a solana-cli JSON byte array or a base58 secret."""
    from solders.keypair import Keypair

    text = open(path).read().strip()
    if text.startswith("["):
        return Keypair.from_bytes(bytes(json.loads(text)))
    return Keypair.from_base58_string(text)


class SolanaClient:
    """Thin, failure-tolerant wrapper over an RPC client + the agent keypair."""

    def __init__(self) -> None:
        self.enabled = bool(settings.solana_enabled and settings.solana_keypair_path)
        self.client = None
        self.keypair = None
        self.address: str | None = None
        self.cluster = settings.solana_cluster
        if not self.enabled:
            log.info("solana.mock_mode", reason="disabled_or_no_keypair")
            return
        try:
            from solana.rpc.api import Client

            self.keypair = _load_keypair(settings.solana_keypair_path)
            self.address = str(self.keypair.pubkey())
            self.client = Client(settings.solana_rpc_url, timeout=30)
            log.info("solana.ready", address=self.address, cluster=self.cluster)
        except Exception as e:  # noqa: BLE001
            log.warning("solana.init_failed", error=str(e))
            self.enabled = False

    # ---- public ----

    @property
    def real(self) -> bool:
        return self.enabled and self.client is not None and self.keypair is not None

    @property
    def mint(self) -> str:
        """Settle asset: $BBC once minted, devnet USDC until then."""
        return settings.bbc_mint_address or settings.usdc_mint_address

    def treasury(self) -> str:
        return settings.solana_treasury_address or self.address or self.mint

    def anchor(self, trace_hash: str, *, decision_id: int | None = None) -> dict[str, Any]:
        """Anchor a reasoning-trace hash via a Memo instruction."""
        h = trace_hash[2:] if trace_hash.startswith("0x") else trace_hash
        memo = f"bbc:trace:{h}"
        if not self.real:
            return self._mock("anchor", trace_hash=trace_hash, decision_id=decision_id, memo=memo)
        try:
            from solders.instruction import Instruction
            from solders.pubkey import Pubkey

            ix = Instruction(
                program_id=Pubkey.from_string(settings.solana_memo_program),
                accounts=[],
                data=memo.encode("utf-8"),
            )
            sig = self._send([ix])
            return self._ok(
                sig, kind="anchor", trace_hash=trace_hash, decision_id=decision_id, memo=memo
            )
        except Exception as e:  # noqa: BLE001
            log.warning("solana.anchor_failed", error=str(e))
            return self._mock(
                "anchor", trace_hash=trace_hash, decision_id=decision_id, memo=memo, error=str(e)
            )

    def transfer_usdc(
        self, to: str, amount_usdc: float, *, decision_id: int | None = None
    ) -> dict[str, Any]:
        """SPL token transfer of the settle asset to `to` (an owner pubkey)."""
        if not self.real:
            return self._mock(
                "settle", usdc_amount=amount_usdc, to=to, decision_id=decision_id, mint=self.mint
            )
        try:
            from solders.pubkey import Pubkey
            from spl.token.constants import TOKEN_PROGRAM_ID
            from spl.token.instructions import (
                TransferCheckedParams,
                get_associated_token_address,
                transfer_checked,
            )

            mint = Pubkey.from_string(self.mint)
            owner = self.keypair.pubkey()
            dest_owner = Pubkey.from_string(to)
            src = get_associated_token_address(owner, mint)
            dst = get_associated_token_address(dest_owner, mint)
            amount = int(round(float(amount_usdc) * 10**USDC_DECIMALS))
            ix = transfer_checked(
                TransferCheckedParams(
                    program_id=TOKEN_PROGRAM_ID,
                    source=src,
                    mint=mint,
                    dest=dst,
                    owner=owner,
                    amount=amount,
                    decimals=USDC_DECIMALS,
                    signers=[],
                )
            )
            sig = self._send([ix])
            return self._ok(
                sig, kind="settle", usdc_amount=amount_usdc, to=to,
                decision_id=decision_id, mint=self.mint,
            )
        except Exception as e:  # noqa: BLE001
            log.warning("solana.settle_failed", error=str(e))
            return self._mock(
                "settle", usdc_amount=amount_usdc, to=to, decision_id=decision_id,
                mint=self.mint, error=str(e),
            )

    def usdc_balance(self) -> float | None:
        """SPL balance of the settle asset in the agent's associated token account."""
        if not self.real:
            return None
        try:
            from solders.pubkey import Pubkey
            from spl.token.instructions import get_associated_token_address

            ata = get_associated_token_address(
                self.keypair.pubkey(), Pubkey.from_string(self.mint)
            )
            resp = self.client.get_token_account_balance(ata)
            return float(resp.value.ui_amount or 0.0)
        except Exception:  # noqa: BLE001
            return None

    def sol_balance(self) -> float | None:
        """Native SOL balance (this is what pays fees on Solana)."""
        if not self.real:
            return None
        try:
            lamports = self.client.get_balance(self.keypair.pubkey()).value
            return lamports / 1_000_000_000
        except Exception:  # noqa: BLE001
            return None

    def rpc_ok(self) -> bool:
        if self.client is None:
            return False
        try:
            self.client.get_latest_blockhash()
            return True
        except Exception:  # noqa: BLE001
            return False

    # ---- internals ----

    def _send(self, instructions: list[Any]) -> str:
        from solders.message import MessageV0
        from solders.transaction import VersionedTransaction

        blockhash = self.client.get_latest_blockhash().value.blockhash
        msg = MessageV0.try_compile(
            payer=self.keypair.pubkey(),
            instructions=instructions,
            address_lookup_table_accounts=[],
            recent_blockhash=blockhash,
        )
        tx = VersionedTransaction(msg, [self.keypair])
        sig = self.client.send_transaction(tx).value
        self.client.confirm_transaction(sig, commitment="confirmed")
        return str(sig)

    def _ok(self, signature: str, *, kind: str, **extra: Any) -> dict[str, Any]:
        log.info("solana.tx", kind=kind, signature=signature)
        return {
            "tx_hash": signature,
            "signature": signature,
            "explorer_url": explorer_tx_url(signature, cluster=self.cluster),
            "mocked": False,
            "kind": kind,
            "network": network_name(self.cluster),
            "cluster": self.cluster,
            **extra,
        }

    def _mock(self, kind: str, **extra: Any) -> dict[str, Any]:
        sig = b58encode(secrets.token_bytes(64))
        return {
            "tx_hash": sig,
            "signature": sig,
            "explorer_url": explorer_tx_url(sig, cluster=self.cluster),
            "mocked": True,
            "kind": kind,
            "network": network_name(self.cluster),
            "cluster": self.cluster,
            **extra,
        }


_client: SolanaClient | None = None


def get_solana() -> SolanaClient:
    global _client
    if _client is None:
        _client = SolanaClient()
    return _client
