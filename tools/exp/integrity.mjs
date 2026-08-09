/**
 * The experiments that are about the DBMS rather than about retrieval:
 * durability under a crash, isolation under concurrent writers, and the
 * anomaly a denormalised store leaves behind when a fact changes.
 *
 * These are the arguments a database course makes and an agent-memory paper
 * usually skips. They are also the ones where the file baselines do not merely
 * score worse — they produce answers that are wrong in a way no amount of
 * retrieval tuning can fix.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHILD = path.join(HERE, 'crash-child.mjs')

/* ------------------------------------------------------------ durability */

/**
 * Kill a writer mid-transaction and ask the store what it kept.
 *
 * A child process writes `total` records, announcing progress on stdout. The
 * parent kills it hard (SIGKILL — no handlers, no flush, no unwinding) partway
 * through, then reopens the store and counts what survived.
 *
 * The question is not "how many records were lost" — losing uncommitted work is
 * correct. The question is whether what remains is a consistent prefix of the
 * intended state, or wreckage: a half-written record, a file that no longer
 * parses, a store that will not open.
 */
export async function crashTest(kind, dir, { total = 4000, killAfter = 900, seed = 0, readyTimeout = 120000 } = {}) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  const child = spawn(process.execPath, [CHILD, kind, dir, String(total), String(seed)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let announced = 0
  let stderr = ''
  let markReady
  const readySignal = new Promise((res) => { markReady = res })
  child.stdout.on('data', (b) => {
    for (const line of String(b).split('\n')) {
      const t = line.trim()
      if (t === 'ready') markReady(true)
      const m = /^wrote (\d+)$/.exec(t)
      if (m) announced = Number(m[1])
    }
  })
  child.stderr.on('data', (b) => { stderr += b })

  const exited = new Promise((res) => child.on('exit', (code, sig) => res({ code, sig })))

  // Wait for the store to exist and hold a durable baseline before the clock
  // starts. Without this, killing a Postgres cluster during initdb would be
  // recorded as a durability failure, which it is not.
  const ready = await Promise.race([
    readySignal,
    exited.then(() => false),
    new Promise((r) => setTimeout(() => r(false), readyTimeout)),
  ])
  const seedAtReady = announced

  if (ready) await new Promise((r) => setTimeout(r, killAfter))
  const killedWhileRunning = child.exitCode === null
  child.kill('SIGKILL')
  const exit = await exited

  const verdict = await verify(kind, dir, announced)
  return {
    kind,
    reachedSteadyState: !!ready,
    seedAtReady,
    announcedBeforeKill: announced,
    writesAfterReady: announced - seedAtReady,
    killedWhileRunning,
    exitCode: exit.code,
    signal: exit.sig,
    stderr: stderr.slice(0, 400),
    ...verdict,
  }
}

/**
 * One kill is an anecdote. Whether a crash lands inside a write is a race, so
 * the test is repeated and reported as a rate: in how many trials did the store
 * come back readable, and how many records did it keep.
 */
export async function crashTrials(kind, dir, opts, trials = 5) {
  const runs = []
  for (let i = 0; i < trials; i++) {
    runs.push(await crashTest(kind, `${dir}/t${i}`, opts))
  }
  const caught = runs.filter((r) => r.killedWhileRunning)
  return {
    kind,
    trials,
    reachedSteadyState: runs.filter((r) => r.reachedSteadyState).length,
    seedRecords: runs[0]?.seedAtReady ?? 0,
    caughtMidWrite: caught.length,
    reopenedOk: runs.filter((r) => r.reopened).length,
    unreadable: runs.filter((r) => !r.reopened).length,
    corruptTrials: runs.filter((r) => r.corruptRecords > 0).length,
    meanDurable: Math.round(runs.reduce((s, r) => s + r.durable, 0) / runs.length),
    meanAnnounced: Math.round(runs.reduce((s, r) => s + r.announcedBeforeKill, 0) / runs.length),
    integrity: runs.find((r) => r.integrity)?.integrity ?? null,
    note: runs[runs.length - 1].note,
    runs: runs.map((r) => ({
      announced: r.announcedBeforeKill,
      durable: r.durable,
      reopened: r.reopened,
      corrupt: r.corruptRecords,
      bytes: r.bytes ?? null,
    })),
  }
}

async function verify(kind, dir, announced) {
  if (kind === 'file-append') {
    const file = path.join(dir, 'memory.jsonl')
    if (!fs.existsSync(file)) {
      return { reopened: false, durable: 0, corruptRecords: 0, note: 'file absent' }
    }
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.length)
    let ok = 0, bad = 0
    for (const l of lines) {
      try { JSON.parse(l); ok++ } catch { bad++ }
    }
    return {
      reopened: true,
      durable: ok,
      corruptRecords: bad,
      // A torn line is the failure mode that matters: the store still opens, the
      // reader still runs, and one memory is silently gone or malformed.
      note: bad
        ? `${bad} unparseable record(s) survived in the file`
        : 'append-only survived: every line still parses',
    }
  }

  if (kind === 'file-rewrite') {
    const file = path.join(dir, 'memory.json')
    if (!fs.existsSync(file)) {
      return { reopened: false, durable: 0, corruptRecords: 0, note: 'file absent' }
    }
    const text = fs.readFileSync(file, 'utf8')
    try {
      const arr = JSON.parse(text)
      return {
        reopened: true,
        durable: arr.length,
        corruptRecords: 0,
        bytes: text.length,
        note: 'the kill happened between rewrites, so this document parsed',
      }
    } catch (e) {
      // The whole store is one value. A partial write does not lose the last
      // record — it loses every record.
      return {
        reopened: false,
        durable: 0,
        corruptRecords: announced,
        bytes: text.length,
        note: `document truncated mid-write and no longer parses (${e.message.slice(0, 60)}); all ${announced} records unreadable`,
      }
    }
  }

  if (kind === 'sqlite') {
    try {
      const db = new DatabaseSync(path.join(dir, 'memory.db'))
      const n = db.prepare('SELECT COUNT(*) AS n FROM m').get().n
      const integrity = db.prepare('PRAGMA integrity_check').get()
      db.close()
      return {
        reopened: true,
        durable: Number(n),
        corruptRecords: 0,
        integrity: Object.values(integrity)[0],
        note: `recovered to a committed boundary; integrity_check = ${Object.values(integrity)[0]}`,
      }
    } catch (e) {
      return { reopened: false, durable: 0, corruptRecords: 0, note: `reopen failed: ${e.message}` }
    }
  }

  // postgres
  try {
    const { PGlite } = await import('@electric-sql/pglite')
    const db = await PGlite.create({ dataDir: dir })
    const r = await db.query('SELECT COUNT(*)::int AS n FROM m')
    await db.close()
    return {
      reopened: true,
      durable: r.rows[0].n,
      corruptRecords: 0,
      note: 'WAL replayed on open; only committed transactions present',
    }
  } catch (e) {
    return { reopened: false, durable: 0, corruptRecords: 0, note: `reopen failed: ${e.message}` }
  }
}

