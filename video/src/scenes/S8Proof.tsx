import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Bg, Grain, Vignette } from '../components/Bg'
import { Kicker, Title } from '../components/Type'
import { C } from '../theme'
import { body, display, mono } from '../fonts'

const STATS: [string, string][] = [
  ['14', 'contracts on mainnet'],
  ['13', 'markets deployed'],
  ['55', 'passing Cairo tests'],
  ['0', 'bettor identities on chain'],
]

const Stat: React.FC<{ v: string; l: string; i: number }> = ({ v, l, i }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - 24 - i * 10, fps, config: { damping: 200, mass: 0.7 } })
  const hot = v === '0'
  return (
    <div
      style={{
        flex: 1,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px)`,
      }}
    >
      <div
        style={{
          fontFamily: display,
          fontWeight: 900,
          fontSize: 104,
          letterSpacing: '-0.04em',
          color: hot ? C.accent : C.text,
        }}
      >
        {v}
      </div>
      <div style={{ fontFamily: body, fontSize: 26, color: C.muted, marginTop: 8 }}>{l}</div>
    </div>
  )
}

/** Numbers a judge can check, and where to check them. */
export const S8Proof: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const tail = spring({ frame: frame - 90, fps, config: { damping: 200 } })
  return (
    <AbsoluteFill>
      <Bg intensity={0.9} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 130px' }}>
        <Kicker delay={0}>Shipped</Kicker>
        <Title delay={6} size={62}>
          Everything above is on mainnet today.
        </Title>
        <div style={{ display: 'flex', gap: 30, marginTop: 62 }}>
          {STATS.map(([v, l], i) => (
            <Stat key={l} v={v} l={l} i={i} />
          ))}
        </div>
        <div
          style={{
            marginTop: 56,
            opacity: tail,
            fontFamily: mono,
            fontSize: 24,
            color: C.muted,
            lineHeight: 1.8,
          }}
        >
          RFP-07 · prediction markets with visible odds and invisible bettors
          <br />
          market · 0x0205a8ad…f432c4 &nbsp;·&nbsp; one market already settled on chain
        </div>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  )
}
