#!/usr/bin/env node
// Find CSS classes that are declared twice and disagree.
//
// Three shipped bugs came from the same mistake: appending a rule for a class name
// that already existed elsewhere in the same stylesheet. .heroRow gained a
// white-space that pushed the action panel off screen. .bookRow got a five-column
// grid meant for something else. .posRow got a four-column one. In each case the
// later block silently won and the earlier layout was never applied.
//
// Duplication on its own is fine and common — a base rule plus a later block adding
// a shadow, or a grouped selector. What is never fine is the same property declared
// twice with different values, because then one of the two is dead and nobody can
// see which by reading either. That is the only thing this reports.
//
// Media queries are skipped: overriding inside one is the point of having it.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

function cssFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'out') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) cssFiles(p, out)
    else if (e.endsWith('.css')) out.push(p)
  }
  return out
}

/** Top-level rule blocks only — depth 0, so media-query overrides are ignored. */
function topLevelRules(css) {
  const rules = []
  let depth = 0, selector = '', body = '', inBody = false, line = 1, startLine = 1
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '\n') line++
    if (ch === '{') {
      depth++
      if (depth === 1) { inBody = true; body = ''; startLine = line; continue }
    } else if (ch === '}') {
      depth--
      if (depth === 0 && inBody) {
        rules.push({ selector: selector.trim(), body, line: startLine })
        selector = ''; body = ''; inBody = false
        continue
      }
    }
    if (depth === 0) selector += ch
    else if (inBody && depth === 1) body += ch
  }
  return rules
}

const declarations = (body) => {
  const out = new Map()
  for (const part of body.split(';')) {
    const idx = part.indexOf(':')
    if (idx < 1) continue
    const prop = part.slice(0, idx).trim().toLowerCase()
    const value = part.slice(idx + 1).trim().replace(/\s+/g, ' ')
    if (prop && !prop.startsWith('--')) out.set(prop, value)
  }
  return out
}

let conflicts = 0
for (const file of cssFiles(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file)
  const byClass = new Map()
  for (const rule of topLevelRules(readFileSync(file, 'utf8'))) {
    // A bare `.name` selector only — not `.name:hover`, not `.a .b`, not grouped.
    const m = /^\.([A-Za-z0-9_-]+)$/.exec(rule.selector)
    if (!m) continue
    if (!byClass.has(m[1])) byClass.set(m[1], [])
    byClass.get(m[1]).push({ line: rule.line, decls: declarations(rule.body) })
  }

  for (const [name, blocks] of byClass) {
    if (blocks.length < 2) continue
    const clashes = []
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        for (const [prop, val] of blocks[i].decls) {
          const other = blocks[j].decls.get(prop)
          if (other !== undefined && other !== val) {
            clashes.push(`${prop}: "${val}" (line ${blocks[i].line}) vs "${other}" (line ${blocks[j].line})`)
          }
        }
      }
    }
    if (clashes.length) {
      conflicts++
      console.error(`\n  .${name} — declared ${blocks.length} times in ${rel}, and they disagree:`)
      for (const c of clashes.slice(0, 6)) console.error(`      ${c}`)
      console.error(`      The later value wins, so the earlier rule is dead. Rename one.`)
    }
  }
}

if (conflicts) {
  console.error(`\n${conflicts} class${conflicts === 1 ? '' : 'es'} silently overridden.\n`)
  process.exit(1)
}
console.log('css: no class is declared twice with conflicting values')
