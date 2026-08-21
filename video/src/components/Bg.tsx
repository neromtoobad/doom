import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { C } from '../theme'

/**
 * The site's aurora + film grain, rebuilt as motion. Grain is a static SVG
 * turbulence tile nudged each frame — cheap, and it keeps the flat black from
 * banding once the video is compressed.
 */
export const Bg: React.FC<{ tint?: string; intensity?: number }> = ({
  tint = C.accent,
  intensity = 1,
}) => {
  const f = useCurrentFrame()
  const drift = Math.sin(f / 90) * 60
  const drift2 = Math.cos(f / 120) * 80

  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(70% 55% at ${18 + drift / 12}% ${
            12 + drift2 / 30
          }%, ${tint}${Math.round(38 * intensity).toString(16).padStart(2, '0')} 0%, transparent 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 50% at ${86 - drift / 16}% ${
            88 + drift / 40
          }%, ${C.yes}22 0%, transparent 62%)`,
          opacity: intensity,
        }}
      />
      <Grain />
    </AbsoluteFill>
  )
}

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.055 }) => {
  const f = useCurrentFrame()
  // Re-seeding every frame would shimmer too hard; every third is enough.
  const seed = Math.floor(f / 3) % 8
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <svg width="100%" height="100%">
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed={seed} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  )
}

/** A vignette, so the eye lands centre-frame on the wide shots. */
export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      background: 'radial-gradient(75% 65% at 50% 50%, transparent 40%, rgba(0,0,0,0.62) 100%)',
      pointerEvents: 'none',
    }}
  />
)
