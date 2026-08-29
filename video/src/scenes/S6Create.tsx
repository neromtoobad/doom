import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { Shot } from '../components/Shot'
import { Caption } from '../components/Callout'
import { Bg, Grain, Vignette } from '../components/Bg'
import { Kicker, Title } from '../components/Type'
import { C, sec } from '../theme'

/** Opening a market: a deploy, not a declare, which is why anyone can afford it. */
export const S6Create: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Sequence durationInFrames={sec(5)}>
      <Bg intensity={0.85} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 130px' }}>
        <Kicker delay={2}>Not a curated list</Kicker>
        <Title delay={10} size={70}>
          Anyone can open a market.
        </Title>
      </AbsoluteFill>
    </Sequence>

    <Sequence from={sec(5)} durationInFrames={sec(9)}>
      <Shot
        src="12-template"
        from={{ s: 1.2, fx: 0.5, fy: 0.52 }}
        to={{ s: 1.4, fx: 0.47, fy: 0.56 }}
        durationInFrames={sec(9)}
      />
      <Caption delay={sec(1.4)} note="live Pragma medians, so the strike is chosen against reality">
        Pick an asset, a direction and a strike. The question writes itself, in the
        shape the oracle can read back.
      </Caption>
    </Sequence>

    <Sequence from={sec(14)} durationInFrames={sec(7)}>
      <Shot
        src="11-create"
        from={{ s: 1.1, fx: 0.5, fy: 0.32 }}
        to={{ s: 1.24, fx: 0.5, fy: 0.4 }}
        durationInFrames={sec(7)}
      />
      <Caption delay={sec(0.8)} note="class 0x59dc95c7… already declared on mainnet">
        The contract class is already on chain, so opening a market is a deploy —
        two signatures, no terminal, no declare fee.
      </Caption>
    </Sequence>
    <Grain />
  </AbsoluteFill>
)
