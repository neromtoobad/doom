import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { C, sec } from './theme'
import { S1Title } from './scenes/S1Title'
import { S2Problem } from './scenes/S2Problem'
import { S3Book } from './scenes/S3Book'
import { S4Maker } from './scenes/S4Maker'
import { S5Fee } from './scenes/S5Fee'
import { S6Create } from './scenes/S6Create'
import { S7Oracle } from './scenes/S7Oracle'
import { S8Keys } from './scenes/S8Keys'
import { S8Proof } from './scenes/S8Proof'
import { S9Close } from './scenes/S9Close'

/**
 * The cut. Durations are seconds and sum to exactly three minutes, and the same
 * table drives the narration cues in capture/plan.mjs — change one and change both,
 * or a line ends up talking over the wrong picture.
 */
export const SCENES = [
  { id: 'title', secs: 8, C: S1Title },
  { id: 'problem', secs: 20, C: S2Problem },
  { id: 'book', secs: 22, C: S3Book },
  { id: 'maker', secs: 18, C: S4Maker },
  { id: 'fee', secs: 29, C: S5Fee },
  { id: 'create', secs: 21, C: S6Create },
  { id: 'oracle', secs: 20, C: S7Oracle },
  { id: 'keys', secs: 13, C: S8Keys },
  { id: 'proof', secs: 20, C: S8Proof },
  { id: 'close', secs: 9, C: S9Close },
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
