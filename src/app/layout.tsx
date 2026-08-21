import type { Metadata } from 'next'
import { Inter, Space_Mono, Unbounded } from 'next/font/google'
import './globals.css'

// Inter for body, a mono for hex, and Unbounded — a wide display face — for the
// wordmark, questions and big numbers. That contrast is most of the personality.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono-ui',
  display: 'swap',
})
const unbounded = Unbounded({
  subsets: ['latin'],
  weight: ['500', '700', '900'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Doom — a private prediction market on Starknet',
  description:
    'Visible odds, invisible bettors. Bet sizes and odds stay public so the market stays accurate; who is betting is hidden. Live on Starknet mainnet through the STRK20 privacy pool.',
  openGraph: {
    type: 'website',
    url: 'https://neromtoobad.github.io/doom/',
    siteName: 'Doom',
    title: 'Doom — a private prediction market on Starknet',
    description:
      'Visible odds, invisible bettors. Live on Starknet mainnet through the STRK20 privacy pool.',
    images: [
      {
        url: 'https://neromtoobad.github.io/doom/og.png',
        width: 1200,
        height: 630,
        alt: 'Doom — visible odds, invisible bettors',
      },
    ],
  },
  twitter: {
    // Large card, so a shared link renders the board rather than a text stub.
    card: 'summary_large_image',
    title: 'Doom — a private prediction market on Starknet',
    description: 'Visible odds. Invisible bettors.',
    images: ['https://neromtoobad.github.io/doom/og.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceMono.variable} ${unbounded.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  )
}
