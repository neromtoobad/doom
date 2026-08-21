import React from 'react'
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Shot } from '../components/Shot'
import { Caption, Ring, StepBadge } from '../components/Callout'
import { Bg, Grain, Vignette } from '../components/Bg'
import { FlowArrow, FlowNode } from '../components/Flow'
import { Kicker, Title } from '../components/Type'
import { C, sec } from '../theme'
import { body, mono } from '../fonts'
import RECTS from '../data/rects.json'
import CHAIN from '../data/chain.json'

const short = (a: string) => a.slice(0, 10) + '…' + a.slice(-6)

/** Lands after the four rows have finished dealing in. */
const useTail = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - 24 - CHAIN.length * 11 - 8, fps, config: { damping: 200 } })
  return { opacity: s, transform: `translateY(${interpolate(s, [0, 1], [16, 0])}px)` }
}

/** The four transactions, side by side. Four different senders is the argument. */
const SenderTable: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 34 }}>
      {CHAIN.map((t, i) => {
        const s = spring({ frame: frame - 24 - i * 11, fps, config: { damping: 200, mass: 0.6 } })
        return (
          <div
            key={t.hash}
            style={{
              opacity: s,
              transform: `translateX(${interpolate(s, [0, 1], [-24, 0])}px)`,
              display: 'grid',
              gridTemplateColumns: '340px 340px 190px 170px',
              gap: 26,
              alignItems: 'center',
              padding: '19px 28px',
              borderRadius: 14,
              background: 'rgba(20,20,24,0.8)',
              border: `1px solid ${C.line}`,
              fontFamily: mono,
              fontSize: 23,
            }}
          >
            <span style={{ color: C.muted }}>{short(t.hash)}</span>
            <span style={{ color: C.accent }}>{short(t.sender ?? '')}</span>
            <span style={{ color: C.dim }}>nonce {t.nonce?.toLocaleString()}</span>
            <span style={{ color: C.yes }}>{t.status}</span>
          </div>
        )
      })}
    </div>
  )
}

