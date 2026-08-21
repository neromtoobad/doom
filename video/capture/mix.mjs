// Builds the narration track and muxes it onto the silent render.
//
// The lines are placed at absolute cues rather than concatenated, so a re-read of
// any single line only moves that line. Cues live in src/data/placement.json,
// which `plan.mjs` computes from the measured audio.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const place = JSON.parse(readFileSync(join(ROOT, 'src/data/placement.json'), 'utf8'))

const VIDEO = process.argv[2] ?? join(ROOT, 'out/doom-v1.mp4')
const OUT = process.argv[3] ?? join(ROOT, 'out/doom-hackathon-vo.mp4')
const VO = join(ROOT, 'out/vo-full.wav')

const inputs = place.flatMap((p) => ['-i', join(ROOT, `audio/f-${p.id}.wav`)])
const delays = place
  .map((p, i) => `[${i}]adelay=${Math.round(p.start * 1000)}:all=1[a${i}]`)
  .join(';')
const mixIn = place.map((_, i) => `[a${i}]`).join('')
// normalize=0 keeps a solo voice at its own level; the lines never overlap, so
// there is nothing to sum and nothing to clip.
const filter = `${delays};${mixIn}amix=inputs=${place.length}:normalize=0:dropout_transition=0[m];[m]apad[out]`

console.log(`→ mixing ${place.length} lines`)
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs,
  '-filter_complex', filter, '-map', '[out]',
  '-t', '180.0533', '-ar', '48000', '-ac', '2', VO], { stdio: 'inherit' })

console.log('→ muxing onto', VIDEO)
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', VIDEO, '-i', VO,
  '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
  '-shortest', OUT], { stdio: 'inherit' })

console.log('done →', OUT)
