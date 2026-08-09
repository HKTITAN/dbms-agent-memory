/**
 * The two file-backed baselines.
 *
 * These are not straw men. They are what the majority of published agent
 * memory implementations actually do: append records to a file, and at recall
 * time either scan the text or run a brute-force similarity search over an
 * in-process array of vectors. Both are included so that every DBMS result in
 * the paper has something to be a difference *from*.
 *
 * Neither has a transaction, a secondary index, a query planner, or any way to
 * express a predicate. That is the point.
 */

import fs from 'node:fs'
import path from 'node:path'
import { applyPredicate, DEFAULT_K } from './contract.mjs'

/* -------------------------------------------------- 1. append-only JSONL */

export function fileJsonl() {
  let file = null
  let cache = null

  return {
    id: 'file-jsonl',
    family: 'file',
    label: 'JSONL file',
    short: 'JSONL',
    index: 'none',
    engine: 'append-only text file',
    supports: { predicates: false, joins: false, aggregates: false, transactions: false, vector: false },
    note: 'One JSON object per line. Recall reads the whole file and scores by term overlap.',

    async open({ dir }) {
      fs.mkdirSync(dir, { recursive: true })
      file = path.join(dir, 'memory.jsonl')
      fs.writeFileSync(file, '')
      cache = null
    },

    async load(memories) {
      const t0 = process.hrtime.bigint()
      // Exactly the naive pattern: one append per memory, no batching, no fsync.
      for (const m of memories) fs.appendFileSync(file, JSON.stringify(m) + '\n')
      const ingestMs = Number(process.hrtime.bigint() - t0) / 1e6
      return { ingestMs, indexMs: 0 }
    },

    /**
     * Re-reads and re-parses the file on every recall. That is the honest cost
     * of a store with no index: there is nowhere else for the data to live.
     * Frameworks that keep it in memory instead have simply moved the problem
     * to "what happens when it does not fit", which §6.6 measures.
     */
    async recall(q) {
      const k = q.k ?? DEFAULT_K
      const rows = fs.readFileSync(file, 'utf8').split('\n')
      const terms = q.terms
      const scored = []
      for (const line of rows) {
        if (!line) continue
        const m = JSON.parse(line)
        const body = m.body.toLowerCase()
        let s = 0
        for (const t of terms) if (body.includes(t)) s++
        if (s > 0) scored.push([m.id, s, m.seq])
      }
      scored.sort((a, b) => b[1] - a[1] || b[2] - a[2])
      return { ids: scored.slice(0, k).map((x) => x[0]) }
    },

    async storage() {
      const bytes = fs.statSync(file).size
      return { totalBytes: bytes, breakdown: [{ name: 'memory.jsonl', kind: 'heap', bytes }] }
    },

    async explain() {
      return { text: 'full file read + parse; no access method exists', plan: null }
    },

    async close() { cache = null },
  }
}

/* ------------------------------------------------ 2. flat vector index */

export function fileVec() {
  let file = null
  let ids = []
  let vecs = null
  let dim = 384

  return {
    id: 'file-vec',
    family: 'file',
    label: 'Flat vector index',
    short: 'Vector',
    index: 'vector',
    engine: 'in-process float array',
    supports: { predicates: false, joins: false, aggregates: false, transactions: false, vector: true },
    note: 'The "just use a vector store" architecture: brute-force cosine over every vector, no predicates.',

    async open({ dir, dim: d }) {
      fs.mkdirSync(dir, { recursive: true })
      file = path.join(dir, 'memory.json')
      dim = d
      ids = []
      vecs = null
    },

    async load(memories, embed) {
      const t0 = process.hrtime.bigint()
      fs.writeFileSync(file, JSON.stringify(memories))
      const ingestMs = Number(process.hrtime.bigint() - t0) / 1e6

      const t1 = process.hrtime.bigint()
      ids = memories.map((m) => m.id)
      vecs = new Float32Array(memories.length * dim)
      for (let i = 0; i < memories.length; i++) vecs.set(embed.get(memories[i].body), i * dim)
      const indexMs = Number(process.hrtime.bigint() - t1) / 1e6
      return { ingestMs, indexMs }
    },

    async recall(q) {
      const k = q.k ?? DEFAULT_K
      const e = q.embedding
      // Brute force. Exact by construction — no recall loss from approximation,
      // which is why this arm is the ceiling that HNSW is measured against.
      const best = []
      for (let i = 0; i < ids.length; i++) {
        let d = 0
        const off = i * dim
        for (let j = 0; j < dim; j++) d += vecs[off + j] * e[j]
        if (best.length < k) {
          best.push([d, i])
          if (best.length === k) best.sort((a, b) => a[0] - b[0])
        } else if (d > best[0][0]) {
          best[0] = [d, i]
          best.sort((a, b) => a[0] - b[0])
        }
      }
      return { ids: best.sort((a, b) => b[0] - a[0]).map(([, i]) => ids[i]) }
    },

    async storage() {
      const heap = fs.statSync(file).size
      const index = vecs ? vecs.byteLength : 0
      return {
        totalBytes: heap + index,
        breakdown: [
          { name: 'memory.json', kind: 'heap', bytes: heap },
          { name: 'float32 vectors', kind: 'vector', bytes: index },
        ],
      }
    },

    async explain() {
      return { text: `brute-force scan of ${ids.length} vectors × ${dim} dims`, plan: null }
    },

    async close() { vecs = null; ids = [] },
  }
}

