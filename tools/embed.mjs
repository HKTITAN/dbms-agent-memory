/**
 * Embedding cache.
 *
 * Every arm that does similarity search must see identical vectors, or a
 * retrieval difference could be an embedding difference. So embeddings are
 * computed once, here, and stored in a content-addressed binary cache that all
 * engines read. The model runs locally — no API, no network at measurement
 * time, no drift between runs.
 *
 * Model: Xenova/all-MiniLM-L6-v2, 384 dimensions, mean-pooled and L2-normalised
 * so that a dot product is a cosine.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'data')
const BIN = path.join(DATA, 'embeddings.bin')
const IDX = path.join(DATA, 'embeddings.idx.json')

export const MODEL = 'Xenova/all-MiniLM-L6-v2'
export const DIM = 384

const key = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)

/* ------------------------------------------------------------------ cache */

export class EmbeddingStore {
  constructor(index, buf) {
    this.index = index
    this.buf = buf
  }

  static load() {
    if (!fs.existsSync(BIN) || !fs.existsSync(IDX)) {
      throw new Error('embeddings not built — run `npm run embed` first')
    }
    return new EmbeddingStore(JSON.parse(fs.readFileSync(IDX, 'utf8')), fs.readFileSync(BIN))
  }

  /** Float32Array view over the cache. No copy: engines read, they do not mutate. */
  get(text) {
    const off = this.index.offsets[key(text)]
    if (off === undefined) throw new Error(`no embedding cached for: ${text.slice(0, 60)}…`)
    return new Float32Array(this.buf.buffer, this.buf.byteOffset + off * DIM * 4, DIM)
  }

  has(text) { return this.index.offsets[key(text)] !== undefined }
}

/* ------------------------------------------------------------------ build */

async function build(texts) {
  const { pipeline } = await import('@huggingface/transformers')
  process.stderr.write(`loading ${MODEL}…\n`)
  const extract = await pipeline('feature-extraction', MODEL, { dtype: 'fp32' })

  const uniq = [...new Set(texts)]
  const offsets = {}
  const out = Buffer.alloc(uniq.length * DIM * 4)
  const BATCH = 64
  const t0 = Date.now()

  for (let i = 0; i < uniq.length; i += BATCH) {
    const batch = uniq.slice(i, i + BATCH)
    const res = await extract(batch, { pooling: 'mean', normalize: true })
    const flat = res.data
    for (let j = 0; j < batch.length; j++) {
      const idx = i + j
      offsets[key(batch[j])] = idx
      for (let d = 0; d < DIM; d++) out.writeFloatLE(flat[j * DIM + d], (idx * DIM + d) * 4)
    }
    if (i % (BATCH * 20) === 0 || i + BATCH >= uniq.length) {
      const done = Math.min(i + BATCH, uniq.length)
      const rate = done / ((Date.now() - t0) / 1000)
      process.stderr.write(`  ${done}/${uniq.length} (${rate.toFixed(0)}/s)\r`)
    }
  }
  process.stderr.write('\n')

  fs.mkdirSync(DATA, { recursive: true })
  fs.writeFileSync(BIN, out)
  fs.writeFileSync(IDX, JSON.stringify({
    model: MODEL, dim: DIM, count: uniq.length, offsets,
    builtAt: new Date().toISOString(),
  }))
  return { count: uniq.length, seconds: (Date.now() - t0) / 1000 }
}

/* ------------------------------------------------------------------- main */

if (process.argv[1]?.endsWith('embed.mjs')) {
  const corpus = JSON.parse(fs.readFileSync(path.join(DATA, 'corpus.json'), 'utf8'))
  const scales = JSON.parse(fs.readFileSync(path.join(DATA, 'corpus.scales.json'), 'utf8'))

  const texts = []
  for (const m of corpus.memories) texts.push(m.body)
  for (const q of corpus.queries) texts.push(q.text)
  for (const s of Object.values(scales)) {
    for (const m of s.memories) texts.push(m.body)
    for (const q of s.queries) texts.push(q.text)
  }

  const existing = fs.existsSync(IDX) ? JSON.parse(fs.readFileSync(IDX, 'utf8')) : null
  const uniq = new Set(texts)
  const covered = existing && [...uniq].every((t) => existing.offsets[key(t)] !== undefined)
  if (covered && existing.model === MODEL) {
    console.log(`embeddings: cache hit (${existing.count} vectors, ${MODEL})`)
  } else {
    const r = await build(texts)
    console.log(`embeddings: built ${r.count} vectors in ${r.seconds.toFixed(1)}s (${MODEL}, ${DIM}d)`)
  }
}
