import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { C, sec } from './theme'
import { S1Title } from './scenes/S1Title'
import { S2Problem } from './scenes/S2Problem'
import { S3Tradeoff } from './scenes/S3Tradeoff'
import { S4Product } from './scenes/S4Product'
import { S5Bet } from './scenes/S5Bet'
import { S6How } from './scenes/S6How'
import { S7Settle } from './scenes/S7Settle'
import { S8Proof } from './scenes/S8Proof'
import { S9Close } from './scenes/S9Close'

/**
 * The cut. Durations are in seconds and sum to exactly three minutes; changing
 * one means changing another, which is the point of keeping them in one table.
 */
export const SCENES = [
  { id: 'title', secs: 8, C: S1Title },
  { id: 'problem', secs: 24, C: S2Problem },
  { id: 'tradeoff', secs: 16, C: S3Tradeoff },
  { id: 'product', secs: 24, C: S4Product },
  { id: 'bet', secs: 53, C: S5Bet },
  { id: 'how', secs: 22, C: S6How },
  { id: 'settle', secs: 14, C: S7Settle },
  { id: 'proof', secs: 13, C: S8Proof },
  { id: 'close', secs: 6, C: S9Close },
] as const

export const TOTAL_SECONDS = SCENES.reduce((a, s) => a + s.secs, 0)

export const Doom: React.FC = () => {
  let at = 0
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {SCENES.map((s) => {
        const from = at
        at += s.secs
        return (
          <Sequence key={s.id} from={sec(from)} durationInFrames={sec(s.secs)} name={s.id}>
            <s.C />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
