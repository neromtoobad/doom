"use client";

import { useEffect, useState } from "react";
import { hash, json, num, shortString, validateAndParseAddress } from "starknet";
import type { WALLET_API } from "@starknet-io/types-js";
import styles from "../../../uni.module.css";
import * as constants from "@/utils/constants";
import { useStoreWallet } from "../../Wallet/walletContext";
import { useFrontendProvider } from "../provider/providerContext";
import { StrkCoin } from "../../TokenIcons";
import SelectWallet from "./SelectWallet";

// DEMO: all actions use one token (STRK). Swap constants.addrSTRK for your token,
// or make the token a user selection.
const TOKEN = constants.addrSTRK;
// DEMO amounts, in the token's smallest unit (1e18 = 1 STRK). Replace with real
// UX (user-entered amounts) in your app.
const TEN_STRK = 10n * 10n ** 18n;
const FIVE_STRK = 5n * 10n ** 18n;
const ONE_STRK = 1n * 10n ** 18n;

// Format a felt amount (STRK, 18 decimals) as a human STRK string ("10", "1.5").
function fmtStrk(amount: bigint): string {
  const whole = amount / 10n ** 18n;
  const frac = (amount % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// Shorten a felt/hex for display, like the wallet address ("0x1dc5a1c...1927a").
function shortHex(h: string): string {
  const hex = num.toHex(h);
  return hex.length <= 13 ? hex : `${hex.slice(0, 7)}...${hex.slice(-4)}`;
}

// Verdict shown for the complex (echo invoke) action.
type VerdictRow = { label: string; value: string; ok?: boolean };
type Verdict = { ok: boolean; pending?: boolean; title: string; rows: VerdictRow[] };

// Human-readable result of an action - rendered as a receipt card, not raw JSON/hex.
type ResultRow = { label: string; value: string; hash?: string };
type ActionResult = {
  status: "pending" | "ok" | "error";
  title: string;
  rows?: ResultRow[];
  note?: string;
};

// Pretty on-chain status, e.g. "Accepted on L2 · Succeeded".
function prettyStatus(finality?: string, exec?: string): string {
  const f =
    finality === "ACCEPTED_ON_L2" ? "Accepted on L2"
      : finality === "ACCEPTED_ON_L1" ? "Accepted on L1"
      : finality === "RECEIVED" ? "Received"
      : finality ?? "";
  const e =
    exec === "SUCCEEDED" ? "Succeeded" : exec === "REVERTED" ? "Reverted" : "";
  return [f, e].filter(Boolean).join(" · ") || "Confirmed";
}

// Turn a raw tx receipt into a readable receipt card (amount, status, fee, events, hash).
function receiptToResult(txR: any, txH: string, amountLabel: string): ActionResult {
  const r = txR?.value ?? txR;
  const exec: string | undefined = r?.execution_status;
  const finality: string | undefined = r?.finality_status;
  const reverted = exec === "REVERTED";
  let feeStr: string | undefined;
  const feeRaw = r?.actual_fee?.amount ?? r?.actual_fee;
  try {
    if (feeRaw !== undefined && feeRaw !== null) feeStr = `${fmtStrk(num.toBigInt(feeRaw))} STRK`;
  } catch {
    /* leave fee undefined if unparseable */
  }
  const evCount = Array.isArray(r?.events) ? r.events.length : undefined;
  const rows: ResultRow[] = [];
  if (amountLabel) rows.push({ label: "Amount", value: amountLabel });
  rows.push({ label: "Status", value: prettyStatus(finality, exec) });
  if (feeStr) rows.push({ label: "Network fee", value: feeStr });
  if (evCount !== undefined) rows.push({ label: "Events", value: String(evCount) });
  rows.push({ label: "Transaction", value: shortHex(txH), hash: txH });
  return {
    status: reverted ? "error" : "ok",
    title: reverted ? "Transaction reverted" : "Transaction confirmed",
    rows,
  };
}

// Turn the shielded-balances response into a token → amount list.
function balancesToResult(raw: any): ActionResult {
  const r = raw?.value ?? raw;
  const arr = Array.isArray(r) ? r : null;
  if (arr && arr.length) {
    const strk = (() => {
      try {
        return num.toBigInt(TOKEN);
      } catch {
        return null;
      }
    })();
    const rows: ResultRow[] = arr.map((b: any) => {
      const token = b?.token ?? b?.token_address ?? b?.[0];
      const amount = b?.amount ?? b?.balance ?? b?.[1];
      let amtStr = String(amount);
      try {
        amtStr = `${fmtStrk(num.toBigInt(amount))} `;
      } catch {
        /* keep raw */
      }
      let label = "token";
      try {
        label = strk !== null && num.toBigInt(token) === strk ? "STRK" : shortHex(token);
      } catch {
        /* keep generic */
      }
      return { label, value: amtStr.trim() };
    });
    return { status: "ok", title: "Shielded balances", rows };
  }
  if (arr && !arr.length) {
    return {
      status: "ok",
      title: "No shielded balances",
      note: "This account holds nothing in the privacy pool yet.",
    };
  }
  // Unknown shape - never hide data; fall back to formatted JSON.
  return { status: "ok", title: "Shielded balances", note: json.stringify(r, undefined, 2) };
}

// A failed / rejected action.
function errorResult(msg: string): ActionResult {
  return { status: "error", title: "Action failed", note: msg };
}

// Tabs - one STRK20 action each (Umbra-style single-action interface).
type TabKey = "shield" | "send" | "unshield" | "echo" | "balances";
const TABS: { key: TabKey; label: string }[] = [
  { key: "shield", label: "Shield" },
  { key: "send", label: "Send" },
  { key: "unshield", label: "Unshield" },
  { key: "echo", label: "Echo" },
  { key: "balances", label: "Balances" },
];

export default function WalletAccountV6Tag() {
  const myFrontendProviderIndex = useFrontendProvider(
    (state) => state.currentFrontendProviderIndex
  );
  const myWalletAccount = useStoreWallet((state) => state.myWalletAccount);
  const connectedAddress = useStoreWallet((state) => state.address);
  const isConnected = useStoreWallet((state) => state.isConnected);
  const chain = useStoreWallet((state) => state.chain);
  const [chainIdWA, setChainIdWA] = useState<string>(chain);

  // STRK20 privacy pool is available on Mainnet (index 0) and Sepolia (index 2).
  const networkName = constants.Strk20Networks[myFrontendProviderIndex];
  const isStrk20Network = networkName !== undefined;
  // Echo-invoke helper is deployed per-network ("0x0" = not deployed on this one).
  const echoHelperAddr = constants.echoHelperForIndex(myFrontendProviderIndex);
  const hasEchoHelper = (() => {
    try {
      return num.toBigInt(echoHelperAddr) !== 0n;
    } catch {
      return false;
    }
  })();

  // Per-action result - structured, rendered as a readable receipt card.
  const [resultBalances, setResultBalances] = useState<ActionResult | null>(null);
  const [resultShield, setResultShield] = useState<ActionResult | null>(null);
  const [resultUnshield, setResultUnshield] = useState<ActionResult | null>(null);
  const [resultTransfer, setResultTransfer] = useState<ActionResult | null>(null);
  const [resultComplex, setResultComplex] = useState<ActionResult | null>(null);
  // Verdict for the complex action (Invoked event verification).
  const [verdictComplex, setVerdictComplex] = useState<Verdict | null>(null);
  // Echo-helper deploy (shown only on a supported network with no helper yet).
  const [resultDeploy, setResultDeploy] = useState<ActionResult | null>(null);
  const [deploying, setDeploying] = useState<boolean>(false);
  // Active action tab (Umbra-style single-action interface).
  const [tab, setTab] = useState<TabKey>("shield");

  const getWAchainId = () => {
    myWalletAccount?.provider
      .getChainId()
      .then((result: any) => setChainIdWA(result.toString()));
  };

  useEffect(() => {
    getWAchainId();
  }, [myFrontendProviderIndex, chain]);

  // Submit STRK20 actions through the WalletAccountV6 instance, show the tx hash, then
  // wait for the receipt (privacy-pool txs verify a STARK proof on-chain - long budget).
  // Returns the tx hash on success, or undefined on error.
  async function submit(
    actions: WALLET_API.STRK20_ACTION[],
    setResult: (r: ActionResult) => void,
    amountLabel: string
  ): Promise<string | undefined> {
    if (!myWalletAccount) {
      setResult(errorResult("No WalletAccount available."));
      return undefined;
    }
    let txH: string;
    try {
      const r = await myWalletAccount.strk20InvokeTransaction(actions);
      txH = r.transaction_hash;
    } catch (error: any) {
      setResult(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
      return undefined;
    }
    setResult({
      status: "pending",
      title: "Waiting for confirmation…",
      rows: [
        { label: "Amount", value: amountLabel },
        { label: "Transaction", value: shortHex(txH), hash: txH },
      ],
    });
    // myWalletAccount.provider is fixed at connect time (Sepolia) and can point at the
    // wrong network; use the frontend provider that tracks the current network instead.
    const provider = constants.myFrontendProviders[myFrontendProviderIndex];
    try {
      const txR = await provider.waitForTransaction(txH, {
        retries: 400,
        retryInterval: 3000,
      });
      setResult(receiptToResult(txR, txH, amountLabel));
    } catch (error: any) {
      setResult({
        status: "error",
        title: "Could not confirm transaction",
        rows: [{ label: "Transaction", value: shortHex(txH), hash: txH }],
        note: error?.message ?? error?.toString?.() ?? String(error),
      });
    }
    return txH;
  }

  // Deploy a fresh echo-helper instance (StrkInvokeHelper) on the current network via
  // the connected wallet. The class is already declared (Mainnet + Sepolia) and has no
  // constructor, so this is a single UDC deploy the wallet signs. Shows the new address.
  const handleDeployHelper = async () => {
    setResultDeploy(null);
    if (!myWalletAccount) {
      setResultDeploy(errorResult("No WalletAccount available."));
      return;
    }
    setDeploying(true);
    try {
      setResultDeploy({ status: "pending", title: "Confirm the deploy in your wallet…" });
      const { transaction_hash, contract_address } = await myWalletAccount.deployContract({
        classHash: constants.Strk20EchoHelperClassHash,
        constructorCalldata: [],
      });
      const addr = validateAndParseAddress(contract_address);
      setResultDeploy({
        status: "pending",
        title: "Deploying echo helper…",
        rows: [
          { label: "Address", value: shortHex(addr) },
          { label: "Transaction", value: shortHex(transaction_hash), hash: transaction_hash },
        ],
      });
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      await provider.waitForTransaction(transaction_hash, { retries: 200, retryInterval: 3000 });
      setResultDeploy({
        status: "ok",
        title: `Echo helper deployed on ${networkName}`,
        rows: [
          { label: "Address", value: shortHex(addr) },
          { label: "Transaction", value: shortHex(transaction_hash), hash: transaction_hash },
        ],
        note:
          `Add this to .env.local and restart the dev server to enable Echo:\n` +
          `NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA=${addr}`,
      });
    } catch (error: any) {
      setResultDeploy(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    } finally {
      setDeploying(false);
    }
  };

  // Query the private (shielded) balances of ALL tokens held in the pool - empty array
  // means "all shielded tokens". Read via the WalletAccountV6 instance method.
  const handleBalances = async () => {
    setResultBalances(null);
    if (!myWalletAccount) {
      setResultBalances(errorResult("No WalletAccount available."));
      return;
    }
    try {
      const r = await myWalletAccount.strk20Balances([]);
      setResultBalances(balancesToResult(r));
    } catch (error: any) {
      setResultBalances(errorResult(error?.message ?? error?.toString?.() ?? String(error)));
    }
  };

  const handleShield = async () => {
    setResultShield(null);
    const actions: WALLET_API.STRK20_ACTION[] = [
      { type: "deposit", token: TOKEN, amount: num.toHex(TEN_STRK) },
    ];
    await submit(actions, setResultShield, "10 STRK");
  };

  const handleUnshield = async () => {
    setResultUnshield(null);
    if (!connectedAddress) {
      setResultUnshield(errorResult("Connect a wallet first (recipient = connected account)."));
      return;
    }
    const actions: WALLET_API.STRK20_ACTION[] = [
      { type: "withdraw", token: TOKEN, amount: num.toHex(ONE_STRK), recipient: connectedAddress },
    ];
    await submit(actions, setResultUnshield, "1 STRK");
  };

  const handleSelfTransfer = async () => {
    setResultTransfer(null);
    if (!connectedAddress) {
      setResultTransfer(errorResult("Connect a wallet first (recipient = connected account)."));
      return;
    }
    const actions: WALLET_API.STRK20_ACTION[] = [
      { type: "transfer", token: TOKEN, amount: num.toHex(ONE_STRK), recipient: connectedAddress },
    ];
    await submit(actions, setResultTransfer, "1 STRK");
  };

  // Complex action - echo invoke round-trip: withdraw 5 STRK to the helper, create an
  // open note for the output, and invoke the helper to fill it. Then verify the Invoked
  // event on-chain (open note filled with 5 STRK).
  const handleComplex = async () => {
    setResultComplex(null);
    setVerdictComplex(null);
    if (!connectedAddress) {
      setResultComplex(errorResult("Connect a wallet first (open note recipient = connected account)."));
      return;
    }
    const helper = num.toHex(echoHelperAddr);
    // "OPEN" / ${poolAddress} / ${openNoteIds[0]} are literal placeholder strings the
    // wallet substitutes during assembly - they must NOT be hex-normalized.
    const actions: WALLET_API.STRK20_ACTION[] = [
      { type: "withdraw", token: TOKEN, amount: num.toHex(FIVE_STRK), recipient: helper },
      { type: "transfer", token: TOKEN, amount: "OPEN", recipient: connectedAddress },
      {
        type: "invoke",
        contract: helper,
        calldata: [num.toHex(TOKEN), "${poolAddress}", "${openNoteIds[0]}"],
      },
    ];
    const txH = await submit(actions, setResultComplex, "5 STRK");
    if (!txH) return;
    setVerdictComplex({
      ok: false,
      pending: true,
      title: "Verifying on-chain…",
      rows: [{ label: "tx", value: shortHex(txH) }],
    });
    setVerdictComplex(await verifyEcho(txH));
  };

  // Fetch the tx receipt and verify the helper's Invoked event: the open note was filled
  // with the 5 STRK we withdrew. Returns a pass/fail verdict (never throws).
  async function verifyEcho(txHash: string): Promise<Verdict> {
    try {
      // Use the frontend provider that tracks the current network, not
      // myWalletAccount.provider which is fixed at connect time.
      const provider = constants.myFrontendProviders[myFrontendProviderIndex];
      if (!provider) {
        return { ok: false, title: "Cannot verify (no provider)", rows: [{ label: "tx", value: shortHex(txHash) }] };
      }
      const helperHex = num.toHex(echoHelperAddr);
      const selInvoked = num.toHex(hash.getSelectorFromName("Invoked"));
      const receipt: any = await provider.waitForTransaction(txHash, {
        retries: 400,
        retryInterval: 3000,
      });
      if (receipt?.execution_status === "REVERTED" || (receipt?.isSuccess && !receipt.isSuccess())) {
        return { ok: false, title: "Transaction reverted", rows: [{ label: "tx", value: shortHex(txHash), ok: false }] };
      }
      const events: any[] = receipt?.events ?? receipt?.value?.events ?? [];
      const ev = events.find((e) => {
        try {
          return (
            e?.keys?.length &&
            e.from_address &&
            num.toHex(e.from_address) === helperHex &&
            num.toHex(e.keys[0]) === selInvoked
          );
        } catch {
          return false;
        }
      });
      if (!ev) {
        return {
          ok: false,
          title: "Invoked event NOT found",
          rows: [
            { label: "events", value: `${events.length} in receipt`, ok: false },
            { label: "tx", value: shortHex(txHash) },
          ],
        };
      }
      // Event layout: keys = [selector, note_id (#[key])], data = [amount (u128), caller].
      const noteId = ev.keys[1] as string;
      const amount = ev.data[0] as string;
      const caller = ev.data[1] as string;
      const amountOk = num.toBigInt(amount) === FIVE_STRK;
      return {
        ok: amountOk,
        title: amountOk ? "Echo verified - open note filled with 5 STRK" : "Event found, but amount mismatch",
        rows: [
          { label: "note_id", value: shortHex(noteId), ok: true },
          { label: "amount", value: `${fmtStrk(num.toBigInt(amount))} STRK`, ok: amountOk },
          { label: "caller (pool)", value: shortHex(caller) },
          { label: "tx", value: shortHex(txHash) },
        ],
      };
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      return {
        ok: false,
        title: `Could not fetch / parse receipt - ${msg}`,
        rows: [{ label: "tx", value: shortHex(txHash) }],
      };
    }
  }

  const walletAddr = myWalletAccount?.address
    ? validateAndParseAddress(myWalletAccount.address)
    : "";
  const shortWallet = walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : "-";

  // Voyager explorer link for a tx hash on the current network.
  const explorerTxUrl = (h: string) =>
    myFrontendProviderIndex === 0
      ? `https://voyager.online/tx/${h}`
      : `https://sepolia.voyager.online/tx/${h}`;

  // Readable receipt card - replaces the old raw-JSON/hex result blob.
  const ResultCard = ({ r }: { r: ActionResult }) => (
    <div
      className={`${styles.receipt} ${
        r.status === "error"
          ? styles.receiptError
          : r.status === "pending"
          ? styles.receiptPending
          : styles.receiptOk
      }`}
    >
      <div className={styles.receiptHead}>
        <span className={styles.receiptIcon}>
          {r.status === "ok" ? "✓" : r.status === "error" ? "!" : "⋯"}
        </span>
        <span>{r.title}</span>
      </div>
      {r.rows?.length ? (
        <div className={styles.receiptRows}>
          {r.rows.map((row) => (
            <div key={row.label} className={styles.receiptRow}>
              <span className={styles.receiptLabel}>{row.label}</span>
              {row.hash ? (
                <a
                  className={styles.receiptLink}
                  href={explorerTxUrl(row.hash)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.value} ↗
                </a>
              ) : (
                <span className={styles.receiptValue}>{row.value}</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {r.note ? <pre className={styles.receiptNote}>{r.note}</pre> : null}
    </div>
  );

  // Per-tab content: label, the fixed amount + token, a one-line hint, the CTA
  // label, its handler, and the structured result.
  const CONFIG: Record<
    TabKey,
    { label: string; value: string; token: string; hint: string; cta: string; onRun: () => void; result: ActionResult | null; disabled: boolean }
  > = {
    shield: { label: "You're shielding", value: "10", token: "STRK", hint: "Deposit into the privacy pool", cta: "Shield", onRun: handleShield, result: resultShield, disabled: !isStrk20Network },
    send: { label: "You're sending - to self", value: "1", token: "STRK", hint: "Private in-pool transfer", cta: "Self transfer", onRun: handleSelfTransfer, result: resultTransfer, disabled: !isStrk20Network },
    unshield: { label: "You're unshielding", value: "1", token: "STRK", hint: "Withdraw to your account", cta: "Unshield", onRun: handleUnshield, result: resultUnshield, disabled: !isStrk20Network },
    echo: { label: "Echo invoke round-trip", value: "5", token: "STRK", hint: "Withdraw → helper → refill open note", cta: "Run echo", onRun: handleComplex, result: resultComplex, disabled: !isStrk20Network || !hasEchoHelper },
    balances: { label: "Shielded balances", value: "All", token: "tokens", hint: "Read your private pool balances", cta: "Query balances", onRun: handleBalances, result: resultBalances, disabled: !isStrk20Network },
  };
  const active = CONFIG[tab];

  return (
    <div className={styles.panel}>
      {/* Action tabs */}
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Active-action input block */}
      <div className={styles.inputBlock}>
        <div className={styles.inputLabel}>{active.label}</div>
        <div className={styles.inputMain}>
          <div className={styles.bigValue}>{active.value}</div>
          <span className={styles.tokenPill}>
            <span className={styles.tokenDot}>
              <StrkCoin size={22} />
            </span>
            {active.token}
          </span>
        </div>
        <div className={styles.subLine}>
          <span>{active.hint}</span>
          <span className={styles.subMono}>{shortWallet}</span>
        </div>
      </div>

      {/* Info / network row */}
      <div className={styles.feeRow}>
        <span>Network</span>
        <span className={`${styles.feeVal} ${isStrk20Network ? styles.netOk : styles.netBad}`}>
          <span className={`${styles.netDot} ${isStrk20Network ? styles.netOkDot : styles.netBadDot}`} />
          {networkName ?? "Unsupported"}
        </span>
      </div>

      {!isStrk20Network && (
        <div className={styles.warn}>
          STRK20 actions require Mainnet or Sepolia - switch your wallet network.
        </div>
      )}

      {/* Echo-helper deploy (echo tab, supported network, no helper yet) */}
      {tab === "echo" && isStrk20Network && !hasEchoHelper && (
        <>
          <div className={styles.warn}>
            Echo helper not deployed on {networkName}. Deploy one, then set
            NEXT_PUBLIC_STRK20_ECHO_HELPER_SEPOLIA.
          </div>
          <button
            className={`${styles.btn} ${styles.btnGreen} ${styles.btnBlock}`}
            disabled={deploying}
            onClick={handleDeployHelper}
          >
            {deploying ? "Deploying…" : `Deploy echo helper (${networkName})`}
          </button>
          {resultDeploy ? <ResultCard r={resultDeploy} /> : null}
        </>
      )}

      {/* Primary CTA - connect prompt until a wallet is connected. */}
      {isConnected ? (
        <button className={styles.btnCta} disabled={active.disabled} onClick={active.onRun}>
          {active.cta}
        </button>
      ) : (
        <SelectWallet variant="ctaBig" />
      )}

      {/* Echo verdict */}
      {tab === "echo" && verdictComplex && (
        <div
          className={`${styles.verdict} ${
            verdictComplex.pending ? "" : verdictComplex.ok ? styles.verdictPass : styles.verdictFail
          }`}
        >
          <div className={styles.verdictHead}>
            <span>{verdictComplex.pending ? "⏳" : verdictComplex.ok ? "✅" : "❌"}</span>
            {verdictComplex.title}
          </div>
          {verdictComplex.rows.map((row) => (
            <div key={row.label} className={styles.verdictRow}>
              {row.ok !== undefined && <span>{row.ok ? "✅" : "❌"}</span>}
              <b>{row.label}:</b>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Inline result */}
      {active.result ? <ResultCard r={active.result} /> : null}
    </div>
  );
}
