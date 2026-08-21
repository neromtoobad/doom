// Lifted straight from the product's market.module.css so the film and the app
// are the same object. If the site's palette moves, move these with it.
export const C = {
  bg: '#0c0c0e',
  surface: '#161619',
  surface2: '#1e1e22',
  line: '#26262c',
  text: '#f2f2f4',
  muted: '#8b8b93',
  dim: '#55555e',
  accent: '#ff6b35',
  accentDeep: '#c23c12',
  yes: '#22c55e',
  no: '#ef4444',
  ink: '#140b07',
} as const

export const FPS = 30

/** Seconds → frames. Every duration in this project is written in seconds. */
export const sec = (s: number) => Math.round(s * FPS)
