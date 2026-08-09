/**
 * The measurement harness.
 *
 * Everything the paper claims comes out of this file. It writes one JSON
 * document; the prose, the tables and the charts all read that document, so a
 * number in the text and a number in a figure cannot disagree. No result is
 * transcribed by hand anywhere in the project.
 *
 *   npm run capture          full run
 *   FAST=1 npm run capture   skip the 32k scale and shorten the crash trials
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import { build, FAMILIES } from '../engines/index.mjs'
import { fileVecMeta } from '../engines/file.mjs'
import { ENTITIES, RELATIONSHIPS, NORMALIZATION, FDS, SECONDARY_INDEXES, ddl } from '../engines/schema.mjs'
import { tokenize, referentialClosure, DEFAULT_K } from '../engines/contract.mjs'
import { EmbeddingStore, DIM, MODEL } from './embed.mjs'
import { validateCorpus, runQuality, runBudget, probeDenseFailure } from './exp/quality.mjs'
import { crashTrials, lostUpdateTest, anomalyTest } from './exp/integrity.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'data')
const WORK = path.join(ROOT, '.work')
const FAST = !!process.env.FAST

const log = (s) => process.stdout.write(`${s}\n`)
const step = (s) => process.stdout.write(`\n── ${s}\n`)

/* ------------------------------------------------------------------ setup */

const corpus = JSON.parse(fs.readFileSync(path.join(DATA, 'corpus.json'), 'utf8'))
const scalesRaw = JSON.parse(fs.readFileSync(path.join(DATA, 'corpus.scales.json'), 'utf8'))
const embed = EmbeddingStore.load()

const closure = referentialClosure(corpus.memories)
const memories = closure.memories
const kept = new Set(memories.map((m) => m.id))

/** Attach the derived fields every engine expects, once, so none of them differ. */
const prepQueries = (qs) => qs
  .map((q) => ({ ...q, relevant: q.relevant.filter((id) => kept.has(id)) }))
  .filter((q) => q.relevant.length > 0)
  .map((q) => ({ ...q, terms: tokenize(q.text), embedding: embed.get(q.text), k: DEFAULT_K }))

const queries = prepQueries(corpus.queries)
const byMemoryId = new Map(memories.map((m) => [m.id, m]))

/* ------------------------------------------------------ token accounting */

step('token accounting')
const { AutoTokenizer } = await import('@huggingface/transformers')
const tok = await AutoTokenizer.from_pretrained('Xenova/gpt-4o')
const tokenLen = new Map()
// Encoded one at a time rather than batched: batching needs padding, and a
// padded length is not the token cost the memory would actually incur.
for (const m of memories) tokenLen.set(m.id, tok.encode(m.body).length)
const corpusTokens = [...tokenLen.values()].reduce((s, v) => s + v, 0)
log(`  ${corpusTokens.toLocaleString()} tokens across ${memories.length.toLocaleString()} memories `
  + `(mean ${(corpusTokens / memories.length).toFixed(1)})`)

/* ------------------------------------------------- corpus self-validation */

step('corpus validation')
const validation = validateCorpus({ ...corpus, memories }, embed)
for (const r of validation.byClass) {
  log(`  ${r.class.padEnd(11)} overlap=${r.meanTermOverlap.toFixed(3)} `
    + `rare=${r.meanRareTermOverlap.toFixed(3)} cos=${r.meanCosine.toFixed(3)} rel/q=${r.meanRelevantPerQuery}`)
}
log(`  random-pair cosine baseline = ${validation.randomPairCosine}`)

step('dense-retrieval failure forensics')
const denseFailure = probeDenseFailure(memories, queries, embed, { cls: 'lexical', samples: 6, dim: DIM })
log(`  top hit is a distractor in ${(denseFailure.topIsDistractorRate * 100).toFixed(0)}% of probes; `
  + `median rank of first relevant memory = ${denseFailure.medianFirstRelevantRank} of ${memories.length}`)

/* ------------------------------------------------------------ main sweep */

