"use client";

// One navigation bar for every page.
//
// The site used to be a single route with the board, the market view and the
// portfolio stacked into it, and the only way to reach shielding was to know that
// /tools existed. Sections are routes now, and this is what makes them reachable.

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import s from "../market.module.css";
import markImg from "../../../public/brand/mark-96.png";
import SelectWallet from "./client/WalletHandle/SelectWallet";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/portfolio/", label: "Portfolio" },
  { href: "/wallet/", label: "Wallet" },
  { href: "/how-it-works/", label: "How it works" },
] as const;

export default function Nav({ tag = "visible odds, invisible bettors" }: { tag?: string }) {
  // basePath is stripped from usePathname, so these compare cleanly on Pages.
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href.replace(/\/$/, ""));

  return (
    <nav className={s.nav}>
      <div className={s.navLeft}>
        <Link href="/" className={s.brandBtn}>
          <Image src={markImg} alt="Doom" width={40} height={40} className={s.markImg} priority />
          <span className={s.wordmark}>DOOM</span>
        </Link>
        <span className={s.navTag}>{tag}</span>
      </div>

      <div className={s.navLinks}>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={active(l.href) ? `${s.navLink} ${s.navLinkOn}` : s.navLink}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <div className={s.navRight}>
        <Link href="/create/" className={`${s.pill} ${s.pillCta}`}>
          + Open a market
        </Link>
        <SelectWallet variant="nav" />
      </div>
    </nav>
  );
}
