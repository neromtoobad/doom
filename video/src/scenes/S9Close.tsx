import React from 'react'
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { Bg, Vignette } from '../components/Bg'
import { C } from '../theme'
import { display, mono } from '../fonts'

export const S9Close: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const s = spring({ frame: frame - 4, fps, config: { damping: 200, mass: 0.8 } })
  const url = spring({ frame: frame - 26, fps, config: { damping: 200 } })
  const fade = interpolate(frame, [durationInFrames - 20, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
  })

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Bg intensity={1.15} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 26,
            opacity: s,
            transform: `scale(${interpolate(s, [0, 1], [0.92, 1])})`,
          }}
        >
          <Img src={staticFile('brand/mark-96.png')} style={{ width: 96, height: 96, borderRadius: 22 }} />
          <div
            style={{
              fontFamily: display,
              fontWeight: 900,
              fontSize: 96,
              letterSpacing: '-0.02em',
              color: C.text,
            }}
          >
            DOOM
          </div>
        </div>
        <div
          style={{
            marginTop: 34,
            fontFamily: display,
            fontWeight: 700,
            fontSize: 40,
            color: C.accent,
            opacity: s,
          }}
        >
          Visible odds. Invisible bettors.
        </div>
        <div
          style={{
            marginTop: 54,
            opacity: url,
            transform: `translateY(${interpolate(url, [0, 1], [16, 0])}px)`,
            fontFamily: mono,
            fontSize: 30,
            color: C.text,
            border: `1px solid ${C.line}`,
            borderRadius: 14,
            padding: '18px 34px',
            background: 'rgba(14,14,17,0.7)',
          }}
        >
          neromtoobad.github.io/doom
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
