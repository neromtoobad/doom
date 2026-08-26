"use client";

// Recover positions from the wallet instead of from this browser.
//
// Signing one fixed message rebuilds the key every position was derived from, so the
// same wallet finds the same bets on a phone, a laptop, or a browser whose storage
// was cleared. Nothing is uploaded and nothing is stored: the commitments are derived
// locally and checked against the contracts.

import { useState } from "react";
import s from "../market.module.css";
import v from "./vault.module.css";
import { MARKETS, savePosition, loadPositions, type SavedPosition } from "@/lib/doom";
import { deriveMaster, recoverPositions, NonDeterministicWallet } from "@/lib/vault";
import { loadUserMarkets, normalizeAddress } from "@/lib/create";
import * as constants from "@/utils/constants";

type Signer = { signMessage: (t: never, a: string) => Promise<unknown> };

export default function WalletVault({
  account,
  address,
  onMaster,
  onRecovered,
}: {
  account: Signer | undefined;
  address: string;
  onMaster: (m: string) => void;
  onRecovered: () => void;
}) {
  const provider = constants.myFrontendProviders[0]; // mainnet
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function unlock() {
    if (!account || !address) {
      setMsg({ ok: false, text: "Connect a wallet first." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const master = await deriveMaster(
        account as unknown as Parameters<typeof deriveMaster>[0],
        address,
      );
      onMaster(master);

      const known = [
        ...MARKETS,
        ...loadUserMarkets().map((m) => normalizeAddress(m.address)),
      ];
      const found = await recoverPositions(provider, master, [...new Set(known)]);

      const have = new Set(loadPositions().map((p: SavedPosition) => `${p.market}:${p.secret}`));
      let added = 0;
      for (const p of found) {
        if (have.has(`${p.market}:${p.secret}`)) continue;
        savePosition(p);
        added++;
      }
      onRecovered();
      setMsg({
        ok: true,
        text: added
          ? `Recovered ${added} position${added === 1 ? "" : "s"} from your wallet.`
          : found.length
            ? "Your wallet's positions were already here."
            : "No positions found for this wallet yet. New bets will be recoverable.",
      });
    } catch (e: unknown) {
      setMsg({
        ok: false,
        text:
          e instanceof NonDeterministicWallet
            ? e.message
            : ((e as { message?: string })?.message ?? String(e)),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={v.box}>
      <div className={v.head}>
        <span className={v.title}>Positions from your wallet</span>
        <span className={v.tag}>no storage</span>
      </div>
      <p className={v.body}>
        Sign once and Doom rebuilds every position key from your wallet — the same
        bets appear on any device, even one that has never seen this site. The
        signature never leaves your browser, and the chain still records no address.
      </p>
      <div className={v.row}>
        <button className={v.btn} onClick={unlock} disabled={busy || !account}>
          {busy ? "Checking the chain…" : "Unlock with wallet"}
        </button>
        <span className={v.note}>Two prompts: the second proves the key can be rebuilt.</span>
      </div>
      {msg && <div className={msg.ok ? s.oracleOk : s.oracleErr}>{msg.text}</div>}
    </div>
  );
}
