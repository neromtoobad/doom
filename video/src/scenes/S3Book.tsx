import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { Shot } from '../components/Shot'
import { Caption, Ring } from '../components/Callout'
import { Bg, Grain, Vignette } from '../components/Bg'
import { Kicker, Title } from '../components/Type'
import { C, sec } from '../theme'
import RECTS from '../data/rects.json'

/**
 * The claim, and then the thing itself.
 *
 * A panel explaining that a whale ranking is impossible asks to be believed. This
 * shows the ranking: real positions, real sizes, and a name column that is drawn and
 * empty. The counter at the end is the whole argument in two numbers.
 */
export const S3Book: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Sequence durationInFrames={sec(7)}>
        <Bg intensity={0.85} />
        <Vignette />
        <AbsoluteFill style={{ justifyContent: 'center', padding: '0 130px' }}>
          <Kicker delay={2}>Where every other market ranks its whales</Kicker>
          <Title delay={10} size={72}>
            So here is the leaderboard.
          </Title>
        </AbsoluteFill>
      </Sequence>

      <Sequence from={sec(7)} durationInFrames={sec(15)}>
        <Shot
          src="07-book"
          from={{ s: 1.3, fx: 0.34, fy: 0.62 }}
          to={{ s: 1.5, fx: 0.32, fy: 0.6 }}
          durationInFrames={sec(15)}
        >
          <Ring {...RECTS['07-book'].rows} delay={sec(1.4)} />
          {/* The footer states both halves of the argument in the product's own
              words — one position, one STRK, zero identities — so it is ringed
              rather than restated in an overlay that collided with the panel. */}
          <Ring
            nx={RECTS['07-book'].rows.nx}
            ny={RECTS['07-book'].rows.ny + RECTS['07-book'].rows.nh + 0.014}
            nw={RECTS['07-book'].rows.nw}
            nh={0.034}
            delay={sec(8)}
            color={C.accent}
          />
        </Shot>
        <Caption delay={sec(2.4)} note="poseidon(tag, secret) — and the pool was the caller">
          Every size is there. The name column is drawn, and empty.
        </Caption>

      </Sequence>
      <Grain />
    </AbsoluteFill>
  )
}
