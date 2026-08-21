import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { Bg, Grain, Vignette } from '../components/Bg'
import { Kicker, Title } from '../components/Type'
import { C } from '../theme'
import { body, mono } from '../fonts'

const STEPS = [
  { h: 'Propose', p: 'Anyone posts the outcome with a bond.', tone: C.text },
  { h: 'Challenge window', p: 'Anyone can dispute by matching the bond.', tone: C.accent },
  { h: 'Finalize', p: 'Unchallenged, it settles. No administrator involved.', tone: C.yes },
  { h: 'Arbiter', p: 'Only ever touches a contested market.', tone: C.no },
]

/** Settlement, because "a designated resolver" would undo the point. */
export const S7Settle: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <AbsoluteFill>
      <Bg intensity={0.7} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 120px' }}>
        <Kicker delay={0}>Settlement</Kicker>
        <Title delay={6} size={62}>
          No single trusted resolver.
        </Title>
        <div style={{ display: 'flex', gap: 22, marginTop: 54 }}>
          {STEPS.map((s, i) => {
            const a = spring({ frame: frame - 26 - i * 13, fps, config: { damping: 200, mass: 0.6 } })
            return (
              <div
                key={s.h}
                style={{
                  flex: 1,
                  opacity: a,
                  transform: `translateY(${interpolate(a, [0, 1], [30, 0])}px)`,
                  background: 'linear-gradient(180deg, #1c1c20 0%, #131316 100%)',
                  border: `1px solid ${s.tone === C.text ? C.line : s.tone + '55'}`,
                  borderRadius: 18,
                  padding: '32px 26px',
                }}
              >
                <div style={{ fontFamily: mono, fontSize: 18, color: s.tone, letterSpacing: '0.16em' }}>
                  0{i + 1}
                </div>
                <div
                  style={{
                    fontFamily: body,
                    fontWeight: 700,
                    fontSize: 33,
                    color: C.text,
                    margin: '16px 0 12px',
                  }}
                >
                  {s.h}
                </div>
                <div style={{ fontFamily: body, fontSize: 25, lineHeight: 1.45, color: C.muted }}>
                  {s.p}
                </div>
              </div>
            )
          })}
        </div>
        <div
          style={{
            marginTop: 46,
            fontFamily: body,
            fontSize: 31,
            color: C.muted,
            maxWidth: 1500,
          }}
        >
          A market whose settlement is one trusted address invites exactly the
          manipulation the privacy is meant to remove. So we bonded it instead.
        </div>
      </AbsoluteFill>
      <Grain />
    </AbsoluteFill>
  )
}
