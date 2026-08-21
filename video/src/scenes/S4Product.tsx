import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { Shot } from '../components/Shot'
import { Caption, Ring } from '../components/Callout'
import { Grain, Vignette } from '../components/Bg'
import { C, sec } from '../theme'
import RECTS from '../data/rects.json'

/** The product itself, in its own pixels. Nothing here is a mockup. */
export const S4Product: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Sequence durationInFrames={sec(6)}>
      <Shot
        src="01-hero"
        from={{ s: 1.0, fx: 0.5, fy: 0.5 }}
        to={{ s: 1.1, fx: 0.46, fy: 0.46 }}
        durationInFrames={sec(6)}
      />
      <Caption delay={10} note="neromtoobad.github.io/doom">
        Doom is a real prediction market — a fixed-product market maker over binary
        outcome shares, the Gnosis conditional-token construction.
      </Caption>
    </Sequence>

    <Sequence from={sec(6)} durationInFrames={sec(6)}>
      <Shot
        src="01-hero"
        from={{ s: 1.1, fx: 0.46, fy: 0.46 }}
        to={{ s: 1.55, fx: 0.58, fy: 0.62 }}
        durationInFrames={sec(6)}
      >
        <Ring {...RECTS['01-hero'].bettorsKnown} delay={sec(1.6)} />
      </Shot>
      <Caption delay={sec(2.2)} note="read from the contracts, not from a slide">
        Volume is public. The number of open markets is public. The number of
        bettor identities on chain is <b style={{ color: C.accent }}>zero</b>.
      </Caption>
    </Sequence>

    <Sequence from={sec(12)} durationInFrames={sec(7)}>
      <Shot
        src="00-fullpage"
        from={{ s: 1, fx: 0.5, fy: 0.17 }}
        to={{ s: 1, fx: 0.5, fy: 0.52 }}
        durationInFrames={sec(7)}
      />
      <Vignette />
      <Caption delay={sec(0.6)}>
        Thirteen markets, live on Starknet mainnet — crypto price questions,
        Starknet questions, and the hackathon’s own deadline.
      </Caption>
    </Sequence>

    <Sequence from={sec(19)} durationInFrames={sec(5)}>
      <Shot
        src="02-board"
        from={{ s: 1.05, fx: 0.5, fy: 0.5 }}
        to={{ s: 1.28, fx: 0.26, fy: 0.33 }}
        durationInFrames={sec(5)}
      >
        <Ring {...RECTS['02-board'].firstCard} delay={sec(1.2)} color={C.yes} />
      </Shot>
      <Caption delay={sec(1.6)} note="price(YES) = r_no / (r_yes + r_no)">
        Every card carries a live price in cents. That price is a probability,
        readable straight off chain.
      </Caption>
    </Sequence>
    <Grain />
  </AbsoluteFill>
)