/* ------------------------------------------------------- lost updates */

/**
 * The classic lost-update race, run identically against all three families.
 *
 * Two writers interleave on the same record. The file store does what a file
 * store must: read the whole thing, change one field, write the whole thing
 * back. Whichever writer writes last erases the other's change. The relational
 * stores express the same edit as a single UPDATE inside a transaction, so both
 * changes survive.
 *
 * This runs in-process for every arm on purpose. Running the file store across
 * processes and Postgres in one would confound the concurrency-control property
 * with the deployment model, and the deployment model is not what is being
 * tested here.
 */
export async function lostUpdateTest({ writers = 8, rounds = 25, dir }) {
  const results = {}

  /* --- file: read-modify-write over the whole document ------------------ */
  {
    const file = path.join(dir, 'lu.json')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ id: 'M-1', hits: 0 }))
    const bump = async () => {
      const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
      // The interleaving point. Any await here — and a real agent does one, it
      // calls a model — is where the other writer's read lands.
      await new Promise((r) => setImmediate(r))
      doc.hits += 1
      fs.writeFileSync(file, JSON.stringify(doc))
    }
    const tasks = []
    for (let w = 0; w < writers; w++) {
      tasks.push((async () => { for (let i = 0; i < rounds; i++) await bump() })())
    }
    await Promise.all(tasks)
    const final = JSON.parse(fs.readFileSync(file, 'utf8')).hits
    results.file = {
      expected: writers * rounds,
      observed: final,
      lost: writers * rounds - final,
      mechanism: 'read-modify-write of the whole document; last write wins',
    }
  }

  /* --- sqlite: one UPDATE inside a transaction -------------------------- */
  {
    const f = path.join(dir, 'lu.db')
    fs.rmSync(f, { force: true })
    fs.rmSync(f + '-wal', { force: true })
    fs.rmSync(f + '-shm', { force: true })
    const db = new DatabaseSync(f)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('CREATE TABLE m(id TEXT PRIMARY KEY, hits INTEGER NOT NULL)')
    db.prepare('INSERT INTO m VALUES (?,?)').run('M-1', 0)
    const stmt = db.prepare('UPDATE m SET hits = hits + 1 WHERE id = ?')
    const bump = async () => {
      await new Promise((r) => setImmediate(r))
      stmt.run('M-1')
    }
    const tasks = []
    for (let w = 0; w < writers; w++) {
      tasks.push((async () => { for (let i = 0; i < rounds; i++) await bump() })())
    }
    await Promise.all(tasks)
    const final = db.prepare('SELECT hits FROM m').get().hits
    db.close()
    results.sqlite = {
      expected: writers * rounds,
      observed: Number(final),
      lost: writers * rounds - Number(final),
      mechanism: 'UPDATE ... SET hits = hits + 1, serialised by the engine',
    }
  }

  /* --- postgres: same statement, MVCC row lock -------------------------- */
  {
    const { PGlite } = await import('@electric-sql/pglite')
    const d = path.join(dir, 'lu-pg')
    fs.rmSync(d, { recursive: true, force: true })
    const db = await PGlite.create({ dataDir: d })
    await db.exec('CREATE TABLE m(id TEXT PRIMARY KEY, hits INTEGER NOT NULL)')
    await db.query('INSERT INTO m VALUES ($1,$2)', ['M-1', 0])
    const tasks = []
    for (let w = 0; w < writers; w++) {
      tasks.push((async () => {
        for (let i = 0; i < rounds; i++) {
          await db.query('UPDATE m SET hits = hits + 1 WHERE id = $1', ['M-1'])
        }
      })())
    }
    await Promise.all(tasks)
    const r = await db.query('SELECT hits FROM m')
    await db.close()
    results.postgres = {
      expected: writers * rounds,
      observed: r.rows[0].hits,
      lost: writers * rounds - r.rows[0].hits,
      mechanism: 'UPDATE under MVCC; the row lock orders the two writers',
    }
  }

  return { writers, rounds, results }
}

