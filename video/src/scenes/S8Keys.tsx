import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { Shot } from '../components/Shot'
import { Caption } from '../components/Callout'
import { Bg, Grain, Vignette } from '../components/Bg'
import { FlowArrow, FlowNode } from '../components/Flow'
import { Kicker } from '../components/Type'
import { C, sec } from '../theme'
import { body } from '../fonts'

/** Positions that belong to a wallet rather than to a browser. */
export const S8Keys: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Sequence durationInFrames={sec(7)}>
      <Bg intensity={0.8} />
      <Vignette />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Kicker delay={2}>No account, no server, no storage</Kicker>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 26 }}>
          <FlowNode n={{ label: 'One signature', sub: 'from your wallet' }} delay={sec(0.8)} />
          <FlowArrow delay={sec(1.5)} label="poseidon" />
          <FlowNode
            n={{ label: 'Every position key', sub: 'on any device', tone: C.accent }}
            delay={sec(2.1)}
            wide
          />
        </div>
        <div
          style={{
            marginTop: 52,
            fontFamily: body,
            fontSize: 30,
            color: C.muted,
            maxWidth: 1180,
            textAlign: 'center',
            lineHeight: 1.45,
          }}
        >
          A position used to live in one browser&apos;s storage. Clear it and the money
          was gone.
        </div>
      </AbsoluteFill>
    </Sequence>

    <Sequence from={sec(7)} durationInFrames={sec(6)}>
      <Shot
        src="13-portfolio"
        from={{ s: 1.12, fx: 0.5, fy: 0.42 }}
        to={{ s: 1.28, fx: 0.48, fy: 0.48 }}
        durationInFrames={sec(6)}
      />
      <Caption delay={sec(1)} note="the chain still records no address">
        Sign once and the keys rebuild anywhere.
      </Caption>
    </Sequence>
    <Grain />
  </AbsoluteFill>
)
