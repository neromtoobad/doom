import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { Shot } from '../components/Shot'
import { Caption } from '../components/Callout'
import { Grain, Vignette } from '../components/Bg'
import { C, sec } from '../theme'

/** The mechanism: a fixed-product market maker, and what that buys you. */
export const S4Maker: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Sequence durationInFrames={sec(9)}>
      <Shot
        src="03-market"
        from={{ s: 1.16, fx: 0.42, fy: 0.5 }}
        to={{ s: 1.34, fx: 0.4, fy: 0.55 }}
        durationInFrames={sec(9)}
      />
      <Vignette />
      <Caption delay={sec(1)} note="price(YES) = r_no / (r_yes + r_no)">
        Underneath is a fixed-product market maker. The price is a probability you can
        read off the chain, and every buy moves it.
      </Caption>
    </Sequence>

    <Sequence from={sec(9)} durationInFrames={sec(9)}>
      <Shot
        src="06-depth"
        from={{ s: 1.4, fx: 0.85, fy: 0.5 }}
        to={{ s: 1.58, fx: 0.86, fy: 0.55 }}
        durationInFrames={sec(9)}
      />
      <Caption delay={sec(1)} note="computed from the reserves, exact to the wei against quote()">
        Bigger orders pay worse prices, and the panel shows you that before you commit.
      </Caption>
    </Sequence>
    <Grain />
  </AbsoluteFill>
)
