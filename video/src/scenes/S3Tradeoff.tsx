import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Bg, Vignette } from '../components/Bg'
import { Kicker, Title } from '../components/Type'
import { C } from '../theme'
import { body, mono } from '../fonts'

type Row = { label: string; hidden: boolean; why: string }

const ROWS: Row[] = [
  { label: 'Who is betting', hidden: true, why: 'every pool transaction is relayed' },
  { label: 'Bet size', hidden: false, why: 'this is what drives accurate odds' },
  { label: 'Current odds', hidden: false, why: 'read straight off the contract' },
  { label: 'Per-outcome volume', hidden: false, why: 'public, so the market can be checked' },
  { label: 'Cross-market profile', hidden: true, why: 'positions key off a Poseidon commitment' },
  { label: 'Resolution', hidden: false, why: 'bond, dispute and outcome are all public' },
]

const RowView: React.FC<{ r: Row; i: number }> = ({ r, i }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - 20 - i * 9, fps, config: { damping: 200, mass: 0.6 } })
  const tone = r.hidden ? C.accent : C.yes

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '470px 210px 1fr',
        alignItems: 'center',
        gap: 30,
        padding: '20px 30px',
        borderBottom: `1px solid ${C.line}`,
        opacity: s,
        transform: `translateX(${interpolate(s, [0, 1], [-26, 0])}px)`,
      }}
    >
      <div style={{ fontFamily: body, fontWeight: 600, fontSize: 33, color: C.text }}>{r.label}</div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 20,
          letterSpacing: '0.14em',
          color: tone,
          border: `1px solid ${tone}55`,
          background: `${tone}14`,
          borderRadius: 99,
          padding: '9px 0',
          textAlign: 'center',
        }}
      >
        {r.hidden ? 'HIDDEN' : 'VISIBLE'}
      </div>
      <div style={{ fontFamily: body, fontSize: 25, color: C.muted }}>{r.why}</div>
    </div>
  )
}

/** The whole design in one table: keep every number, remove the name. */
export const S3Tradeoff: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const close = spring({ frame: frame - 20 - ROWS.length * 9 - 16, fps, config: { damping: 200 } })

  return (
    <AbsoluteFill>
      <Bg intensity={0.85} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 120px' }}>
        <Kicker delay={0}>Doom’s answer</Kicker>
        <Title delay={6} size={72}>
          Keep every number. Remove the name.
        </Title>
        <div
          style={{
            marginTop: 44,
            background: 'rgba(18,18,21,0.72)',
            border: `1px solid ${C.line}`,
            borderRadius: 22,
            overflow: 'hidden',
          }}
        >
          {ROWS.map((r, i) => (
            <RowView key={r.label} r={r} i={i} />
          ))}
        </div>
        <div
          style={{
            marginTop: 34,
            opacity: close,
            fontFamily: body,
            fontSize: 30,
            color: C.muted,
          }}
        >
          The information that makes a market accurate stays public. The identity
          that makes it manipulable never touches the chain.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
