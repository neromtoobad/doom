"use client";

// Positions, on their own route.
//
// This used to be a panel that appeared above the board when a toggle was pressed,
// which meant the thing a returning user most wants to see had no address of its own.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import s from "../market.module.css";
import p from "./portfolio.module.css";
import Nav from "../components/Nav";
import * as constants from "@/utils/constants";
import {
  MARKETS,
  fmtStrk,
  loadPositions,
  positionValue,
  readMarket,
  type MarketState,
  type SavedPosition,
} from "@/lib/doom";
import { loadUserMarkets, normalizeAddress } from "@/lib/create";
import Portfolio from "../components/Portfolio";
import WalletVault from "../components/WalletVault";
import { useStoreWallet } from "../components/Wallet/walletContext";

export default function PortfolioPage() {
  const provider = constants.myFrontendProviders[0]; // mainnet
  const [saved, setSaved] = useState<SavedPosition[]>([]);
  const [markets, setMarkets] = useState<Record<string, MarketState>>({});
  const account = useStoreWallet((st) => st.myWalletAccount);
  const address = useStoreWallet((st) => st.address);

  const refresh = useCallback(async () => {
    const positions = loadPositions();
    setSaved(positions);
    // Only the markets a position points at — the whole board is not needed here.
    const wanted = [
      ...new Set([
        ...positions.map((x) => normalizeAddress(x.market)),
        ...loadUserMarkets().map((m) => normalizeAddress(m.address)),
      ]),
    ].filter((a) => positions.some((x) => normalizeAddress(x.market) === a));
    const entries = await Promise.all(
      wanted.map(async (a) => {
        try {
          return [a, await readMarket(provider, a)] as const;
        } catch {
          return null;
        }
      }),
    );
    const next: Record<string, MarketState> = {};
    for (const e of entries) if (e) next[e[0]] = e[1];
    // Keyed by the address each position stores, so lookups match.
    for (const pos of positions) {
      const n = normalizeAddress(pos.market);
      if (next[n] && !next[pos.market]) next[pos.market] = next[n];
    }
    setMarkets(next);
  }, [provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const marks = saved.map((x) => positionValue(x, markets[x.market]));
  const claimable = marks.reduce((a, v) => (v?.status === "won" ? a + v.value : a), 0n);

  return (
    <main className={s.page}>
      <Nav tag="your positions" />
      <div className={p.wrap}>
        <h1 className={p.title}>Portfolio</h1>
        <p className={p.lede}>
          A position keys off a secret, not an account, so nothing on chain says it is
          yours. Sign once and Doom rebuilds those secrets from your wallet, on any
          device. Bets made before this existed live only in the browser that made
          them — export those.
        </p>

        <WalletVault
          account={account as never}
          address={address}
          onMaster={() => {}}
          onRecovered={refresh}
        />

        {claimable > 0n && (
          <div className={p.claim}>
            <b>{fmtStrk(claimable)} STRK claimable.</b> Open the market and claim with the
            secret from the position.
          </div>
        )}

        <Portfolio
          saved={saved}
          markets={markets}
          onOpen={(a) => {
            window.location.href = `../#${a}`;
          }}
          onRestored={refresh}
        />

        {saved.length === 0 && (
          <p className={p.empty}>
            Nothing here yet. <Link href="/" className={p.link}>Find a market →</Link>
          </p>
        )}
      </div>
    </main>
  );
}