/** The walkthrough: shield, price, send, and what lands on chain. */
export const S5Bet: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    {/* ── 1. shield ─────────────────────────────────────────────── */}
    <Sequence durationInFrames={sec(9)}>
      <Bg intensity={0.7} />
      <Vignette />
      <StepBadge n={1} label="Shield" delay={2} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Title delay={8} size={58} align="center">
          A bet spends shielded balance, not your wallet.
        </Title>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 62 }}>
          <FlowNode n={{ label: 'Your wallet', sub: 'public STRK' }} delay={sec(1.4)} />
          <FlowArrow delay={sec(2.1)} label="shield" />
          <FlowNode
            n={{ label: 'STRK20 pool', sub: 'shielded note', tone: C.accent }}
            delay={sec(2.6)}
          />
        </div>
        <div
          style={{
            marginTop: 52,
            fontFamily: body,
            fontSize: 30,
            color: C.muted,
            maxWidth: 1180,
            textAlign: 'center',
          }}
        >
          STRK20 is Starknet’s privacy pool. Once deposited, your balance is a note —
          and the anonymity set is every other depositor’s.
        </div>
      </AbsoluteFill>
    </Sequence>

    {/* ── 2. pick a market ──────────────────────────────────────── */}
    <Sequence from={sec(9)} durationInFrames={sec(7)}>
      <Shot
        src="04b-panel"
        from={{ s: 1.22, fx: 0.44, fy: 0.6 }}
        to={{ s: 1.38, fx: 0.42, fy: 0.62 }}
        durationInFrames={sec(7)}
      />
      <StepBadge n={2} label="Pick a market" delay={2} />
      <Caption delay={sec(1.2)} note="55¢ YES · 45¢ NO · open, live on mainnet">
        Will BTC close above $150,000 on 2026-12-31? The market says 55%.
      </Caption>
    </Sequence>

    {/* ── 3. the contract quotes the fill ───────────────────────── */}
    <Sequence from={sec(16)} durationInFrames={sec(6)}>
      <Shot
        src="05-quote-yes"
        from={{ s: 1.3, fx: 0.83, fy: 0.6 }}
        to={{ s: 1.45, fx: 0.85, fy: 0.62 }}
        durationInFrames={sec(6)}
      >
        <Ring {...RECTS['05-quote-yes'].sides} delay={sec(1)} color={C.yes} />
      </Shot>
      <StepBadge n={3} label="Size it" delay={2} />
      <Caption delay={sec(1.6)}>
        Pick a side and a stake. Five STRK on YES.
      </Caption>
    </Sequence>

    <Sequence from={sec(22)} durationInFrames={sec(7)}>
      <Shot
        src="05-quote-yes"
        from={{ s: 1.45, fx: 0.85, fy: 0.7 }}
        to={{ s: 1.75, fx: 0.86, fy: 0.79 }}
        durationInFrames={sec(7)}
      >
        <Ring {...RECTS['05-quote-yes'].quote} delay={sec(0.8)} />
      </Shot>
      <Caption delay={sec(1.4)} note="shares_out = (r + a) − k / (r_other + a)">
        The panel calls the contract’s own <code style={{ color: C.accent }}>quote()</code>, so
        the number on screen is the number the buy delivers: 7.84 shares, +56.8% if YES wins.
      </Caption>
    </Sequence>

    {/* ── 4. how the bet reaches the contract ───────────────────── */}
    <Sequence from={sec(29)} durationInFrames={sec(9)}>
      <Bg intensity={0.8} />
      <Vignette />
      <StepBadge n={4} label="Bet privately" delay={2} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Kicker delay={6}>What actually gets called</Kicker>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 22 }}>
          <FlowNode n={{ label: 'STRK20 pool', sub: 'holds your note', tone: C.accent }} delay={sec(0.8)} />
          <FlowArrow delay={sec(1.5)} label="privacy_invoke" />
          <FlowNode n={{ label: 'Doom market', sub: 'CPMM', tone: C.yes }} delay={sec(2.1)} wide />
        </div>
        <div
          style={{
            marginTop: 58,
            fontFamily: body,
            fontSize: 32,
            color: C.text,
            maxWidth: 1340,
            textAlign: 'center',
            lineHeight: 1.45,
          }}
        >
          The pool is always the caller. The market contract never sees an address —
          it cannot, because there is no address in the call.
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: mono,
            fontSize: 23,
            color: C.muted,
          }}
        >
          the position is keyed by poseidon(&apos;DOOM_POSITION_TAG:V1&apos;, secret)
        </div>
      </AbsoluteFill>
    </Sequence>

    {/* ── 5. the proof on chain ─────────────────────────────────── */}
    <Sequence from={sec(38)} durationInFrames={sec(9)}>
      <Bg intensity={0.6} />
      <Vignette />
      <StepBadge n={5} label="On chain" delay={2} />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 120px' }}>
        <Title delay={6} size={56}>
          Four Doom transactions. Four different senders.
        </Title>
        <SenderTable />
        <div
          style={{
            ...useTail(),
            marginTop: 34,
            fontFamily: body,
            fontSize: 29,
            color: C.muted,
            maxWidth: 1560,
          }}
        >
          None of them is the bettor’s wallet. These are relayer accounts — note the
          nonces near 295,000. Read straight from the RPC, and checkable against the
          hashes in our submission.
        </div>
      </AbsoluteFill>
    </Sequence>

    {/* ── 6. the market moved ───────────────────────────────────── */}
    <Sequence from={sec(47)} durationInFrames={sec(6)}>
      <Shot
        src="08-chart"
        from={{ s: 1.2, fx: 0.42, fy: 0.58 }}
        to={{ s: 1.4, fx: 0.42, fy: 0.6 }}
        durationInFrames={sec(6)}
      >
        <Ring {...RECTS['08-chart'].chart} delay={sec(0.8)} color={C.yes} />
      </Shot>
      <StepBadge n={6} label="The price moves" delay={2} />
      <Caption delay={sec(1.4)} note="probability history, rebuilt from Bought events">
        The bet lands and the odds change: 50¢ to 55¢. The market learned something.
        It never learned who.
      </Caption>
    </Sequence>
    <Grain />
  </AbsoluteFill>
)
