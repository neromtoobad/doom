"use client";

// The walkthrough, served from the site itself.
//
// Hosting it here rather than only on a video platform means the version a judge
// watches is the version this repo deploys — they cannot drift apart, and there is
// no upload step between shipping a change and the film that describes it.

import s from "../market.module.css";
import w from "./watch.module.css";
import Nav from "../components/Nav";

const CHAPTERS: [string, string][] = [
  ["0:00", "What Doom is"],
  ["0:08", "Why public bettors break a market"],
  ["0:28", "The book — every size, no names"],
  ["0:50", "The market maker, and what depth costs"],
  ["1:08", "What a bet actually costs"],
  ["1:37", "Opening a market"],
  ["1:58", "Settlement, and the line we do not cross"],
  ["2:18", "Keys from your wallet, not your browser"],
  ["2:31", "Proof"],
];

export default function Watch() {
  return (
    <main className={s.page}>
      <Nav tag="three minutes, end to end" />
      <div className={w.wrap}>
        <h1 className={w.title}>The walkthrough</h1>
        <p className={w.lede}>
          Three minutes, recorded against the deployed site. Every number on screen is
          live — the oracle median, the contract&apos;s own quote, the real reserves.
        </p>

        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video className={w.video} controls preload="metadata" playsInline poster="og.png">
          <source src="walkthrough.mp4" type="video/mp4" />
          Your browser cannot play this video.{" "}
          <a href="walkthrough.mp4" className={w.link}>Download it instead</a>.
        </video>

        <div className={w.chapters}>
          {CHAPTERS.map(([t, label]) => (
            <div key={t} className={w.chapter}>
              <span className={w.time}>{t}</span>
              <span className={w.label}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
