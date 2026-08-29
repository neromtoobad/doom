import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { Shot } from '../components/Shot'
import { Caption } from '../components/Callout'
import { Bg, Grain, Vignette } from '../components/Bg'
import { Body, Kicker, Title } from '../components/Type'
import { C, sec } from '../theme'

/**
 * Settlement, and the line the film refuses to cross.
 *
 * The panel reads Pragma. The contract does not, and cannot — the binding would have
 * to live in the class, and these classes are deployed. Calling it oracle-settled
 * would be a claim a judge disproves in one call.
 */
export const S7Oracle: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Sequence durationInFrames={sec(11)}>
      <Shot
        src="08-pragma"
        from={{ s: 1.2, fx: 0.42, fy: 0.48 }}
        to={{ s: 1.4, fx: 0.4, fy: 0.52 }}
        durationInFrames={sec(11)}
      />
      <Vignette />
      <Caption delay={sec(1.2)} note="median of 10 sources, read live from Pragma">
        For price questions the panel reads the oracle, states which way its median
        resolves, and fills in the proposal.
      </Caption>
    </Sequence>

    <Sequence from={sec(11)} durationInFrames={sec(9)}>
      <Bg intensity={0.75} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 130px' }}>
        <Kicker delay={2}>And the line we will not cross</Kicker>
        <Title delay={8} size={58}>
          Oracle-informed, not oracle-enforced.
        </Title>
        <div style={{ height: 26 }} />
        <Body delay={34} size={31} color={C.text} width={1420}>
          The contract does not verify a feed and cannot — that binding would have to
          live in the class. Settlement stays a bonded human claim that anyone can
          make and anyone can dispute. Saying otherwise would be a claim you could
          disprove in one call.
        </Body>
      </AbsoluteFill>
    </Sequence>
    <Grain />
  </AbsoluteFill>
)
