import React from 'react'
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { C } from '../theme'
import { mono } from '../fonts'

/**
 * Where the camera ended up this frame. Callouts anchor to the source image in
 * normalised coordinates and read this to follow a zoom, so a ring stays on the
 * element it is pointing at instead of sliding off it.
 */
export type Cam = { w: number; h: number; x: number; y: number }
export const CamContext = React.createContext<Cam>({ w: 1920, h: 1080, x: 0, y: 0 })

export type Frame = {
  /** Zoom. 1 fits the shot to the full 1920 width. */
  s: number
  /** Focal point in normalised source coordinates; it lands centre-screen. */
  fx: number
  fy: number
}

/** Natural size of every capture, so a focal point can be resolved to pixels. */
const SRC: Record<string, [number, number]> = {
  '00-fullpage': [3200, 5380],
}
const DEFAULT_SRC: [number, number] = [3200, 1800]

/**
 * A captured frame of the live site, moving. `from`/`to` are camera positions
 * rather than CSS, so a scene reads as "start wide on the board, push into the
 * quote" instead of a pile of transforms.
 */
export const Shot: React.FC<{
  src: string
  from: Frame
  to?: Frame
  durationInFrames: number
  /** Hold at `from` before the move starts. */
  hold?: number
  /** Viewport the camera solves against. Defaults to full frame; Chrome passes its inner box. */
  vw?: number
  vh?: number
  children?: React.ReactNode
}> = ({ src, from, to, durationInFrames, hold = 0, vw = 1920, vh = 1080, children }) => {
  const f = useCurrentFrame()
  const [sw, sh] = SRC[src] ?? DEFAULT_SRC
  const end = to ?? from

  const t = interpolate(f, [hold, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 0, 0.15, 1),
  })

  const s = interpolate(t, [0, 1], [from.s, end.s])
  const fx = interpolate(t, [0, 1], [from.fx, end.fx])
  const fy = interpolate(t, [0, 1], [from.fy, end.fy])

  // Fit to width, then offset so the focal point sits dead centre.
  const w = vw * s
  const h = w * (sh / sw)
  const x = vw / 2 - fx * w
  const y = vh / 2 - fy * h

  return (
    <CamContext.Provider value={{ w, h, x, y }}>
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <Img
          src={staticFile(`shots/${src}.png`)}
          style={{
            position: 'absolute',
            width: w,
            height: h,
            left: x,
            top: y,
            // The captures already carry the site's own grain; keep them crisp.
            imageRendering: 'auto',
          }}
        />
        {children}
      </AbsoluteFill>
    </CamContext.Provider>
  )
}

/** Rounded browser chrome, so a capture reads as product rather than slide. */
export const Chrome: React.FC<{ children: React.ReactNode; url?: string }> = ({
  children,
  url = 'neromtoobad.github.io/doom',
}) => (
  <AbsoluteFill style={{ padding: 54, alignItems: 'center', justifyContent: 'center' }}>
    <div
      style={{
        width: 1812,
        height: 972,
        borderRadius: 20,
        overflow: 'hidden',
        border: `1px solid ${C.line}`,
        boxShadow: '0 60px 140px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.03)',
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
      }}
    >
      <div
        style={{
          height: 46,
          flexShrink: 0,
          background: '#131316',
          borderBottom: `1px solid ${C.line}`,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          paddingLeft: 20,
        }}
      >
        {['#3a3a42', '#3a3a42', '#3a3a42'].map((c, i) => (
          <div key={i} style={{ width: 11, height: 11, borderRadius: 99, background: c }} />
        ))}
        <div
          style={{
            marginLeft: 18,
            fontFamily: mono,
            fontSize: 15,
            color: C.dim,
            background: '#0e0e11',
            borderRadius: 7,
            padding: '5px 16px',
          }}
        >
          {url}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  </AbsoluteFill>
)