/* ------------------------------ 3. vector index with metadata post-filter */

/**
 * A managed vector store, modelled honestly.
 *
 * Comparing a DBMS against a vector index that cannot filter at all would be a
 * straw man — every production vector store supports metadata filters. What
 * they mostly do *not* have is a planner that can decide to use the filter
 * first. The common implementation retrieves the top `k × overfetch` by
 * similarity and then discards whatever fails the filter, which means the
 * filter cannot add results, only remove them.
 *
 * That single property is what §6.6 measures: as a predicate gets more
 * selective, the answer set collapses, and the fix — raising overfetch — walks
 * the cost back toward the sequential scan the index existed to avoid.
 */
export function fileVecMeta(overfetch = 4) {
  let file = null
  let ids = []
  let rows = []
  let vecs = null
  let dim = 384

  return {
    id: overfetch === 4 ? 'file-vec-meta' : `file-vec-meta-${overfetch}`,
    family: 'file',
    label: `Vector index + post-filter${overfetch === 4 ? '' : ` (×${overfetch})`}`,
    short: `Vector+filter`,
    index: 'vector',
    engine: 'in-process float array with metadata post-filter',
    overfetch,
    supports: { predicates: 'post', joins: false, aggregates: false, transactions: false, vector: true },
    note: `Retrieves k×${overfetch} by similarity, then drops rows failing the predicate. The filter cannot recover a row the index did not rank highly.`,

    async open({ dir, dim: d }) {
      fs.mkdirSync(dir, { recursive: true })
      file = path.join(dir, 'memory.json')
      dim = d
      ids = []; rows = []; vecs = null
    },

    async load(memories, embed) {
      const t0 = process.hrtime.bigint()
      fs.writeFileSync(file, JSON.stringify(memories))
      const ingestMs = Number(process.hrtime.bigint() - t0) / 1e6

      const t1 = process.hrtime.bigint()
      ids = memories.map((m) => m.id)
      rows = memories
      vecs = new Float32Array(memories.length * dim)
      for (let i = 0; i < memories.length; i++) vecs.set(embed.get(memories[i].body), i * dim)
      const indexMs = Number(process.hrtime.bigint() - t1) / 1e6
      return { ingestMs, indexMs }
    },

    async recall(q) {
      const k = q.k ?? DEFAULT_K
      const fetch = k * overfetch
      const e = q.embedding
      const scored = new Array(ids.length)
      for (let i = 0; i < ids.length; i++) {
        let d = 0
        const off = i * dim
        for (let j = 0; j < dim; j++) d += vecs[off + j] * e[j]
        scored[i] = [d, i]
      }
      scored.sort((a, b) => b[0] - a[0])
      const candidates = scored.slice(0, fetch).map(([, i]) => rows[i])
      const kept = applyPredicate(candidates, q.predicate)
      return {
        ids: kept.slice(0, k).map((m) => m.id),
        // Recorded so the paper can show the collapse directly rather than infer it.
        fetched: Math.min(fetch, ids.length),
        survived: kept.length,
      }
    },

    async storage() {
      const heap = fs.statSync(file).size
      const index = vecs ? vecs.byteLength : 0
      return {
        totalBytes: heap + index,
        breakdown: [
          { name: 'memory.json', kind: 'heap', bytes: heap },
          { name: 'float32 vectors', kind: 'vector', bytes: index },
        ],
      }
    },

    async explain(q) {
      const k = q?.k ?? DEFAULT_K
      return {
        text: `top-${k * overfetch} by cosine over ${ids.length} vectors, then post-filter to ${k}`,
        plan: null,
      }
    },

    async close() { vecs = null; ids = []; rows = [] },
  }
}