/* ------------------------------------------------- normalisation anomaly */

/**
 * What it costs to change your mind.
 *
 * A fact restated across N memories is N places the old value still lives. When
 * the fact changes, a normalised schema updates one row in FACT. A denormalised
 * store must find and rewrite all N — and an agent only rewrites what it
 * retrieved, which is at most k.
 *
 * Everything the agent failed to rewrite is still in the store, still matches
 * the query, and will be retrieved later as a confident assertion of something
 * that is no longer true. That is the update anomaly from the normalisation
 * chapter, arriving as a contradiction in a context window.
 */
export async function anomalyTest(corpus, engine, queries, k = 10) {
  const byFact = new Map()
  for (const m of corpus.memories) {
    if (!m.factId) continue
    if (!byFact.has(m.factId)) byFact.set(m.factId, [])
    byFact.get(m.factId).push(m.id)
  }

  const revisable = [...byFact.entries()].filter(([, ids]) => ids.length >= 2)
  const counts = revisable.map(([, ids]) => ids.length).sort((a, b) => a - b)
  const at = (p) => counts[Math.min(counts.length - 1, Math.floor((p / 100) * counts.length))]

  // For each revisable fact, ask the engine for it and see how much of the
  // restatement set a top-k repair would actually reach.
  const sampleQs = queries.filter((q) => q.targetFactId && byFact.get(q.targetFactId)?.length >= 2)
  let reachedSum = 0, totalSum = 0, n = 0
  const perFact = []
  for (const q of sampleQs.slice(0, 120)) {
    const all = new Set(byFact.get(q.targetFactId))
    const res = await engine.recall({ ...q, k })
    const reached = res.ids.filter((id) => all.has(id)).length
    reachedSum += reached
    totalSum += all.size
    n++
    if (perFact.length < 12) {
      perFact.push({ factId: q.targetFactId, restatements: all.size, reachedByTopK: reached, stale: all.size - reached })
    }
  }

  return {
    factsWithRestatements: revisable.length,
    restatementsPerFact: {
      mean: Number((counts.reduce((s, c) => s + c, 0) / counts.length).toFixed(2)),
      median: at(50),
      p90: at(90),
      max: counts[counts.length - 1],
    },
    rowsToUpdate: {
      normalised: 1,
      denormalisedMean: Number((counts.reduce((s, c) => s + c, 0) / counts.length).toFixed(2)),
      denormalisedMax: counts[counts.length - 1],
    },
    topKRepair: {
      k,
      factsProbed: n,
      meanReached: Number((reachedSum / n).toFixed(2)),
      meanTotal: Number((totalSum / n).toFixed(2)),
      staleFraction: Number((1 - reachedSum / totalSum).toFixed(4)),
    },
    examples: perFact,
  }
}
