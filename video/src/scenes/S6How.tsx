import React from 'react'
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Bg, Grain, Vignette } from '../components/Bg'
import { Body, Kicker, Title } from '../components/Type'
import { C, sec } from '../theme'
import { body, mono } from '../fonts'

const GUARDS = [
  {
    h: 'Balance-delta accounting',
    p: 'Collateral is measured as the contract’s own balance change, never taken from calldata. A caller cannot claim to have sent more than it did.',
  },
  {
    h: 'Commitment-keyed positions',
    p: 'A position belongs to poseidon(tag, secret), not to an address, so no wallet-level betting history can accumulate across markets.',
  },
  {
    h: 'Solvency by construction',
    p: 'Each deposit mints one share of each side, so outstanding winning shares can never exceed collateral held. Winners are always payable.',
  },
]

const Guard: React.FC<{ i: number; h: string; p: string }> = ({ i, h, p }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - 18 - i * 16, fps, config: { damping: 200, mass: 0.7 } })
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px)`,
        display: 'grid',
        gridTemplateColumns: '480px 1fr',
        gap: 40,
        alignItems: 'start',
        padding: '30px 0',
        borderTop: `1px solid ${C.line}`,
      }}
    >
      <div style={{ fontFamily: body, fontWeight: 700, fontSize: 34, color: C.accent }}>{h}</div>
      <div style={{ fontFamily: body, fontSize: 27, lineHeight: 1.5, color: C.muted }}>{p}</div>
    </div>
  )
}

/** The parts a judge will want to poke at. */
export const S6How: React.FC = () => (
  <AbsoluteFill>
    <Bg intensity={0.75} />
    <Vignette />

    <Sequence durationInFrames={sec(8)}>
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 130px' }}>
        <Kicker delay={0}>The honest limitation</Kicker>
        <Title delay={6} size={60}>
          Claiming reveals the secret in public calldata.
        </Title>
        <div style={{ height: 30 }} />
        <Body delay={40} size={32} color={C.text} width={1500}>
          A payout can be linked back to the bet that earned it. It still links to no
          person. Timing correlation between shielding and betting is a real side
          channel this does not solve, and the anonymity set is the pool’s, not Doom’s
          alone. We would rather say so than claim otherwise.
        </Body>
      </AbsoluteFill>
    </Sequence>

    <Sequence from={sec(8)}>
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 130px' }}>
        <Kicker delay={0}>What keeps it standing up</Kicker>
        <div style={{ marginTop: 10 }}>
          {GUARDS.map((g, i) => (
            <Guard key={g.h} i={i} {...g} />
          ))}
        </div>
        <div
          style={{
            marginTop: 40,
            fontFamily: mono,
            fontSize: 25,
            color: C.muted,
          }}
        >
          55 tests · Cairo 2.18 · snforge
        </div>
      </AbsoluteFill>
    </Sequence>
    <Grain />
  </AbsoluteFill>
)
