import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { Bg, Vignette } from '../components/Bg'
import { C } from '../theme'
import { display, mono } from '../fonts'

/** Cold open. The wordmark, the promise, and where it runs. */
export const S1Title: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const mark = spring({ frame: frame - 6, fps, config: { damping: 200, mass: 0.8 } })
  const l1 = spring({ frame: frame - 22, fps, config: { damping: 200, mass: 0.7 } })
  const l2 = spring({ frame: frame - 34, fps, config: { damping: 200, mass: 0.7 } })
  const sub = spring({ frame: frame - 62, fps, config: { damping: 200 } })
  const out = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  })

  const line = (s: number, color: string, text: string) => (
    <div
      style={{
        fontFamily: display,
        fontWeight: 900,
        fontSize: 132,
        lineHeight: 0.95,
        letterSpacing: '-0.05em',
        color,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [46, 0])}px)`,
      }}
    >
      {text}
    </div>
  )

  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg intensity={1.1} />
      <AbsoluteFill style={{ opacity: 0.34 }}>
        <Img
          src={staticFile('brand/hero.png')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${interpolate(frame, [0, durationInFrames], [1.08, 1.16])})`,
          }}
        />
      </AbsoluteFill>
      <Vignette />

      <AbsoluteFill style={{ justifyContent: 'center', paddingLeft: 132 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 44,
            opacity: mark,
            transform: `translateY(${interpolate(mark, [0, 1], [20, 0])}px)`,
          }}
        >
          <Img src={staticFile('brand/mark-96.png')} style={{ width: 74, height: 74, borderRadius: 18 }} />
          <div
            style={{
              fontFamily: display,
              fontWeight: 900,
              fontSize: 46,
              letterSpacing: '0.02em',
              color: C.text,
            }}
          >
            DOOM
          </div>
        </div>

        {line(l1, C.text, 'VISIBLE ODDS.')}
        {line(l2, C.accent, 'INVISIBLE BETTORS.')}

        <div
          style={{
            marginTop: 52,
            opacity: sub,
            transform: `translateY(${interpolate(sub, [0, 1], [18, 0])}px)`,
            fontFamily: mono,
            fontSize: 27,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            color: C.muted,
          }}
        >
          A private prediction market · live on Starknet mainnet
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
