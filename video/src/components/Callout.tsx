import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C } from '../theme'
import { body, mono } from '../fonts'
import { CamContext } from './Shot'

/**
 * A ring over a captured frame. Coordinates are normalised against the *source*
 * image (0–1), not the composition, so the ring follows the shot as it zooms.
 * Read them once off the capture and they stay correct through any camera move.
 */
export const Ring: React.FC<{
  nx: number
  ny: number
  nw: number
  nh: number
  delay?: number
  color?: string
}> = ({ nx, ny, nw, nh, delay = 0, color = C.accent }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const cam = React.useContext(CamContext)
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.5 } })
  const grow = interpolate(s, [0, 1], [1.09, 1])

  return (
    <div
      style={{
        position: 'absolute',
        left: cam.x + nx * cam.w,
        top: cam.y + ny * cam.h,
        width: nw * cam.w,
        height: nh * cam.h,
        borderRadius: 14,
        border: `3px solid ${color}`,
        boxShadow: `0 0 0 9999px rgba(0,0,0,${interpolate(s, [0, 1], [0, 0.55])}), 0 0 40px ${color}66`,
        opacity: s,
        transform: `scale(${grow})`,
      }}
    />
  )
}

/** Caption bar across the lower third — the line the shot is making. */
export const Caption: React.FC<{
  children: React.ReactNode
  delay?: number
  note?: React.ReactNode
}> = ({ children, delay = 0, note }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } })

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 76 }}>
      <div
        style={{
          opacity: s,
          transform: `translateY(${interpolate(s, [0, 1], [22, 0])}px)`,
          background: 'rgba(10,10,12,0.86)',
          backdropFilter: 'blur(22px)',
          border: `1px solid ${C.line}`,
          borderRadius: 18,
          padding: '24px 40px',
          maxWidth: 1400,
          textAlign: 'center',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontFamily: body, fontSize: 38, color: C.text, lineHeight: 1.32 }}>
          {children}
        </div>
        {note ? (
          <div style={{ fontFamily: mono, fontSize: 21, color: C.muted, marginTop: 12 }}>{note}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  )
}

/** Numbered step badge for the walkthrough. */
export const StepBadge: React.FC<{ n: number; label: string; delay?: number }> = ({
  n,
  label,
  delay = 0,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.5 } })
  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: 54,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        opacity: s,
        transform: `translateX(${interpolate(s, [0, 1], [-18, 0])}px)`,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 99,
          background: C.accent,
          color: C.ink,
          fontFamily: mono,
          fontWeight: 700,
          fontSize: 25,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {n}
      </div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 22,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: C.text,
          background: 'rgba(10,10,12,0.8)',
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          padding: '13px 22px',
        }}
      >
        {label}
      </div>
    </div>
  )
}
