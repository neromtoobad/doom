// The walkthrough has its own title because its URL is what the registry points at:
// a judge opening the submission link lands here, not on the board.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Doom — the walkthrough",
  description:
    "Three minutes against the deployed site: the book, the market maker, what a private bet actually costs, and how a market settles.",
  openGraph: {
    title: "Doom — the walkthrough",
    description:
      "Three minutes against the deployed site. Every number on screen is live.",
  },
};

export default function WatchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
