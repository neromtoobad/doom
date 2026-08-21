# video

The three-minute submission film, built with [Remotion](https://remotion.dev).

Nothing in it is a mockup. Every screen is a capture of the deployed site reading
mainnet, and every number on screen — prices, quotes, transaction senders, nonces
— comes from the chain or from the contracts' own views. The narration is the
project owner's voice.

Watch it: **https://youtu.be/zUd1gX9ZN9Q**

## Layout

| path | what it is |
|---|---|
| `capture/shoot.mjs` | Drives the live site with Playwright. Writes `public/shots/*.png` **and** `src/data/rects.json`, the measured element boxes the callouts anchor to. |
| `capture/chaindata.mjs` | Reads the four submitted transactions over JSON-RPC into `src/data/chain.json`. |
| `capture/plan.mjs` | Measures `audio/f-*.wav`, works out narration cues, and fails if a line would play over the wrong scene. Writes `src/data/placement.json`. |
| `capture/mix.mjs` | Builds the narration track from those cues and muxes it onto the render. |
| `src/Doom.tsx` | The cut: one table of scene durations, in seconds, summing to 180. |
| `src/scenes/` | One file per beat. |
| `src/components/Shot.tsx` | The camera. Positions are `{s, fx, fy}` — zoom plus a focal point in normalised source coordinates. |
| `NARRATION.md` | The script, with cue points. |

## Two things worth knowing before changing it

**Callouts are measured, not placed.** A ring drawn at hand-picked pixel
coordinates breaks the moment a shot zooms or the site's layout shifts. `shoot.mjs`
records each element's real bounding box while it is on screen; `Shot` publishes
its camera transform on a context, and `Ring` resolves source coordinates against
it every frame. Re-capture and the annotations follow.

**Narration cues are computed from the audio, not from the script.** The read
comes in around 97 words per minute, well under what a word count predicts, so the
first pass overran the video by nearly a minute and later lines drifted onto the
wrong scenes. `plan.mjs` measures the real files, pushes a line back if the one
before it is still talking, and exits non-zero if any line spills more than 1.5s
past its scene. Trust it over your own estimate.

## Re-running

```bash
npm install
npx playwright install chromium

node capture/shoot.mjs        # refresh the screens + measurements
node capture/chaindata.mjs    # refresh the on-chain facts

npm run dev                   # Remotion Studio, for scrubbing
npm run render                # out/doom.mp4, silent

node capture/plan.mjs         # re-cue the narration
node capture/mix.mjs out/doom.mp4 out/doom-vo.mp4
```

`chaindata.mjs` reads the Alchemy key from `../.env.local`. That key is public by
design — it ships in the site's client bundle — but the file is gitignored and is
not duplicated here.

`public/brand` is a symlink to the site's own `public/brand`, so the film and the
page cannot drift apart.

## Editing one beat

Every scene is registered as its own composition, so a single beat can be scrubbed
or rendered without sitting through the other 170 seconds:

```bash
npx remotion render src/index.ts scene-bet out/bet.mp4
```

## Re-recording a line

Lines are placed at absolute cues rather than concatenated, so re-reading one only
moves that one. Replace `audio/f-<id>.wav`, then re-run `plan.mjs` and `mix.mjs`.
The voice is a Higgsfield voice element; `NARRATION.md` has the text. Processing
applied to each raw take was `atempo=1.12`, silence trim, then
`loudnorm=I=-17:TP=-1.5`.
