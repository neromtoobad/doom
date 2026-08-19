"use client";

// Dev tool, not part of the demo. Declares and deploys DoomMarket through the
// connected wallet so no terminal or private key handling is needed.
//
// Everything here is a one-off: once the market is live its address goes into
// src/utils/constants.ts and this page stops mattering.

import { useState } from "react";
import { byteArray, hash, validateAndParseAddress, constants as SNconstants } from "starknet";
import SelectWallet from "../components/client/WalletHandle/SelectWallet";
import { useStoreWallet } from "../components/Wallet/walletContext";
import * as constants from "@/utils/constants";
import sierra from "@/contracts/DoomMarket.sierra.json";
import casm from "@/contracts/DoomMarket.casm.json";

/** The STRK20 privacy pool on mainnet. Pinned into the contract at construction. */
const POOL = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

/** Fixed at deployment and unchangeable afterwards. */
const QUESTION = "Will strk20-hackathon PR #100 merge before 2026-08-25 23:59 UTC?";

type Step = { label: string; value?: string; href?: string };

export default function DeployPage() {
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const chain = useStoreWallet((s) => s.chain);

  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string>("");

  const push = (s: Step) => setSteps((prev) => [...prev, s]);

  // The class hash of the artifact bundled in this build. Deploying anything else
  // would mean shipping code the test suite never saw.
  const expectedClassHash = hash.computeSierraContractClassHash(sierra as never);

  const constructorCalldata = () => {
    const q = byteArray.byteArrayFromString(QUESTION);
    return [
      POOL,
      address, // resolver: the connected wallet, the only address that can settle
      constants.addrSTRK,
      q.data.length.toString(),
      ...q.data.map((d) => d.toString()),
      q.pending_word.toString(),
      q.pending_word_len.toString(),
    ];
  };

  const run = async () => {
    setError("");
    setSteps([]);
    if (!myWalletAccount) {
      setError("Connect a wallet first.");
      return;
    }
    // requestChainId returns the raw felt id (0x534e5f4d41494e), not the "SN_MAIN" label.
    if (chain !== SNconstants.StarknetChainId.SN_MAIN) {
      setError(
        `Wrong network. Wallet reports "${chain || "unknown"}", expected ` +
          `"${SNconstants.StarknetChainId.SN_MAIN}" (mainnet).`,
      );
      return;
    }
    setBusy(true);
    try {
      const provider = constants.myFrontendProviders[0];

      // 1. Declare, unless this exact class is already on chain.
      let declared = false;
      try {
        await provider.getClassByHash(expectedClassHash);
        declared = true;
        push({ label: "Class already declared", value: expectedClassHash });
      } catch {
        /* not declared yet */
      }

      if (!declared) {
        push({ label: "Confirm the DECLARE in your wallet…" });
        const res = await myWalletAccount.declare({
          contract: sierra as never,
          casm: casm as never,
        });
        push({
          label: "Declare submitted",
          value: res.transaction_hash,
          href: `https://voyager.online/tx/${res.transaction_hash}`,
        });
        await provider.waitForTransaction(res.transaction_hash, {
          retries: 200,
          retryInterval: 3000,
        });
        push({ label: "Class declared", value: expectedClassHash });
      }

      // 2. Deploy an instance.
      push({ label: "Confirm the DEPLOY in your wallet…" });
      const { transaction_hash, contract_address } = await myWalletAccount.deployContract({
        classHash: expectedClassHash,
        constructorCalldata: constructorCalldata(),
      });
      const addr = validateAndParseAddress(contract_address);
      push({
        label: "Deploy submitted",
        value: transaction_hash,
        href: `https://voyager.online/tx/${transaction_hash}`,
      });
      await provider.waitForTransaction(transaction_hash, { retries: 200, retryInterval: 3000 });

      push({ label: "MARKET ADDRESS", value: addr, href: `https://voyager.online/contract/${addr}` });
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={S.page}>
      <div style={S.card}>
        <h1 style={S.h1}>Deploy DoomMarket</h1>
        <p style={S.sub}>
          One-off dev tool. Declares and deploys the market through your wallet — no terminal.
        </p>

        <dl style={S.dl}>
          <Row k="Question" v={QUESTION} />
          <Row k="Pool" v={POOL} mono />
          <Row k="Resolver" v={address || "— connect a wallet —"} mono />
          <Row k="Token" v={constants.addrSTRK} mono />
          <Row k="Class hash" v={expectedClassHash} mono />
          <Row
            k="Network"
            v={
              !chain
                ? "— not connected —"
                : chain === SNconstants.StarknetChainId.SN_MAIN
                  ? "MAINNET ✓"
                  : `NOT MAINNET (${chain})`
            }
          />
        </dl>

        <div style={{ margin: "20px 0" }}>
          <SelectWallet />
        </div>

        <button onClick={run} disabled={busy || !myWalletAccount} style={S.btn}>
          {busy ? "Working — check your wallet…" : "Declare + Deploy"}
        </button>

        <p style={S.warn}>
          Two wallet prompts: a declare, then a deploy. Neither is a scored transaction — the
          three scored ones come afterwards, from staking and claiming.
        </p>

        {steps.length > 0 && (
          <ol style={S.steps}>
            {steps.map((s, i) => (
              <li key={i} style={S.step}>
                <span>{s.label}</span>
                {s.value &&
                  (s.href ? (
                    <a href={s.href} target="_blank" rel="noreferrer" style={S.mono}>
                      {s.value}
                    </a>
                  ) : (
                    <code style={S.mono}>{s.value}</code>
                  ))}
              </li>
            ))}
          </ol>
        )}

        {error && <pre style={S.err}>{error}</pre>}
      </div>
    </main>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <>
      <dt style={S.dt}>{k}</dt>
      <dd style={{ ...S.dd, ...(mono ? S.mono : {}) }}>{v}</dd>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b0b0b",
    color: "#e8e8e8",
    display: "flex",
    justifyContent: "center",
    padding: "48px 20px",
    fontFamily: "system-ui, sans-serif",
  },
  card: { width: "100%", maxWidth: 720 },
  h1: { fontSize: 28, margin: "0 0 6px" },
  sub: { color: "#9a9a9a", margin: "0 0 28px", fontSize: 14 },
  dl: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: "10px 16px",
    padding: 18,
    border: "1px solid #262626",
    borderRadius: 10,
    background: "#121212",
    margin: 0,
  },
  dt: { color: "#8a8a8a", fontSize: 13 },
  dd: { margin: 0, fontSize: 13, wordBreak: "break-all" },
  mono: { fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#7ee787", wordBreak: "break-all" },
  btn: {
    width: "100%",
    padding: "14px 18px",
    fontSize: 15,
    fontWeight: 600,
    borderRadius: 10,
    border: "1px solid #2f6f43",
    background: "#16351f",
    color: "#d8ffe4",
    cursor: "pointer",
  },
  warn: { color: "#8a8a8a", fontSize: 12, marginTop: 12, lineHeight: 1.5 },
  steps: { marginTop: 24, paddingLeft: 18, display: "grid", gap: 10 },
  step: { fontSize: 13, display: "grid", gap: 4 },
  err: {
    marginTop: 20,
    padding: 14,
    border: "1px solid #5b2626",
    background: "#2a1414",
    color: "#ffb4b4",
    borderRadius: 10,
    fontSize: 12,
    whiteSpace: "pre-wrap",
  },
};