step(`main sweep — ${memories.length} memories, ${queries.length} queries, k=${DEFAULT_K}`)
const engineResults = []
for (const eng of build()) {
  const dir = path.join(WORK, 'main', eng.id)
  const t0 = Date.now()
  try {
    await eng.open({ dir, dim: DIM })
    const load = await eng.load(memories, embed)
    const quality = await runQuality(eng, queries, { k: DEFAULT_K, repeats: 3 })
    const storage = await eng.storage()
    const budget = await runBudget(eng, queries, tokenLen)

    // What each engine actually handed back, for one query per class. Aggregate
    // scores say an arm is worse; this says what "worse" looked like — which
    // memory it put first, and whether that memory answered the question.
    const showcase = []
    for (const cls of [...new Set(queries.map((q) => q.class))]) {
      const q = queries.find((x) => x.class === cls)
      const rel = new Set(q.relevant)
      const res = await eng.recall({ ...q, k: DEFAULT_K })
      showcase.push({
        queryId: q.id,
        class: cls,
        text: q.text,
        relevantCount: q.relevant.length,
        returned: res.ids.map((id, i) => {
          const m = byMemoryId.get(id)
          return {
            rank: i + 1,
            id,
            relevant: rel.has(id),
            distractor: m ? m.factId === null : null,
            body: m?.body ?? '',
            sessionId: m?.sessionId ?? null,
            day: m?.day ?? null,
            supersededBy: m?.supersededBy ?? null,
          }
        }),
      })
    }

    // One plan per query class, so §6.3 can show what the engine actually did
    // rather than what it was asked to do.
    const plans = []
    for (const cls of [...new Set(queries.map((q) => q.class))]) {
      const q = queries.find((x) => x.class === cls)
      try {
        const ex = await eng.explain(q)
        plans.push({ class: cls, query: q.text, text: ex.text, sql: ex.sql ?? null, plan: ex.plan ?? null })
      } catch (e) {
        plans.push({ class: cls, query: q.text, text: `explain unavailable: ${e.message}`, sql: null, plan: null })
      }
    }

    engineResults.push({
      id: eng.id,
      label: eng.label,
      short: eng.short,
      family: eng.family,
      engine: eng.engine,
      index: eng.index,
      note: eng.note,
      supports: eng.supports,
      load,
      quality,
      storage,
      budget,
      plans,
      showcase,
      bytesPerMemory: Number((storage.totalBytes / memories.length).toFixed(1)),
    })
    log(`  ${eng.id.padEnd(15)} nDCG=${quality.overall.ndcg.toFixed(3)} R=${quality.overall.r.toFixed(3)} `
      + `p50=${quality.overall.p50Ms.toFixed(2)}ms p95=${quality.overall.p95Ms.toFixed(2)}ms `
      + `${(storage.totalBytes / 1024 / 1024).toFixed(1)}MB (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  } catch (e) {
    log(`  ${eng.id.padEnd(15)} FAILED: ${e.message}`)
    engineResults.push({ id: eng.id, label: eng.label, family: eng.family, failed: e.message })
  } finally {
    await eng.close().catch(() => {})
  }
}

/* ------------------------------------------------------ post-filter sweep */

step('post-filter collapse')
const postFilter = []
{
  const filtered = queries.filter((q) => q.predicate)
  for (const of_ of [1, 2, 4, 8, 16, 32, 64, 128]) {
    const eng = fileVecMeta(of_)
    await eng.open({ dir: path.join(WORK, 'pf', String(of_)), dim: DIM })
    await eng.load(memories, embed)
    let survived = 0, asked = 0, recall = 0, hits = 0, ms = 0
    for (const q of filtered) {
      const t = process.hrtime.bigint()
      const res = await eng.recall({ ...q, k: DEFAULT_K })
      ms += Number(process.hrtime.bigint() - t) / 1e6
      survived += Math.min(res.survived, DEFAULT_K)
      asked += DEFAULT_K
      const rel = new Set(q.relevant)
      hits += res.ids.filter((id) => rel.has(id)).length
      recall += res.ids.filter((id) => rel.has(id)).length / rel.size
    }
    await eng.close()
    postFilter.push({
      overfetch: of_,
      fetched: DEFAULT_K * of_,
      meanSurvivingSlots: Number((survived / filtered.length).toFixed(2)),
      slotFillRate: Number((survived / asked).toFixed(4)),
      recall: Number((recall / filtered.length).toFixed(4)),
      meanMs: Number((ms / filtered.length).toFixed(3)),
      scanFraction: Number(Math.min(1, (DEFAULT_K * of_) / memories.length).toFixed(4)),
    })
    log(`  overfetch ×${String(of_).padEnd(3)} fill=${(survived / asked * 100).toFixed(1)}% `
      + `recall=${(recall / filtered.length).toFixed(3)} ${(ms / filtered.length).toFixed(2)}ms`)
  }
}

/* ---------------------------------------------------------- scaling sweep */

step('scaling sweep')
const scaleTargets = FAST ? [500, 2000, 8000] : [500, 2000, 8000, 32000]
const scaling = []
for (const target of scaleTargets) {
  const raw = scalesRaw[String(target)]
  if (!raw) continue
  const cl = referentialClosure(raw.memories)
  const mem = cl.memories
  const keepS = new Set(mem.map((m) => m.id))
  const qs = raw.queries
    .map((q) => ({ ...q, relevant: q.relevant.filter((id) => keepS.has(id)) }))
    .filter((q) => q.relevant.length > 0)
    .map((q) => ({ ...q, terms: tokenize(q.text), embedding: embed.get(q.text), k: DEFAULT_K }))

  const row = { target, memories: mem.length, queries: qs.length, engines: [] }
  for (const eng of build()) {
    const dir = path.join(WORK, 'scale', String(target), eng.id)
    try {
      await eng.open({ dir, dim: DIM })
      const load = await eng.load(mem, embed)
      const quality = await runQuality(eng, qs, { k: DEFAULT_K, repeats: 2 })
      const storage = await eng.storage()
      row.engines.push({
        id: eng.id,
        ingestMs: Number(load.ingestMs.toFixed(1)),
        indexMs: Number(load.indexMs.toFixed(1)),
        p50Ms: quality.overall.p50Ms,
        p95Ms: quality.overall.p95Ms,
        ndcg: quality.overall.ndcg,
        recall: quality.overall.r,
        bytes: storage.totalBytes,
        bytesPerMemory: Number((storage.totalBytes / mem.length).toFixed(1)),
      })
    } catch (e) {
      row.engines.push({ id: eng.id, failed: e.message })
    } finally {
      await eng.close().catch(() => {})
    }
    fs.rmSync(path.join(WORK, 'scale', String(target), eng.id), { recursive: true, force: true })
  }
  scaling.push(row)
  const pg = row.engines.find((e) => e.id === 'pg-hybrid')
  log(`  ${String(target).padStart(6)} → ${mem.length} memories, ${qs.length} queries`
    + (pg?.p50Ms != null ? `, pg-hybrid p50=${pg.p50Ms}ms ${(pg.bytes / 1048576).toFixed(1)}MB` : ''))
}

/* ------------------------------------------------------- ACID experiments */

step('durability under crash')
const durability = []
{
  const trials = FAST ? 5 : 20
  const cfg = [
    ['file-append', { seed: 20000, total: 2000000, killAfter: 700 }],
    ['file-rewrite', { seed: 20000, total: 2000000, killAfter: 700 }],
    ['sqlite', { seed: 20000, total: 2000000, killAfter: 700 }],
    ['postgres', { seed: 4000, total: 200000, killAfter: 1500 }],
  ]
  for (const [kind, o] of cfg) {
    const r = await crashTrials(kind, path.join(WORK, 'crash', kind), o, kind === 'postgres' ? Math.min(8, trials) : trials)
    durability.push(r)
    log(`  ${kind.padEnd(13)} unreadable=${r.unreadable}/${r.trials} corrupt=${r.corruptTrials} `
      + `durable≈${r.meanDurable}`)
    fs.rmSync(path.join(WORK, 'crash', kind), { recursive: true, force: true })
  }
}

step('lost updates under concurrency')
const concurrency = await lostUpdateTest({ writers: 8, rounds: 25, dir: path.join(WORK, 'lu') })
for (const [k, v] of Object.entries(concurrency.results)) {
  log(`  ${k.padEnd(9)} expected=${v.expected} observed=${v.observed} lost=${v.lost}`)
}

step('normalisation anomaly')
const anomaly = await (async () => {
  const eng = build().find((e) => e.id === 'pg-hybrid')
  await eng.open({ dir: path.join(WORK, 'anomaly'), dim: DIM })
  await eng.load(memories, embed)
  const r = await anomalyTest({ ...corpus, memories }, eng, queries, DEFAULT_K)
  await eng.close()
  fs.rmSync(path.join(WORK, 'anomaly'), { recursive: true, force: true })
  return r
})()
log(`  mean restatements/fact = ${anomaly.restatementsPerFact.mean}, `
  + `top-${DEFAULT_K} repair leaves ${(anomaly.topKRepair.staleFraction * 100).toFixed(1)}% stale`)

/* ------------------------------------------------------- expressibility */

const classes = [...new Set(queries.map((q) => q.class))]
const expressibility = {
  classes: classes.map((c) => {
    const qs = queries.filter((q) => q.class === c)
    return {
      class: c,
      queries: qs.length,
      share: Number((qs.length / queries.length).toFixed(4)),
      similarityExpressible: qs[0].similarityExpressible,
      rationale: qs[0].rationale,
      predicate: qs[0].predicate ? { field: qs[0].predicate.field, op: qs[0].predicate.op } : null,
      example: qs[0].text,
    }
  }),
  similarityExpressible: queries.filter((q) => q.similarityExpressible).length,
  total: queries.length,
}
expressibility.similarityShare = Number((expressibility.similarityExpressible / expressibility.total).toFixed(4))

/* ------------------------------------------------------------------ write */

const toolchain = {
  node: process.version,
  sqlite: (() => {
    const d = new DatabaseSync(':memory:')
    const v = d.prepare('select sqlite_version() as v').get().v
    d.close()
    return v
  })(),
  postgres: await (async () => {
    const { PGlite } = await import('@electric-sql/pglite')
    const d = await PGlite.create()
    const v = (await d.query('select version()')).rows[0].version
    await d.close()
    return v
  })(),
  pglite: JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/@electric-sql/pglite/package.json'), 'utf8')).version,
  pgvector: JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/@electric-sql/pglite-pgvector/package.json'), 'utf8')).version,
  embeddingModel: MODEL,
  embeddingDim: DIM,
  tokenizer: 'Xenova/gpt-4o',
}

const out = {
  capturedAt: new Date().toISOString(),
  fast: FAST,
  machine: {
    cpu: os.cpus()[0]?.model?.trim() ?? 'unknown',
    cores: os.cpus().length,
    totalMemGB: Math.round(os.totalmem() / 1024 ** 3),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
  },
  toolchain,
  k: DEFAULT_K,
  corpus: {
    stats: { ...corpus.stats, memories: memories.length, tokens: corpusTokens,
      meanTokensPerMemory: Number((corpusTokens / memories.length).toFixed(1)) },
    options: corpus.options,
    referentialClosureCleared: closure.cleared,
    validation,
    denseFailure,
    queriesUsed: queries.length,
    sampleMemories: memories.slice(0, 6).map((m) => ({
      id: m.id, sessionId: m.sessionId, turn: m.turn, kind: m.kind, body: m.body,
      factId: m.factId, day: m.day, source: m.source, confidence: m.confidence,
      supersededBy: m.supersededBy, tokens: tokenLen.get(m.id),
    })),
    sampleQueries: classes.map((c) => {
      const q = queries.find((x) => x.class === c)
      return { id: q.id, class: q.class, text: q.text, relevantCount: q.relevant.length,
        predicate: q.predicate, similarityExpressible: q.similarityExpressible, rationale: q.rationale }
    }),
  },
  schema: {
    entities: ENTITIES,
    relationships: RELATIONSHIPS,
    normalization: NORMALIZATION,
    fds: FDS,
    secondaryIndexes: SECONDARY_INDEXES,
    ddl: { sqlite: ddl('sqlite'), postgres: ddl('postgres') },
  },
  families: FAMILIES,
  engines: engineResults,
  expressibility,
  postFilter,
  scaling,
  durability,
  concurrency,
  anomaly,
}

fs.mkdirSync(path.join(ROOT, 'web', 'data'), { recursive: true })
const json = JSON.stringify(out)
fs.writeFileSync(path.join(DATA, 'capture.json'), json)
fs.writeFileSync(path.join(ROOT, 'web', 'data', 'capture.json'), json)

step('done')
log(`  ${(json.length / 1024 / 1024).toFixed(2)} MB → data/capture.json and web/data/capture.json`)

