/**
 * The victim.
 *
 * Writes memory records as fast as it can and reports progress on stdout so the
 * parent knows roughly how far it got. It installs no signal handlers and makes
 * no attempt to shut down cleanly, because the point is to be killed in the
 * middle of a write and see what the store does about it.
 *
 * Run by tools/exp/integrity.mjs — not useful on its own.
 */

import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const [, , kind, dir, totalArg, seedArg] = process.argv
const total = Number(totalArg ?? 4000)
const seed = Number(seedArg ?? 0)

/**
 * Announced once the store exists and holds its first durable state. The parent
 * starts its kill timer from here, so the measurement is "crashed while
 * writing" and not "crashed while creating a database cluster" — which would be
 * a different and much less interesting claim.
 */
const ready = () => process.stdout.write('ready\n')

// Bodies are padded so a single record spans more than one filesystem write,
// which is what makes a torn record possible at all.
const body = (i) => `M-${i} ` + 'agent memory record about deploy keys and pool sizing '.repeat(6)

if (kind === 'file-append') {
  // The careful file pattern: append one record at a time, never rewrite.
  const file = path.join(dir, 'memory.jsonl')
  fs.writeFileSync(file, '')
  const fd = fs.openSync(file, 'a')
  for (let i = 0; i < seed; i++) {
    fs.writeSync(fd, JSON.stringify({ id: `M-${i}`, seq: i, body: body(i) }) + '\n')
  }
  process.stdout.write(`wrote ${seed}\n`)
  ready()
  for (let i = seed; i < total; i++) {
    fs.writeSync(fd, JSON.stringify({ id: `M-${i}`, seq: i, body: body(i) }) + '\n')
    if (i % 200 === 0) process.stdout.write(`wrote ${i}\n`)
  }
  process.stdout.write(`wrote ${total}\n`)
} else if (kind === 'file-rewrite') {
  // The common file pattern: hold the whole memory as one JSON document and
  // write all of it back on every change. There is no commit boundary — for the
  // duration of the write the file is neither the old state nor the new one.
  //
  // The store is seeded to a realistic size first. An agent with a year of
  // memory is rewriting megabytes on every single addition, and the width of
  // that window is exactly what decides whether a crash destroys everything.
  const file = path.join(dir, 'memory.json')
  const all = []
  for (let i = 0; i < seed; i++) all.push({ id: `M-${i}`, seq: i, body: body(i) })
  fs.writeFileSync(file, JSON.stringify(all))
  process.stdout.write(`wrote ${seed}\n`)
  ready()
  for (let i = seed; i < total; i++) {
    all.push({ id: `M-${i}`, seq: i, body: body(i) })
    fs.writeFileSync(file, JSON.stringify(all))
    if (i % 5 === 0) process.stdout.write(`wrote ${i}\n`)
  }
  process.stdout.write(`wrote ${total}\n`)
} else if (kind === 'sqlite') {
  const db = new DatabaseSync(path.join(dir, 'memory.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = FULL')
  db.exec('CREATE TABLE m(id TEXT PRIMARY KEY, seq INTEGER, body TEXT)')
  const ins = db.prepare('INSERT INTO m VALUES (?,?,?)')
  if (seed > 0) {
    db.exec('BEGIN')
    for (let j = 0; j < seed; j++) ins.run(`M-${j}`, j, body(j))
    db.exec('COMMIT')
  }
  process.stdout.write(`wrote ${seed}\n`)
  ready()
  // Batched transactions: each commit is a durability boundary, which is the
  // thing being tested. A crash between commits must leave the last commit
  // intact and everything after it gone.
  for (let i = seed; i < total; i += 50) {
    db.exec('BEGIN')
    for (let j = i; j < Math.min(i + 50, total); j++) ins.run(`M-${j}`, j, body(j))
    db.exec('COMMIT')
    process.stdout.write(`wrote ${Math.min(i + 50, total)}\n`)
  }
} else {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = await PGlite.create({ dataDir: dir })
  await db.exec('CREATE TABLE m(id TEXT PRIMARY KEY, seq INTEGER, body TEXT)')
  if (seed > 0) {
    await db.exec('BEGIN')
    for (let j = 0; j < seed; j++) {
      await db.query('INSERT INTO m VALUES ($1,$2,$3)', [`M-${j}`, j, body(j)])
    }
    await db.exec('COMMIT')
  }
  await db.query('CHECKPOINT')
  process.stdout.write(`wrote ${seed}\n`)
  ready()
  for (let i = seed; i < total; i += 50) {
    await db.exec('BEGIN')
    for (let j = i; j < Math.min(i + 50, total); j++) {
      await db.query('INSERT INTO m VALUES ($1,$2,$3)', [`M-${j}`, j, body(j)])
    }
    await db.exec('COMMIT')
    process.stdout.write(`wrote ${Math.min(i + 50, total)}\n`)
  }
}
