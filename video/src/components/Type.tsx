import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C } from '../theme'
import { body, display, mono } from '../fonts'

/** Rise-and-fade entrance. `delay` is in frames and every caller staggers on it. */
export const useReveal = (delay = 0, damping = 200) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping, mass: 0.6 } })
  return { opacity: s, transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px)` }
}

export const Kicker: React.FC<{ children: React.ReactNode; delay?: number; color?: string }> = ({
  children,
  delay = 0,
  color = C.accent,
}) => (
  <div
    style={{
      ...useReveal(delay),
      fontFamily: mono,
      fontSize: 22,
      letterSpacing: '0.22em',
      textTransform: 'uppercase',
      color,
      marginBottom: 26,
    }}
  >
    {children}
  </div>
)

export const Title: React.FC<{
  children: React.ReactNode
  delay?: number
  size?: number
  color?: string
  align?: 'left' | 'center'
}> = ({ children, delay = 0, size = 88, color = C.text, align = 'left' }) => (
  <div
    style={{
      ...useReveal(delay),
      fontFamily: display,
      fontWeight: 900,
      fontSize: size,
      lineHeight: 1.02,
      letterSpacing: '-0.035em',
      color,
      textAlign: align,
      textWrap: 'balance',
    }}
  >
    {children}
  </div>
)

export const Body: React.FC<{
  children: React.ReactNode
  delay?: number
  size?: number
  color?: string
  width?: number
}> = ({ children, delay = 0, size = 34, color = C.muted, width = 1180 }) => (
  <div
    style={{
      ...useReveal(delay),
      fontFamily: body,
      fontSize: size,
      lineHeight: 1.5,
      color,
      maxWidth: width,
      textWrap: 'pretty',
    }}
  >
    {children}
  </div>
)

export const Mono: React.FC<{
  children: React.ReactNode
  delay?: number
  size?: number
  color?: string
}> = ({ children, delay = 0, size = 26, color = C.muted }) => (
  <div style={{ ...useReveal(delay), fontFamily: mono, fontSize: size, color, letterSpacing: '0.02em' }}>
    {children}
  </div>
)

/** Orange on the emphatic half of a line, matching the site's hero. */
export const Hot: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ color: C.accent }}>{children}</span>
)
