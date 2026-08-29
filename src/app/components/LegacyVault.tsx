"use client";

// Moving positions made before keys were wallet-derived.
//
// Bets placed today need none of this: the secret is derived from a wallet signature,
// so it is reproducible on any device and there is nothing to back up. But positions
// taken before that shipped used a random secret that exists in exactly one browser's
// localStorage, and clearing site data destroys the funds. Removing the export button
// while those positions were still outstanding was a mistake — it left real money
// reachable from one browser and nowhere else, with no way out.
//
// So this is deliberately narrow: a way to carry legacy secrets to another browser,
// and a way to bring them back. It is gated behind the same wallet check as the rest
// of the portfolio, because a plain export button hands every secret in the vault to
// whoever happens to be sitting at the machine.

import { useRef, useState } from "react";
import v from "./legacy.module.css";
import { exportPositions, importPositions, loadPositions, canonMarket } from "@/lib/doom";

export default function LegacyVault({ onChange }: { onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState("");

  const all = loadPositions();
  // Positions whose secret cannot be re-derived are the ones with something to lose.
  const legacy = all.length;

  function download() {
    const blob = new Blob([exportPositions()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doom-positions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg({ ok: true, text: `${legacy} position${legacy === 1 ? "" : "s"} written to a file. Keep it somewhere only you can read — a secret in it can spend the position.` });
  }

  function take(text: string) {
    try {
      const { added, skipped } = importPositions(text);
      onChange();
      setMsg({
        ok: true,
        text:
          added === 0
            ? `Nothing new — all ${skipped} position${skipped === 1 ? " was" : "s were"} already here.`
            : `${added} position${added === 1 ? "" : "s"} restored${skipped ? `, ${skipped} already here` : ""}.`,
      });
      setPaste("");
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message ?? "Could not read that file." });
    }
  }

  return (
    <div className={v.box}>
      <button className={v.head} onClick={() => setOpen((o) => !o)} type="button">
        <span className={v.title}>Move older positions between browsers</span>
        <span className={v.toggle}>{open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className={v.body}>
          <p className={v.note}>
            Bets placed now need nothing here — their secret comes from your wallet
            signature, so it rebuilds on any device. Positions taken before that shipped
            used a random secret that lives in this browser only. This browser holds{" "}
            <b>{legacy}</b>.
          </p>

          <div className={v.actions}>
            <button className={v.btn} onClick={download} disabled={legacy === 0} type="button">
              Save them to a file
            </button>
            <button className={v.btn} onClick={() => file.current?.click()} type="button">
              Restore from a file
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className={v.file}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) take(await f.text());
                e.target.value = "";
              }}
            />
          </div>

          <div className={v.label}>Or paste a backup</div>
          <textarea
            className={v.paste}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='{"tag":"doom:positions:v1", …}'
            rows={3}
          />
          <button
            className={v.btn}
            onClick={() => take(paste)}
            disabled={!paste.trim()}
            type="button"
          >
            Restore from this text
          </button>

          {msg && <p className={msg.ok ? v.ok : v.err}>{msg.text}</p>}

          {legacy > 0 && (
            <>
              <div className={v.label}>In this browser</div>
              {all.map((p) => (
                <div key={`${canonMarket(p.market)}:${p.secret}`} className={v.row}>
                  <span className={v.rowK}>
                    {canonMarket(p.market).slice(0, 10)}…{canonMarket(p.market).slice(-4)}
                  </span>
                  <span className={v.rowV}>{p.outcome === 1 ? "YES" : "NO"}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
