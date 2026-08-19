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
  title: 'Doom — private futarchy on Starknet',
  description:
    'The market is the vote. Decision markets with public prices and invisible voters, settling through the STRK20 privacy pool on Starknet mainnet.',
  openGraph: {
    title: 'Doom — private futarchy on Starknet',
    description: 'Public prices. Invisible voters. The market is the vote.',
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
