import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { Shot } from '../components/Shot'
import { Caption, Ring } from '../components/Callout'
import { Bg, Grain, Vignette } from '../components/Bg'
import { Kicker, Title } from '../components/Type'
import { C, sec } from '../theme'
import RECTS from '../data/rects.json'

/**
 * The fee, which is the part a demo is tempted to leave out.
 *
 * The pool charges a flat six per private operation, and at small sizes that decides
 * the trade. An earlier build of this panel printed +75.8% on a position that
 * actually returns -74.9%. Showing the product argue against its own trade is worth
 * more than any feature in the film.
 */
export const S5Fee: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Sequence durationInFrames={sec(6)}>
      <Bg tint={C.accent} intensity={0.9} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 130px' }}>
        <Kicker delay={2}>The part most demos leave out</Kicker>
        <Title delay={10} size={66}>
          Six STRK, every private operation.
        </Title>
      </AbsoluteFill>
    </Sequence>

    {/* The small stake, where the fee eats the trade whole. */}
    <Sequence from={sec(6)} durationInFrames={sec(12)}>
      <Shot
        src="04-fee"
        from={{ s: 1.35, fx: 0.84, fy: 0.52 }}
        to={{ s: 1.62, fx: 0.85, fy: 0.6 }}
        durationInFrames={sec(12)}
      >
        <Ring {...RECTS['04-fee'].fill} delay={sec(1.2)} />
      </Shot>
      <Caption delay={sec(2)} note="1 STRK staked · 7.00 STRK spent">
        One STRK buys 1.76 shares and costs seven. The panel says so, and tells you
        not to take the trade.
      </Caption>
    </Sequence>

    {/* The size at which it finally works. */}
    <Sequence from={sec(18)} durationInFrames={sec(11)}>
      <Shot
        src="05-fee-large"
        from={{ s: 1.45, fx: 0.85, fy: 0.55 }}
        to={{ s: 1.62, fx: 0.86, fy: 0.6 }}
        durationInFrames={sec(11)}
      />
      <Caption delay={sec(1.2)} note="40 STRK staked · +2.5% after fee">
        Stake forty and it finally clears. Most interfaces would have shown you
        plus seventy five percent and taken the order.
      </Caption>
    </Sequence>
    <Grain />
  </AbsoluteFill>
)
