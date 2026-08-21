import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { C } from '../theme'
import { body, mono } from '../fonts'

export type Node = { label: string; sub?: string; tone?: string }

/** A box in the privacy path diagram. */
export const FlowNode: React.FC<{ n: Node; delay: number; wide?: boolean }> = ({
  n,
  delay,
  wide,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } })
  const tone = n.tone ?? C.text
  return (
    <div
      style={{
        opacity: s,
        transform: `scale(${interpolate(s, [0, 1], [0.9, 1])})`,
        width: wide ? 430 : 330,
        padding: '30px 26px',
        borderRadius: 18,
        background: 'linear-gradient(180deg, #1c1c20 0%, #131316 100%)',
        border: `1px solid ${tone === C.text ? C.line : tone + '66'}`,
        boxShadow: tone === C.text ? 'none' : `0 0 40px ${tone}22`,
        textAlign: 'center',
      }}
    >
      <div style={{ fontFamily: body, fontWeight: 700, fontSize: 31, color: tone }}>{n.label}</div>
      {n.sub ? (
        <div style={{ fontFamily: mono, fontSize: 19, color: C.muted, marginTop: 10 }}>{n.sub}</div>
      ) : null}
    </div>
  )
}

/** Connector whose fill sweeps left-to-right as the step lands. */
export const FlowArrow: React.FC<{ delay: number; label?: string; tone?: string }> = ({
  delay,
  label,
  tone = C.accent,
}) => {
  const frame = useCurrentFrame()
  const grow = interpolate(frame - delay, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div style={{ width: 150, position: 'relative', flexShrink: 0 }}>
      <div style={{ height: 3, background: C.line, borderRadius: 9 }}>
        <div
          style={{
            height: 3,
            width: `${grow * 100}%`,
            background: tone,
            borderRadius: 9,
            boxShadow: `0 0 14px ${tone}`,
          }}
        />
      </div>
      {label ? (
        <div
          style={{
            position: 'absolute',
            top: -40,
            width: '100%',
            textAlign: 'center',
            fontFamily: mono,
            fontSize: 17,
            color: C.muted,
            opacity: grow,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  )
}
