import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence } from 'remotion'
import { Bg, Vignette } from '../components/Bg'
import { Body, Hot, Kicker, Title } from '../components/Type'
import { C, sec } from '../theme'
import { body, mono } from '../fonts'

const COSTS = [
  {
    h: 'Whale tracking',
    p: 'Wallets are public, so anyone can follow the largest positions and copy or fade them.',
  },
  {
    h: 'Herding',
    p: 'Once a big bet is visible the crowd follows the bettor, not the evidence. The signal degrades.',
  },
  {
    h: 'Career risk',
    p: 'An executive betting against their own division’s timeline is making a public statement.',
  },
]

const Card: React.FC<{ i: number; h: string; p: string }> = ({ i, h, p }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - i * 14, fps, config: { damping: 200, mass: 0.7 } })
  return (
    <div
      style={{
        flex: 1,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [34, 0])}px)`,
        background: 'linear-gradient(180deg, #1c1c20 0%, #141417 100%)',
        border: `1px solid ${C.line}`,
        borderRadius: 20,
        padding: '38px 34px',
      }}
    >
      <div
        style={{
          fontFamily: mono,
          fontSize: 19,
          color: C.no,
          letterSpacing: '0.16em',
          marginBottom: 18,
        }}
      >
        0{i + 1}
      </div>
      <div style={{ fontFamily: body, fontWeight: 700, fontSize: 38, color: C.text, marginBottom: 16 }}>
        {h}
      </div>
      <div style={{ fontFamily: body, fontSize: 26, lineHeight: 1.5, color: C.muted }}>{p}</div>
    </div>
  )
}

/** Why a public order book is not a free lunch. */
export const S2Problem: React.FC = () => (
  <AbsoluteFill>
    <Bg tint={C.no} intensity={0.7} />
    <Vignette />

    <Sequence durationInFrames={sec(9)}>
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 132px' }}>
        <Kicker delay={2} color={C.no}>The trade-off nobody fixed</Kicker>
        <Title delay={8} size={82}>
          Prediction markets work because
          <br />
          you can <Hot>see the money.</Hot>
        </Title>
        <div style={{ height: 34 }} />
        <Body delay={46} size={38} color={C.text}>
          That is also the problem. The same ledger that makes the odds trustworthy
          makes every bettor permanently identifiable.
        </Body>
      </AbsoluteFill>
    </Sequence>

    <Sequence from={sec(9)}>
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 110px' }}>
        <Kicker delay={0} color={C.no}>What that costs</Kicker>
        <div style={{ display: 'flex', gap: 26, marginTop: 14 }}>
          {COSTS.map((c, i) => (
            <Card key={c.h} i={i} {...c} />
          ))}
        </div>
        <div style={{ height: 46 }} />
        <Body delay={62} size={34} color={C.text} width={1500}>
          Three markets that cannot exist today: internal corporate forecasting,
          politically sensitive questions, and any professional edge worth keeping.
        </Body>
      </AbsoluteFill>
    </Sequence>
  </AbsoluteFill>
)
