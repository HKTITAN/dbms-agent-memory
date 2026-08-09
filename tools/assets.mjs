#!/usr/bin/env node
/* Publish the generated downloads into web/public so the site can serve them.

   Kept as its own step rather than folded into the PDF/EPUB scripts: those two
   own generation, this one owns publication. Running it twice is harmless, and
   it reports what is missing instead of silently shipping a stale download. */

import { copyFileSync, existsSync, mkdirSync, statSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAPER = join(ROOT, 'paper')
const PUB = join(ROOT, 'web', 'public')

mkdirSync(PUB, { recursive: true })

// create-next-app's placeholder art, which this project never references.
for (const junk of ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg']) {
  const p = join(PUB, junk)
  if (existsSync(p)) {
    rmSync(p)
    console.log(`removed unused ${junk}`)
  }
}

const assets = [
  { from: join(PAPER, 'persistent-memory-architecture-in-agents.pdf'), to: join(PUB, 'persistent-memory-architecture-in-agents.pdf'), what: 'PDF' },
  { from: join(PAPER, 'persistent-memory-architecture-in-agents.epub'), to: join(PUB, 'persistent-memory-architecture-in-agents.epub'), what: 'EPUB' },
]

let missing = 0
for (const a of assets) {
  if (!existsSync(a.from)) {
    console.warn(`! ${a.what} not found at ${a.from} — run its generator first`)
    missing++
    continue
  }
  copyFileSync(a.from, a.to)
  console.log(`${a.what.padEnd(5)} -> public/${a.to.split(/[\\/]/).pop()}  ${(statSync(a.to).size / 1024 / 1024).toFixed(2)} MB`)
}

const previews = readdirSync(PUB).filter((f) => f.startsWith('preview-'))
if (previews.length === 0) console.warn('! no preview images — run tools/previews.mjs')
else for (const p of previews) console.log(`prev  -> public/${p}  ${(statSync(join(PUB, p)).size / 1024).toFixed(0)} KB`)

process.exit(missing > 0 ? 1 : 0)
