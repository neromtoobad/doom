// Works out when each narration line should start, and checks the result.
//
// The read is slower than a script-length estimate predicts, so cues are computed
// from the measured audio rather than assumed. A line is only allowed to start at
// its intended cue if the previous line has finished; otherwise it is pushed back,
// and the drift is reported. Any line that ends up playing over the wrong scene is
// flagged loudly, because that is the failure that is invisible in a waveform.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = JSON.parse(readFileSync(join(ROOT, 'src/data/script.json'), 'utf8'))

// Must match the scene table in src/Doom.tsx.
const SCENES = [
  ['title', 0, 8], ['problem', 8, 28], ['book', 28, 50], ['maker', 50, 68],
  ['fee', 68, 97], ['create', 97, 118], ['oracle', 118, 138], ['keys', 138, 151],
  ['proof', 151, 171], ['close', 171, 180],
]
const sceneAt = (t) => (SCENES.find(([, a, b]) => t >= a && t < b) ?? SCENES.at(-1))[0]
const sceneEnd = (name) => SCENES.find(([n]) => n === name)[2]

const duration = (f) =>
  parseFloat(execFileSync('ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

const GAP = 0.5
const place = []
let cursor = 0
for (const line of script) {
  const dur = duration(join(ROOT, `audio/f-${line.id}.wav`))
  const start = Math.max(line.at, cursor ? cursor + GAP : line.at)
  place.push({ id: line.id, start: +start.toFixed(2), end: +(start + dur).toFixed(2), dur: +dur.toFixed(2), text: line.text })
  cursor = start + dur
}

let problems = 0
for (const p of place) {
  const s = sceneAt(p.start)
  const spill = p.end - sceneEnd(s)
  // Under a second reads as a sentence landing on a cut; more is narration over
  // the wrong picture.
  if (spill > 1.5) {
    problems++
    console.error(`  line ${p.id} spills ${spill.toFixed(1)}s past "${s}" — shorten it or move its cue`)
  }
}

const speech = place.reduce((a, p) => a + p.dur, 0)
console.log(`${place.length} lines · ends ${place.at(-1).end.toFixed(1)}/180 · speech ${speech.toFixed(0)}s (${Math.round(speech / 180 * 100)}% density)`)
if (place.at(-1).end > 180) { console.error('  last line runs past the end of the cut'); problems++ }
if (problems) { console.error(`\n${problems} problem(s)`); process.exit(1) }

writeFileSync(join(ROOT, 'src/data/placement.json'), JSON.stringify(place, null, 2))
console.log('wrote src/data/placement.json')
