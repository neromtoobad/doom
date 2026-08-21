import React from 'react'
import { Composition } from 'remotion'
import { Doom, SCENES, TOTAL_SECONDS } from './Doom'
import { FPS, sec } from './theme'

export const RemotionRoot: React.FC = () => {
  let at = 0
  const scenes = SCENES.map((s) => {
    const from = at
    at += s.secs
    return { ...s, from }
  })

  return (
    <>
      <Composition
        id="Doom"
        component={Doom}
        durationInFrames={sec(TOTAL_SECONDS)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      {/* One composition per scene, so a single beat can be re-rendered while iterating. */}
      {scenes.map((s) => (
        <Composition
          key={s.id}
          id={`scene-${s.id}`}
          component={s.C}
          durationInFrames={sec(s.secs)}
          fps={FPS}
          width={1920}
          height={1080}
        />
      ))}
    </>
  )
}
