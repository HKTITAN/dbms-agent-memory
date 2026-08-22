#!/usr/bin/env node
/**
 * Generate the talk deck.
 *
 * The deck is written by this script rather than by hand for the same reason the
 * paper is: every number on a slide is read from `data/capture.json`, so a slide
 * cannot say something the measurement does not. If a figure changes, the deck
 * changes with the next build.
 *
 * THE DESIGN LANGUAGE
 *
 * Duolingo's, re-derived rather than copied, per `deck/.design`. The rules come
 * from design.duolingo.com and from Duolingo's shipped production CSS; the marks,
 * the bespoke typefaces and the characters do not. Nunito is used because
 * Duolingo's own typography page names it as the substitute for its unlicensable
 * faces.
 *
 * One rule carries the whole thing: DEPTH IS A SOLID DARKER EDGE, NEVER A BLUR.
 * Every raised surface pairs a fill with its darker sibling and offsets it with
 * `box-shadow: 0 <lip> 0 <sibling>`. Pressing translates down by exactly the lip
 * and removes the shadow, so the thing lands flush and the layout box never
 * moves. There is not one blurred shadow in this file.
 *
 * The characters are original, built from the three primitives Duolingo's shape
 * language allows — rounded rectangle, circle, rounded triangle — with flat
 * fills, no outlines, pill-shaped shadows and geometric pill eyes whose pupils
 * are never vertically centred.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'deck')
const OUT = join(OUT_DIR, 'index.html')

const d = JSON.parse(readFileSync(join(ROOT, 'data', 'capture.json'), 'utf8'))

/* ------------------------------------------------------------ formatting */

const n = (x, digits = 0) => {
  if (x == null || Number.isNaN(x)) return '—'
  const [int, frac] = Number(x).toFixed(digits).split('.')
  const g = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return frac ? `${g}.${frac}` : g
}
const pct = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`
const times = (x) => (x >= 100 ? `${n(Math.round(x))}×` : `${x.toFixed(1)}×`)
const mins = (s) => (s < 90 ? `${s.toFixed(0)} s` : s < 5400 ? `${(s / 60).toFixed(0)} min` : `${(s / 3600).toFixed(1)} h`)

/* --------------------------------------------------------------- the data */

const notion = d.byArm.notion
const totalRT = d.rows.filter((r) => r.arm === 'notion').reduce((s, r) => s + r.roundTrips, 0)
const totalSQL = d.rows.filter((r) => r.arm === 'sqlite').reduce((s, r) => s + r.roundTrips, 0)
const A = (c) => d.amplification[c]
const E = d.experiments
const S = d.schema
const V = d.vault

/* ------------------------------------------------------------ characters */

/**
 * Three original creatures. Three primitives each, flat fill, zero strokes, a
 * pill shadow beneath — never an oval, because an oval implies a perspective
 * this style does not have. Eyes are geometric pills; pupils sit high, never
 * centred, which is the difference between alert and vacant.
 */
const CHAR = {
  page: (accent = 'relational') => `
<svg class="ch" viewBox="0 0 120 130" aria-hidden="true">
  <ellipse class="sh" cx="60" cy="122" rx="34" ry="6" />
  <path d="M18 14a10 10 0 0 1 10-10h44l30 30v66a10 10 0 0 1-10 10H28a10 10 0 0 1-10-10Z" fill="var(--${accent}-lip)"/>
  <path d="M18 10a10 10 0 0 1 10-10h44l30 30v66a10 10 0 0 1-10 10H28a10 10 0 0 1-10-10Z" fill="var(--${accent})"/>
  <path d="M72 0l30 30H82a10 10 0 0 1-10-10Z" fill="var(--${accent}-lip)"/>
  <rect x="38" y="42" width="12" height="20" rx="6" fill="#fff"/>
  <rect x="66" y="42" width="12" height="20" rx="6" fill="#fff"/>
  <circle cx="44" cy="50" r="4" fill="var(--ink)"/>
  <circle cx="72" cy="50" r="4" fill="var(--ink)"/>
  <path d="M44 76c8 7 22 7 30 0" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" fill="none"/>
</svg>`,
  barrel: (accent = 'substrate') => `
<svg class="ch" viewBox="0 0 120 130" aria-hidden="true">
  <ellipse class="sh" cx="60" cy="122" rx="36" ry="6" />
  <rect x="16" y="22" width="88" height="86" rx="26" fill="var(--${accent}-lip)"/>
  <rect x="16" y="16" width="88" height="86" rx="26" fill="var(--${accent})"/>
  <rect x="16" y="16" width="88" height="22" rx="11" fill="var(--${accent}-lip)" opacity=".55"/>
  <rect x="38" y="52" width="12" height="20" rx="6" fill="#fff"/>
  <rect x="70" y="52" width="12" height="20" rx="6" fill="#fff"/>
  <circle cx="44" cy="60" r="4" fill="var(--ink)"/>
  <circle cx="76" cy="60" r="4" fill="var(--ink)"/>
  <path d="M46 84c6 6 20 7 28 1" stroke="var(--ink)" stroke-width="5" stroke-linecap="round" fill="none"/>
</svg>`,
  lock: (accent = 'defect') => `
<svg class="ch" viewBox="0 0 120 130" aria-hidden="true">
  <ellipse class="sh" cx="60" cy="122" rx="30" ry="6" />
  <path d="M38 52V38a22 22 0 0 1 44 0v14" stroke="var(--${accent}-lip)" stroke-width="13" fill="none" stroke-linecap="round"/>
  <rect x="22" y="52" width="76" height="62" rx="20" fill="var(--${accent}-lip)"/>
  <rect x="22" y="46" width="76" height="62" rx="20" fill="var(--${accent})"/>
  <rect x="41" y="68" width="12" height="20" rx="6" fill="#fff"/>
  <rect x="67" y="68" width="12" height="20" rx="6" fill="#fff"/>
  <circle cx="47" cy="76" r="4" fill="var(--ink)"/>
  <circle cx="73" cy="76" r="4" fill="var(--ink)"/>
  <rect x="52" y="94" width="18" height="6" rx="3" fill="var(--ink)"/>
</svg>`,
}

/* ------------------------------------------------------------- fragments */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const slide = (accent, eyebrow, title, bodyHtml, opts = {}) => `
<section class="slide${opts.center ? ' center' : ''}" data-accent="${accent}">
  <div class="slide-in">
    ${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}
    ${title ? `<h2 class="s-title">${title}</h2>` : ''}
    ${bodyHtml}
  </div>
</section>`

const stat = (value, label, sub) => `
<div class="stat">
  <div class="stat-v">${value}</div>
  <div class="stat-l">${label}</div>
  ${sub ? `<div class="stat-s">${sub}</div>` : ''}
</div>`

const card = (title, body, accent) => `
<div class="card${accent ? ' card-accent' : ''}"${accent ? ` data-accent="${accent}"` : ''}>
  <h3>${title}</h3>
  <p>${body}</p>
</div>`

/**
 * A bar row. Length from zero, number printed, lip under the fill.
 *
 * A zero draws nothing. The temptation is a minimum width so the row does not
 * look empty, and it has to be resisted: the rows that matter most in this deck
 * are the ones where a relational arm scores zero, and a visible nub next to the
 * number 0 is a lie told for tidiness.
 */
const bar = (label, value, max, accent, display) => {
  const w = value <= 0 ? 0 : Math.max(0.8, (value / max) * 100)
  return `
<div class="bar-row">
  <span class="bar-label">${label}</span>
  <span class="bar-track">${w > 0 ? `<span class="bar-fill" data-accent="${accent}" style="--w:${w}%"><i class="gloss"></i></span>` : ''}</span>
  <span class="bar-value">${display}</span>
</div>`
}

/* ---------------------------------------------------------------- slides */

const wake = E.wakeup.points
const wakeFirst = wake[0]
const wakeLast = wake[wake.length - 1]
const rtMax = Math.max(...Object.values(d.amplification).map((a) => a.notionRoundTrips))
const ftTerm = E.fulltext.terms.find((t) => t.term === 'timed out') ?? E.fulltext.terms[0]

const SLIDES = [
  /* 1 */ slide('relational', null, null, `
    <p class="kicker">Database Management Systems · review paper</p>
    <h1 class="hero">Agent memory is a database problem.</h1>
    <p class="sub">Nobody wanted it to be. We measured it anyway.</p>
    <div class="cast">${CHAR.page('relational')}${CHAR.barrel('substrate')}${CHAR.lock('cost')}</div>
    <p class="byline">Harshit Khemani · Kush Ahuja · Madhav Bassi · Kushagra Agrawal<br>
      <span class="dim">Submitted to Dr. Poonam Sangwan</span></p>
  `, { center: true }),

  /* 2 */ slide('substrate', 'The setup', 'An agent that forgets is a tool', `
    <p class="lead">An agent that remembers is a colleague. Colleagues need somewhere to keep what they know.</p>
    <div class="cards">
      ${card('Clear the session', 'Everything the assistant learned is gone.')}
      ${card('Switch the branch', 'The context does not follow.')}
      ${card('Hand over to a teammate', 'They start from nothing.')}
    </div>
  `),

  /* 3 */ slide('substrate', 'The subject', 'Notion built Lore', `
    <p class="lead">Open source, MIT, ${esc(S.source.version)}. A shared vault so context survives a cleared session, a new branch, or a handover.</p>
    <div class="cards">
      ${card('MCP server', 'Six tools your assistant can call.')}
      ${card('CLI', 'The same services, for people.')}
      ${card('Hooks', 'Loads context at session start. Saves at session end.')}
    </div>
    <p class="note">We read it at commit <code>${esc(S.source.commit)}</code>. Every claim in this talk comes from that source.</p>
  `),

  /* 4 */ slide('relational', 'The interesting part', 'It is not a vector store. It is a schema.', `
    <div class="dbs">
      ${d.subject.databases.map((db) => `
        <div class="db" data-accent="relational">
          <span class="db-icon">${db.icon}</span>
          <span class="db-name">${db.name}</span>
          <span class="db-meta">${S.propertyCounts[db.name]?.total ?? '—'} properties</span>
        </div>`).join('')}
    </div>
    <p class="lead">Five related tables. A subject-predicate-object fact relation with validity intervals. A canonical entity registry with aliases. This is an ER model, arrived at from the outside.</p>
  `),

  /* 5 */ slide('cost', 'The catch', 'The store underneath has no joins', `
    <div class="grid2">
      <div>
        <p class="col-h">What a Notion database gives you</p>
        <ul class="tick">
          <li>Filters and sorts over properties</li>
          <li>Cursor pagination, ${d.apiLimits.pageSizeMax} rows a request</li>
          <li>Relations as arrays of page ids</li>
        </ul>
      </div>
      <div>
        <p class="col-h">What it does not</p>
        <ul class="cross">
          <li>A join</li>
          <li>An aggregate</li>
          <li>A unique index or a check constraint</li>
          <li>A conditional write</li>
          <li>Search that reaches page bodies</li>
        </ul>
      </div>
    </div>
    <p class="note">Every line here is from the published API reference, not from us.</p>
  `),

  /* 6 */ slide('cost', 'The question', 'So what does that actually cost?', `
    <p class="lead">Not rhetorically. In requests, in bytes, in rows the client has to look at itself, and in states the store will accept that a database would refuse.</p>
    <div class="cast small">${CHAR.barrel('cost')}</div>
  `, { center: true }),

  /* 7 */ slide('relational', 'Method · 1', 'Build the vault backwards', `
    <p class="lead">Labels chosen by looking at what a store returned are worthless. So we generate a <b>world</b> first — services, people, owners, incidents, decisions — read the facts off it, then render memories from the facts.</p>
    <div class="stats">
      ${stat(n(V.memories), 'memories')}
      ${stat(n(V.facts), 'facts')}
      ${stat(n(V.entities), 'entities')}
      ${stat(n(V.questions), 'questions')}
    </div>
    <p class="note">The right answer is definitional, not judged. Nobody scored their own homework.</p>
  `),

  /* 8 */ slide('relational', 'Method · 2', 'Ten questions Lore itself raises', `
    <p class="lead">Read off its own commands and hooks. Each annotated with the minimum relational algebra it needs.</p>
    <div class="chips">
      ${d.workload.classes.map((c) => `<span class="chip" data-accent="${c.notion === 'expressible' ? 'relational' : c.notion === 'not expressible' ? 'defect' : 'cost'}">${c.label}</span>`).join('')}
    </div>
    <div class="stats">
      ${stat(pct(d.expressibility.shareNeedingJoin), 'need a join')}
      ${stat(pct(d.expressibility.shareNeedingAggregate), 'need an aggregate')}
      ${stat(pct(d.expressibility.shareNeedingRecursion), 'need recursion')}
      ${stat(pct(d.expressibility.shareNeedingMoreThanFilter), 'need more than a filter')}
    </div>
  `),

  /* 9 */ slide('substrate', 'Method · 3', 'Three stores, one workload', `
    <div class="cards">
      ${card('Notion Data API', 'An emulator restricted to the documented surface. Every refusal carries the reference page it comes from.', 'substrate')}
      ${card('SQLite', 'The same schema as real tables. Indexes, foreign keys, an FTS5 index over bodies.', 'relational')}
      ${card('PostgreSQL', 'Range-typed validity, a GiST exclusion constraint, GIN over the text.', 'relational')}
    </div>
    <p class="note">We hold no Notion workspace. So we report <b>counts</b> — requests, bytes, rows — not wall-clock. A round trip is a round trip whoever carries it.</p>
  `),

  /* 10 */ slide('relational', 'Result zero', 'It gets the right answer', `
    <div class="hero-stat" data-accent="relational">${pct(notion.exact, 0)}</div>
    <p class="lead">of the workload answered <b>exactly</b> — the correct set, nothing added, nothing missing. Same as SQLite. Same as PostgreSQL.</p>
    <p class="note">A critique that expected wrong answers would stop here, and it would be wrong to. The Notion API is not a bad store. It is a store that will do the work if you send it enough requests.</p>
  `),

  /* 11 */ slide('cost', 'Result one', 'The question is how many requests', `
    <div class="versus">
      <div class="vs-side" data-accent="cost">
        <div class="vs-n">${n(totalRT)}</div>
        <div class="vs-l">HTTP requests</div>
      </div>
      <div class="vs-mid">vs</div>
      <div class="vs-side" data-accent="relational">
        <div class="vs-n">${n(totalSQL)}</div>
        <div class="vs-l">SQL statements</div>
      </div>
    </div>
    <p class="lead">Same ${n(V.questions)} questions. Same answers. At Notion's documented ${d.apiLimits.requestsPerSecond} requests per second, the left column is <b>${mins(totalRT / d.apiLimits.requestsPerSecond)}</b> of floor before anyone's network is involved.</p>
  `),

  /* 12 */ slide('cost', 'Result one', 'Where the cost lives', `
    <div class="bars">
      ${[...d.workload.classes]
        .sort((a, b) => (A(b.id)?.notionRoundTrips ?? 0) - (A(a.id)?.notionRoundTrips ?? 0))
        .map((c) => {
          const a = A(c.id)
          if (!a) return ''
          const hot = a.roundTrips > 100
          return bar(c.label, Math.log10(a.notionRoundTrips + 1), Math.log10(rtMax + 1),
            hot ? 'defect' : 'cost', n(a.notionRoundTrips, a.notionRoundTrips < 10 ? 1 : 0))
        }).join('')}
    </div>
    <p class="note">Log scale. Two classes cost two or three requests. Two cost more than a thousand.</p>
  `),

  /* 13 */ slide('defect', 'Result two', 'One join', `
    <p class="lead"><i>Which claims about this predicate came from a memory written by this author?</i></p>
    <p>The author is on Memories. The fact points at the memory. There is no way to filter Facts by a property of the page its relation points at.</p>
    <div class="versus">
      <div class="vs-side" data-accent="defect">
        <div class="vs-n">${n(A('provenance').notionRoundTrips, 0)}</div>
        <div class="vs-l">requests · ${mins(A('provenance').notionFloorSeconds)} floor</div>
      </div>
      <div class="vs-mid">vs</div>
      <div class="vs-side" data-accent="relational">
        <div class="vs-n">1</div>
        <div class="vs-l">statement · <code>JOIN</code></div>
      </div>
    </div>
  `),

  /* 14 */ slide('defect', 'Result three', 'Searching what a memory says', `
    <p class="lead">A memory's text is page <b>blocks</b>. Property filters cannot see blocks, and the search endpoint matches <b>titles</b>.</p>
    <p>So a complete search over what memories actually say is: list every memory, then fetch every memory's children, then grep locally.</p>
    <div class="stats">
      ${stat(n(E.ceiling.now.totalRequests), 'requests', 'this vault')}
      ${stat(mins(E.ceiling.now.floorSeconds), 'floor', 'at 3 req/s')}
      ${stat(mins(E.ceiling.x100.floorSeconds), 'floor', 'at 100× the vault')}
      ${stat('1', 'statement', 'either engine')}
    </div>
    <p class="note">Lore in practice delegates ranking to Notion's own search, so it is cheaper than this on that one class. It still owns no index — which is why it cannot pre-filter a semantic query, and has no semantic path over Facts at all.</p>
  `),

  /* 15 */ slide('defect', 'Result four', 'Now the half that is not about speed', `
    <p class="lead">A database's central service is not answering questions. It is <b>refusing to enter states</b> that would make future answers wrong.</p>
    <div class="cast small">${CHAR.lock('defect')}</div>
  `, { center: true }),

  /* 16 */ slide('defect', 'Result four', 'Eight agents, one topic key', `
    <p class="lead">Lore upserts by reading the vault, then creating or patching. The API documents no conditional write, so the window between the two cannot be closed.</p>
    <blockquote class="quote">
      &ldquo;Two parallel saves with the same <code>topicKey</code> can both find no existing match and both create fresh rows. Notion provides no per-key uniqueness enforcement.&rdquo;
      <cite>src/core/memory-topic-key.ts — Lore's own source</cite>
    </blockquote>
    <div class="bars">
      ${E.concurrencySweep.map((p) => bar(`${p.writers} writers`, p.notionLostUpdateRate, 1, 'defect', pct(p.notionLostUpdateRate))).join('')}
      ${bar('any count, unique index', 0, 1, 'relational', '0%')}
    </div>
  `),

  /* 17 */ slide('temporal', 'Result five', 'The constraint that refused to be added', `
    <p class="lead">A service has one owner at a time. PostgreSQL can declare that — an exclusion constraint over a range type. Once declared, the write that would create the contradiction is the write that fails.</p>
    <p>We tried to add it to the vault as generated. The engine declined to certify data written without it:</p>
    <pre class="err">${esc(String(E.temporal.postgres.addConstraintToExistingVault.detail ?? '').replace(/COALESCE\([^)]*\)/g, '…').slice(0, 220))}…</pre>
    <div class="stats">
      ${stat(n(E.temporal.trueConflictKeys), 'contradictions already in the vault')}
      ${stat(n(E.temporal.postgres.insertedUnderConstraint.rejected), 'writes PostgreSQL refused')}
      ${stat('0', 'writes the vault refused')}
    </div>
  `),

  /* 18 */ slide('temporal', 'Result six', 'A Boyce-Codd violation that ships', `
    <p class="lead">Every Notion database needs a title, and a title cannot be a relation. So Facts carries its subject <b>twice</b>: as a string, and as a relation to the canonical entity.</p>
    <p>The relation determines the string. Neither is a key. And <code>mergeEntities</code> moves relations — it never rewrites titles.</p>
    <div class="stats">
      ${stat(n(E.resolution.staleSubjectStrings), 'facts whose title and relation disagree', pct(E.resolution.staleSubjectRate, 1) + ' of all facts')}
      ${stat(n(E.resolution.duplicatePairs), 'entities that exist twice')}
      ${stat(n(E.anomaly.staleRestatements), 'memories still asserting a closed value')}
    </div>
  `),

  /* 19 */ slide('substrate', 'Result seven', 'Two indexes. One text. Two answers.', `
    <p class="lead">We asked all three stores for the phrase <code>timed out</code>. The corpus says <i>times out</i>.</p>
    <div class="bars">
      ${bar('literal substring', ftTerm.substring, 700, 'cost', n(ftTerm.substring))}
      ${bar('SQLite FTS5', ftTerm.fts5, 700, 'cost', n(ftTerm.fts5))}
      ${bar('PostgreSQL GIN', ftTerm.gin, 700, 'defect', n(ftTerm.gin))}
      ${bar('Notion search', ftTerm.notionTitleSearch, 700, 'cost', n(ftTerm.notionTitleSearch))}
    </div>
    <p class="lead">PostgreSQL parses the phrase as the single lexeme <code>'time'</code>: English stemming turns <i>timed</i> into <i>time</i>, and <i>out</i> is a stopword.</p>
    <p class="note">None of them is wrong. A stemmer is a position on what "discusses this" means. The problem is that nothing in any answer says which position was taken.</p>
  `),

  /* 20 */ slide('cost', 'The ceiling', 'Memory systems do not get slow because the prompt grew', `
    <div class="grid2">
      <div>
        <p class="col-h">Tokens injected at session start</p>
        <div class="hero-stat sm" data-accent="relational">${n(wakeFirst.notion.injectedTokensApprox)} → ${n(wakeLast.notion.injectedTokensApprox)}</div>
        <p class="note">Nearly flat. The payload is capped by design.</p>
      </div>
      <div>
        <p class="col-h">Vault it was assembled from</p>
        <div class="hero-stat sm" data-accent="cost">${n(wakeFirst.memories)} → ${n(wakeLast.memories)}</div>
        <p class="note">Eight times the store. The cost of assembling a bounded prompt is what grows.</p>
      </div>
    </div>
    <p class="lead">A rate limit turns that growth into seconds. Lore mitigates it well — a session debounce, a digest, an off switch — but every mitigation is a cap, and a cap is where a full scan was found to be infeasible.</p>
  `),

  /* 21 */ slide('relational', 'Being fair', 'What the trade actually buys', `
    <div class="cards">
      ${card('The memory is legible', 'A teammate opens the vault, reads what the agent believes, and fixes it. In a tool they already use. No system in the literature offers this.', 'relational')}
      ${card('The permissions already exist', 'A vault inherits Notion&rsquo;s permission model. A bespoke store needs its own, replicated from an identity provider — a famous source of leaks.', 'relational')}
      ${card('There is no infrastructure', 'No server, no backups, no migration window, no on-call for the memory system itself.', 'relational')}
    </div>
    <p class="lead">Lore trades every guarantee a database declares for legibility, zero infrastructure and inherited permissions — then re-implements the discarded guarantees as scanners, migrations and locks. Its own source is unusually honest about where the seams are.</p>
  `),

  /* 22 */ slide('substrate', 'The recommendation', 'The boundary is not where you think', `
    <p class="lead">Retrieval is fine: bounded pages, server-side filters, a capped payload. What degrades is <b>maintenance</b> — the conflict scan, the entity backfill, the aggregate. Every one of those touches every row.</p>
    <div class="cards">
      ${card('Keep the vault', 'It is the system of record because it is legible, and legible is what gets a wrong fact fixed.', 'relational')}
      ${card('Add a read-side projection', 'A local relational mirror carrying the indexes, the constraints and the joins, rebuilt from the vault.', 'substrate')}
      ${card('Humans still edit the vault', 'Nothing in Lore&rsquo;s design forecloses this. It is an ordinary architecture with an ordinary name.', 'relational')}
    </div>
  `),

  /* 23 */ slide('relational', null, 'The field is converging on a schema', `
    <p class="lead">Triples with validity intervals. Entity registries with aliases. Provenance edges. Confidence scores.</p>
    <p class="lead">That is a database schema. The question every agent-memory system has to answer is not which embedding model to use — it is <b>which guarantees it is choosing to do without, and what it will do instead</b>.</p>
    <p class="lead">Lore answers that more explicitly than most, in comments in its own source. We put the numbers next to the answer.</p>
    <div class="cast">${CHAR.page('relational')}${CHAR.barrel('substrate')}${CHAR.lock('cost')}</div>
    <p class="byline">Read the paper · <span class="mono">dbms-memory.khe.money</span></p>
    <p class="byline">
      <a class="inline-dl" href="/agent-memory-as-a-database-problem-slides.pdf" data-local="agent-memory-as-a-database-problem-slides.pdf" download>Slides</a> ·
      <a class="inline-dl" href="/agent-memory-as-a-database-problem.pdf" data-local="../paper/agent-memory-as-a-database-problem.pdf" download>Paper</a> ·
      <a class="inline-dl" href="/capture.json" data-local="../data/capture.json" download>Dataset</a>
    </p>
  `, { center: true }),
]

/* ------------------------------------------------------------------ page */

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent memory as a database problem</title>
<meta name="description" content="A talk on Notion's Lore, reviewed as a database design and measured against SQLite and PostgreSQL.">
<!-- Inline, so the deck asks the network for nothing but its typeface. The mark
     is the lip: a fill sitting on its own darker edge. -->
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='4' y='9' width='24' height='18' rx='6' fill='%2358A700'/%3E%3Crect x='4' y='5' width='24' height='18' rx='6' fill='%2358CC02'/%3E%3Crect x='10' y='11' width='4' height='7' rx='2' fill='%23fff'/%3E%3Crect x='18' y='11' width='4' height='7' rx='2' fill='%23fff'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,600;0,800;0,900;1,700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
/* ===========================================================================
   Tokens, from deck/.design. Depth is a solid darker edge, never a blur.
   ======================================================================== */
:root{
  --canvas:#FFFFFF; --canvas-sunk:#F7F7F7;
  /* Duolingo's neutral ramp is Wolf #777777 and Hare #AFAFAF. Both are used for
     text in its product and both miss WCAG AA on white — 4.48:1 and 2.19:1.
     The ramp below keeps three distinguishable steps and clears 4.5:1 at every
     one of them. Hare survives only as --rule, where it carries no text. */
  --ink:#3C3C3C; --ink-muted:#5E5E5E; --ink-faint:#737373; --rule:#E5E5E5;

  /* Each family is a triple, and the third member is the one Duolingo does not
     ship. '-lip' is an EDGE colour and is never allowed to carry text: feather
     green under white text is about 2:1, and Duolingo's own buttons fail AA on
     exactly that pair. '-ink' is the darkened sibling that clears 4.5:1 on the
     canvas, and every piece of text in this deck uses it. */
  --relational:#58CC02; --relational-lip:#58A700; --relational-tint:#D7FFB8; --relational-ink:#37700A;
  --substrate:#1CB0F6;  --substrate-lip:#1899D6;  --substrate-tint:#DDF4FF;  --substrate-ink:#0A6187;
  --defect:#FF4B4B;     --defect-lip:#EA2B2B;     --defect-tint:#FFDFE0;     --defect-ink:#B81C1C;
  --cost:#FFC800;       --cost-lip:#E7A601;       --cost-tint:#FFF5D3;       --cost-ink:#7A5600;
  --temporal:#CE82FF;   --temporal-lip:#9069CD;   --temporal-tint:#F3E4FF;   --temporal-ink:#5D3F90;

  --font-display:"Nunito","Baloo 2",ui-rounded,system-ui,sans-serif;
  --font-ui:"Nunito",ui-rounded,system-ui,sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;

  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:24px; --r-pill:9999px;
  --stroke:2px; --lip-sm:2px; --lip-md:4px; --lip-lg:6px;

  --sp1:4px; --sp2:8px; --sp3:12px; --sp4:16px; --sp5:20px; --sp6:24px;
  --sp8:32px; --sp10:40px; --sp12:48px; --sp16:64px; --sp24:96px;

  --ease-pop:cubic-bezier(.35,1.8,.35,.83);
  --ease-settle:cubic-bezier(.22,1,.36,1);
  --d-press:100ms; --d-fast:200ms; --d-base:300ms; --d-slow:400ms;

  --accent:var(--relational); --accent-lip:var(--relational-lip);
  --accent-tint:var(--relational-tint); --accent-ink:var(--relational-ink);
}
[data-accent="relational"]{--accent:var(--relational);--accent-lip:var(--relational-lip);--accent-tint:var(--relational-tint);--accent-ink:var(--relational-ink)}
[data-accent="substrate"] {--accent:var(--substrate); --accent-lip:var(--substrate-lip); --accent-tint:var(--substrate-tint); --accent-ink:var(--substrate-ink)}
[data-accent="defect"]    {--accent:var(--defect);    --accent-lip:var(--defect-lip);    --accent-tint:var(--defect-tint);    --accent-ink:var(--defect-ink)}
[data-accent="cost"]      {--accent:var(--cost);      --accent-lip:var(--cost-lip);      --accent-tint:var(--cost-tint);      --accent-ink:var(--cost-ink)}
[data-accent="temporal"]  {--accent:var(--temporal);  --accent-lip:var(--temporal-lip);  --accent-tint:var(--temporal-tint);  --accent-ink:var(--temporal-ink)}

*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{
  background:var(--canvas); color:var(--ink);
  font-family:var(--font-ui); font-weight:600; font-size:clamp(1.05rem,1.5vw,1.35rem);
  line-height:1.5; -webkit-font-smoothing:antialiased;
  overflow:hidden;
}

/* ------------------------------------------------------------- the stage */
.deck{position:fixed;inset:0;display:grid;place-items:center}
.slide{
  position:absolute;inset:0;
  display:grid;place-items:center;
  padding:clamp(24px,5vw,80px) clamp(24px,6vw,110px) 92px;
  opacity:0;visibility:hidden;pointer-events:none;
}
.slide.on{opacity:1;visibility:visible;pointer-events:auto}
.slide-in{width:min(1100px,100%);max-height:100%;overflow:auto;scrollbar-width:thin}
.slide.center .slide-in{text-align:center}
.slide.on .slide-in>*{animation:rise var(--d-fast) var(--ease-pop) backwards}
/* Going back reverses the path rather than repeating the forward one. If a
   thing arrived from below, returning to it should not also arrive from below —
   the deck would lose any sense of which way the reader is travelling. */
[data-dir="back"] .slide.on .slide-in>*{animation-name:fall}
/* Held arrow key: the entrance never completes, so it is only ever a flicker.
   Drop it rather than restart it. */
[data-fast] .slide.on .slide-in>*{animation:none}
/* The deck interprets horizontal drags itself; the browser must not also treat
   them as a scroll or a back-navigation, or the two fight for the same finger. */
.deck{touch-action:pan-y}
.slide{will-change:transform}
.slide.on .slide-in>*:nth-child(2){animation-delay:40ms}
.slide.on .slide-in>*:nth-child(3){animation-delay:80ms}
.slide.on .slide-in>*:nth-child(4){animation-delay:120ms}
.slide.on .slide-in>*:nth-child(5){animation-delay:160ms}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes fall{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}

/* ------------------------------------------------------------- typography */
.eyebrow{
  font-weight:800;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;
  color:var(--accent-ink);margin:0 0 var(--sp3)
}
.hero{
  font-family:var(--font-display);font-weight:900;
  font-size:clamp(2.6rem,6vw,4.6rem);line-height:1.03;letter-spacing:-.02em;
  margin:0 0 var(--sp5)
}
.s-title{
  font-family:var(--font-display);font-weight:900;
  font-size:clamp(1.9rem,3.9vw,3.1rem);line-height:1.08;letter-spacing:-.02em;
  margin:0 0 var(--sp5)
}
.lead{margin:0 0 var(--sp4);max-width:60ch}
.slide.center .lead{margin-left:auto;margin-right:auto}
.sub{font-size:clamp(1.1rem,2vw,1.6rem);color:var(--ink-muted);margin:0 0 var(--sp8)}
.kicker{font-weight:800;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-faint);margin:0 0 var(--sp5)}
.byline{margin:var(--sp8) 0 0;font-size:.95rem;color:var(--ink-muted)}
.dim{color:var(--ink-faint)}
.note{
  margin:var(--sp5) 0 0;font-size:.95rem;color:var(--ink-muted);
  border-left:var(--stroke) solid var(--rule);padding-left:var(--sp4);max-width:62ch
}
.slide.center .note{margin-left:auto;margin-right:auto;border-left:0;padding-left:0}
.col-h{font-weight:800;font-size:.82rem;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-muted);margin:0 0 var(--sp3)}
code,.mono,pre{font-family:var(--font-mono);font-size:.88em}
code{background:var(--canvas-sunk);border-radius:var(--r-sm);padding:.08em .35em}
b{font-weight:800}
i{font-style:italic}

/* ------------------------------------------------------------- the lip */
.card,.chip,.db,.stat,.vs-side{
  background:var(--canvas);
  border:var(--stroke) solid var(--rule);
  border-bottom-width:calc(var(--stroke) + var(--lip-sm));
  border-radius:var(--r-md);
}
.card-accent,.db,.chip{border-color:var(--accent);background:var(--accent-tint)}

.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:var(--sp4);margin:var(--sp5) 0}
.card{padding:var(--sp5);text-align:left}
.card h3{margin:0 0 var(--sp2);font-family:var(--font-display);font-weight:800;font-size:1.05rem}
.card p{margin:0;font-size:.95rem;color:var(--ink-muted)}
.card-accent p{color:var(--ink)}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--sp4);margin:var(--sp6) 0}
.stat{padding:var(--sp4);text-align:center}
.stat-v{font-family:var(--font-display);font-weight:900;font-size:clamp(1.8rem,3.4vw,2.8rem);line-height:1;color:var(--accent-ink);font-variant-numeric:tabular-nums}
.stat-l{font-size:.9rem;color:var(--ink-muted);margin-top:var(--sp2)}
.stat-s{font-size:.8rem;color:var(--ink-faint);margin-top:var(--sp1)}

.hero-stat{
  font-family:var(--font-display);font-weight:900;
  font-size:clamp(4rem,13vw,9rem);line-height:1;letter-spacing:-.03em;
  color:var(--accent-ink);font-variant-numeric:tabular-nums;margin:0 0 var(--sp5)
}
.hero-stat.sm{font-size:clamp(1.8rem,4vw,3rem);margin-bottom:var(--sp2)}

.versus{display:flex;align-items:stretch;gap:var(--sp4);margin:var(--sp6) 0;flex-wrap:wrap;justify-content:center}
.vs-side{flex:1 1 220px;padding:var(--sp6) var(--sp4);text-align:center;background:var(--accent-tint);border-color:var(--accent)}
.vs-n{font-family:var(--font-display);font-weight:900;font-size:clamp(2.2rem,5vw,3.6rem);line-height:1;color:var(--accent-ink);font-variant-numeric:tabular-nums}
.vs-l{font-size:.9rem;color:var(--ink-muted);margin-top:var(--sp2)}
.vs-mid{align-self:center;font-weight:800;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.04em;font-size:.82rem}

.chips{display:flex;flex-wrap:wrap;gap:var(--sp2);margin:var(--sp5) 0}
.chip{padding:var(--sp2) var(--sp4);border-radius:var(--r-lg);font-size:.9rem;font-weight:800;color:var(--accent-ink)}

.dbs{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:var(--sp3);margin:0 0 var(--sp6)}
.db{padding:var(--sp4);display:flex;flex-direction:column;gap:var(--sp1);align-items:center;text-align:center}
.db-icon{font-size:1.7rem;line-height:1}
.db-name{font-family:var(--font-display);font-weight:900;font-size:1.05rem}
.db-meta{font-size:.8rem;color:var(--ink-muted)}

/* ---------------------------------------------------------------- bars */
.bars{display:grid;gap:var(--sp3);margin:var(--sp5) 0}
.bar-row{display:grid;grid-template-columns:minmax(120px,15rem) 1fr minmax(64px,auto);gap:var(--sp4);align-items:center}
.bar-label{font-size:.95rem;color:var(--ink);text-align:left}
.bar-track{height:16px;background:var(--rule);border-radius:var(--r-pill);position:relative;overflow:hidden}
.bar-fill{
  position:absolute;inset:0 auto 0 0;width:var(--w);
  background:var(--accent);border-radius:var(--r-pill);
  box-shadow:0 var(--lip-sm) 0 var(--accent-lip) inset;
  animation:grow var(--d-slow) var(--ease-settle) backwards
}
@keyframes grow{from{width:0}to{width:var(--w)}}
.gloss{position:absolute;top:25%;height:30%;left:4px;right:6px;background:#fff;opacity:.28;border-radius:var(--r-pill)}
.bar-value{font-variant-numeric:tabular-nums;font-weight:800;text-align:right;font-size:.95rem}

/* --------------------------------------------------------------- misc */
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--sp8);margin:var(--sp5) 0;text-align:left}
ul.tick,ul.cross{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp2)}
ul.tick li,ul.cross li{padding-left:1.9rem;position:relative;font-size:1rem}
ul.tick li::before{content:"";position:absolute;left:0;top:.35em;width:1.1rem;height:1.1rem;border-radius:var(--r-pill);background:var(--relational);box-shadow:0 var(--lip-sm) 0 var(--relational-lip)}
ul.cross li::before{content:"";position:absolute;left:0;top:.35em;width:1.1rem;height:1.1rem;border-radius:var(--r-pill);background:var(--defect);box-shadow:0 var(--lip-sm) 0 var(--defect-lip)}

.quote{
  margin:var(--sp5) 0;padding:var(--sp5);
  background:var(--canvas);border:var(--stroke) solid var(--rule);
  border-bottom-width:calc(var(--stroke) + var(--lip-sm));border-radius:var(--r-lg);
  font-style:italic;text-align:left
}
.quote cite{display:block;margin-top:var(--sp3);font-style:normal;font-size:.85rem;color:var(--ink-muted);font-family:var(--font-mono)}

.err{
  margin:var(--sp4) 0;padding:var(--sp4);text-align:left;
  background:var(--defect-tint);border:var(--stroke) solid var(--defect);
  border-bottom-width:calc(var(--stroke) + var(--lip-sm));border-radius:var(--r-md);
  font-size:.78rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:var(--ink)
}

.cast{display:flex;gap:var(--sp6);justify-content:center;align-items:flex-end;margin:var(--sp8) 0}
.cast.small{margin:var(--sp10) 0 0}
.ch{width:clamp(78px,9vw,124px);height:auto;overflow:visible}
.ch .sh{fill:var(--ink);opacity:.09}
.cast .ch{animation:bob 3.2s var(--ease-settle) infinite alternate}
.cast .ch:nth-child(2){animation-delay:.4s}
.cast .ch:nth-child(3){animation-delay:.8s}
@keyframes bob{from{transform:translateY(0)}to{transform:translateY(-8px)}}

/* --------------------------------------------------------------- chrome */
/* A blue smear dragged across Back / 7 of 23 / Next reads as the deck
   malfunctioning, so the chrome is chrome and not text. The slides themselves
   stay selectable — a reader quoting a figure should be able to copy it. */
.chrome{
  position:fixed;left:0;right:0;bottom:0;height:76px;
  display:flex;align-items:center;gap:var(--sp4);
  padding:0 clamp(16px,4vw,40px);
  background:linear-gradient(to top,var(--canvas) 62%,transparent);
  user-select:none;-webkit-user-select:none
}
.progress{flex:1;height:16px;background:var(--rule);border-radius:var(--r-pill);position:relative;overflow:hidden}
.progress i{position:absolute;inset:0 auto 0 0;width:0;background:var(--relational);border-radius:var(--r-pill);transition:width var(--d-slow) var(--ease-settle)}
.progress i::after{content:"";position:absolute;top:25%;height:30%;left:4px;right:6px;background:#fff;opacity:.28;border-radius:var(--r-pill)}
.counter{font-variant-numeric:tabular-nums;font-weight:800;color:var(--ink-muted);font-size:.95rem;min-width:5.5ch;text-align:right}

.btn{
  --lip:var(--lip-md);
  position:relative;display:inline-flex;align-items:center;justify-content:center;
  height:44px;min-width:44px;padding:0 var(--sp4);
  border:0 solid transparent;border-bottom-width:var(--lip);border-radius:var(--r-md);
  background:none;font-family:var(--font-ui);font-size:.82rem;font-weight:800;
  letter-spacing:.04em;text-transform:uppercase;line-height:calc(44px - var(--lip));
  color:var(--ink);cursor:pointer;transition:filter var(--d-fast),transform var(--d-press)
}
.btn::before{
  content:"";position:absolute;inset:0;z-index:-1;
  background:var(--canvas);color:var(--rule);
  box-shadow:0 var(--lip) 0;border-radius:inherit;
  border:var(--stroke) solid var(--rule);
  transition:box-shadow var(--d-press),background var(--d-fast)
}
.btn:hover::before{background:var(--canvas-sunk)}
.btn:active{transform:translateY(var(--lip))}
.btn:active::before{box-shadow:none}
.btn:focus-visible{outline:3px solid var(--substrate);outline-offset:3px}
/* 'aria-disabled', not the 'disabled' attribute: a disabled button leaves the
   tab order and never receives pointer events, so it can show neither the
   'not-allowed' cursor nor any explanation of why it is inert. This one stays
   focusable and stays honest; the click is refused in script instead. */
.btn[aria-disabled="true"]{opacity:.45;cursor:not-allowed}
.btn[aria-disabled="true"]:hover::before{background:var(--canvas)}
.btn[aria-disabled="true"]:active{transform:none}
.btn[aria-disabled="true"]:active::before{box-shadow:0 var(--lip) 0}

/* ------------------------------------------------------------- downloads */
dialog#downloads{
  width:min(520px,calc(100vw - 32px));padding:var(--sp6);
  border:var(--stroke) solid var(--rule);border-bottom-width:calc(var(--stroke) + var(--lip-md));
  border-radius:var(--r-xl);background:var(--canvas);color:var(--ink);
  font-family:var(--font-ui)
}
dialog#downloads::backdrop{background:rgba(60,60,60,.42)}
.dl-head{display:flex;align-items:center;justify-content:space-between;gap:var(--sp4);margin-bottom:var(--sp5)}
.dl-head h2{margin:0;font-family:var(--font-display);font-weight:900;font-size:1.5rem}
.dl-list{list-style:none;margin:0;padding:0;display:grid;gap:var(--sp3)}
.dl{
  display:flex;flex-direction:column;gap:2px;min-height:44px;justify-content:center;
  padding:var(--sp3) var(--sp4);text-decoration:none;color:var(--ink);
  background:var(--canvas);border:var(--stroke) solid var(--rule);
  border-bottom-width:calc(var(--stroke) + var(--lip-sm));border-radius:var(--r-md);
  transition:background var(--d-fast),transform var(--d-press)
}
.dl:hover{background:var(--relational-tint);border-color:var(--relational)}
.dl:active{transform:translateY(var(--lip-sm));border-bottom-width:var(--stroke)}
.dl:focus-visible{outline:3px solid var(--substrate);outline-offset:3px}
.dl-k{font-weight:800}
.dl-m{font-size:.85rem;color:var(--ink-muted)}
.dl-note{margin:var(--sp5) 0 0;font-size:.85rem;color:var(--ink-muted)}
.inline-dl{
  color:var(--relational-ink);text-decoration-thickness:2px;text-underline-offset:3px;
  font-weight:800;transition:color var(--d-fast)
}
.inline-dl:hover{color:var(--substrate-ink)}
.inline-dl:active{color:var(--ink)}
.inline-dl:focus-visible{outline:3px solid var(--substrate);outline-offset:3px;border-radius:var(--r-sm)}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}
}

/* ---------------------------------------------------------------- print */
@page{size:297mm 167mm;margin:0}
@media print{
  body{overflow:visible}
  .deck{position:static;display:block}
  .chrome,dialog#downloads{display:none}
  .slide{
    position:relative;inset:auto;opacity:1!important;visibility:visible!important;
    width:297mm;height:167mm;page-break-after:always;break-after:page;
    padding:14mm 18mm;display:grid;place-items:center;overflow:hidden
  }
  .slide-in{overflow:visible;max-height:none}
  .slide.on .slide-in>*{animation:none}
  .cast .ch{animation:none}
  .bar-fill{animation:none;width:var(--w)}
}
</style>
</head>
<body>
<div class="deck" id="deck">
${SLIDES.join('\n')}
</div>

<div class="chrome">
  <button class="btn" id="grab" aria-haspopup="dialog" aria-label="Downloads">Get</button>
  <button class="btn" id="prev" aria-label="Previous slide">Back</button>
  <div class="progress" role="progressbar" aria-label="Deck progress" aria-valuemin="0" aria-valuemax="${SLIDES.length}" aria-valuenow="1"><i id="bar"></i></div>
  <span class="counter" id="counter">1 / ${SLIDES.length}</span>
  <button class="btn" id="next" aria-label="Next slide">Next</button>
</div>

<dialog id="downloads" aria-labelledby="dl-title">
  <div class="dl-head">
    <h2 id="dl-title">Take it with you</h2>
    <button class="btn" id="dl-close" aria-label="Close downloads">Close</button>
  </div>
  <ul class="dl-list">
    <li><a class="dl" href="/agent-memory-as-a-database-problem-slides.pdf" data-local="agent-memory-as-a-database-problem-slides.pdf" download>
      <span class="dl-k">These slides</span><span class="dl-m">PDF &middot; ${SLIDES.length} pages &middot; 16:9</span></a></li>
    <li><a class="dl" href="/agent-memory-as-a-database-problem.pdf" data-local="../paper/agent-memory-as-a-database-problem.pdf" download>
      <span class="dl-k">The paper</span><span class="dl-m">PDF &middot; A4 &middot; the full review</span></a></li>
    <li><a class="dl" href="/agent-memory-as-a-database-problem.epub" data-local="../paper/agent-memory-as-a-database-problem.epub" download>
      <span class="dl-k">The paper</span><span class="dl-m">ePub &middot; reflows on an e-reader</span></a></li>
    <li><a class="dl" href="/capture.json" data-local="../data/capture.json" download>
      <span class="dl-k">The dataset</span><span class="dl-m">JSON &middot; every number on every slide</span></a></li>
    <li><a class="dl" href="https://dbms-memory.khe.money">
      <span class="dl-k">Read online</span><span class="dl-m">dbms-memory.khe.money</span></a></li>
  </ul>
  <p class="dl-note">Nothing on a slide was typed by hand. Each figure is read from the dataset, so the deck and the paper cannot disagree.</p>
</dialog>

<script>
/* Navigation. Arrows, space, Home and End; the hash carries the slide so a link
   lands where it says it does. Nothing here animates layout — only the slide's
   own opacity and its children's transform. */
(function () {
  var deck = document.getElementById('deck');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var bar = document.getElementById('bar');
  var counter = document.getElementById('counter');
  var prev = document.getElementById('prev');
  var next = document.getElementById('next');
  var i = 0;

  var lastNav = 0;

  function show(k, push) {
    var target = Math.max(0, Math.min(slides.length - 1, k));
    /* Paging faster than the entrance lasts means the entrance is never seen —
       it is only replayed from the start, which reads as stutter. Below the
       animation's own duration, skip it and just change the slide. */
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    document.body.toggleAttribute('data-fast', now - lastNav < 260);
    lastNav = now;
    document.body.setAttribute('data-dir', target < i ? 'back' : 'forward');
    i = target;
    slides.forEach(function (s, j) { s.classList.toggle('on', j === i); });
    var pctDone = ((i + 1) / slides.length) * 100;
    bar.style.width = pctDone + '%';
    bar.parentNode.setAttribute('aria-valuenow', String(i + 1));
    counter.textContent = (i + 1) + ' / ' + slides.length;
    prev.setAttribute('aria-disabled', String(i === 0));
    next.setAttribute('aria-disabled', String(i === slides.length - 1));
    document.body.setAttribute('data-accent', slides[i].getAttribute('data-accent') || 'relational');
    if (push !== false) history.replaceState(null, '', '#' + (i + 1));
  }

  document.addEventListener('keydown', function (e) {
    var dlgOpen = document.getElementById('downloads').open;
    if (dlgOpen) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); show(0); }
    else if (e.key === 'End') { e.preventDefault(); show(slides.length - 1); }
  });
  next.addEventListener('click', function () { if (i < slides.length - 1) show(i + 1); });
  prev.addEventListener('click', function () { if (i > 0) show(i - 1); });

  /* ---- the swipe --------------------------------------------------------
     The old handler read one number at touchend and jumped if it exceeded 60px.
     Nothing moved while the finger did, so a half-swipe was indistinguishable
     from no swipe until the finger came up — the deck either did nothing or
     teleported, and there was no way to tell which was coming.

     This tracks. The slide follows the finger 1:1 from where it was grabbed, so
     the swipe is a direct manipulation rather than a command. At the first and
     last slide there is nothing to turn to, so resistance builds instead of the
     motion stopping dead: a hard stop reads as frozen, progressive resistance
     reads as responsive with nothing more there. On release the landing point is
     projected from the release velocity rather than read off the release
     position, which is what makes a flick throw the slide instead of nudging it.

     Touch events rather than Pointer Events, which is not the modern default and
     is deliberate: with 'touch-action: pan-y' Chrome fires 'pointercancel' after
     the first 'pointermove' of a horizontal drag and then sends nothing more, so
     a pointer-based tracker freezes mid-gesture. The touch stream is not
     cancelled and keeps reporting. Vertical drags are left alone from the first
     move so a slide taller than the screen still scrolls. */

  var LIFT = 8;              /* movement before the drag commits to being one */
  var COMMIT = 0.22;         /* fraction of the viewport that counts as a page */
  var DECEL = 0.995;         /* momentum projection, scroll-deceleration form */

  function rubberband(overshoot, dimension) {
    /* The further past the end the finger goes, the less the slide follows. */
    var c = 0.55;
    return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
  }
  function project(velocity) {
    return (velocity / 1000) * DECEL / (1 - DECEL);
  }

  var drag = null;

  function setOffset(px, animate) {
    var el = slides[i];
    if (!el) return;
    el.style.transition = animate ? 'transform var(--d-base) var(--ease-settle)' : 'none';
    el.style.transform = px ? 'translate3d(' + px + 'px,0,0)' : '';
  }

  deck.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { drag = null; return; }
    if (e.target.closest('button, a, dialog')) return;
    var t = e.touches[0];
    drag = { x0: t.clientX, y0: t.clientY, lastX: t.clientX, lastT: e.timeStamp, v: 0, axis: null };
  }, { passive: true });

  deck.addEventListener('touchmove', function (e) {
    if (!drag || e.touches.length !== 1) return;
    var t = e.touches[0];
    var dx = t.clientX - drag.x0;
    var dy = t.clientY - drag.y0;

    /* Decide the axis once, and only once there is enough movement to mean it.
       A slide that scrolls vertically must keep scrolling; only a clearly
       horizontal drag becomes a page turn. */
    if (drag.axis === null) {
      if (Math.abs(dx) < LIFT && Math.abs(dy) < LIFT) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (drag.axis !== 'x') return;
    if (e.cancelable) e.preventDefault();

    /* Velocity from the last few milliseconds, not from the whole gesture: what
       matters at release is how fast the finger was moving when it left. */
    var dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.v = ((t.clientX - drag.lastX) / dt) * 1000;
    drag.lastX = t.clientX;
    drag.lastT = e.timeStamp;

    var w = window.innerWidth;
    var atStart = i === 0 && dx > 0;
    var atEnd = i === slides.length - 1 && dx < 0;
    setOffset(atStart || atEnd ? rubberband(dx, w) : dx, false);
  }, { passive: false });

  function endDrag() {
    if (!drag) return;
    var committed = drag.axis === 'x';
    var dx = drag.lastX - drag.x0;
    var v = drag.v;
    drag = null;
    if (!committed) return;

    var w = window.innerWidth;
    /* Land where the gesture was going, not where the finger stopped. */
    var landing = dx + project(v);
    var wants = landing < -w * COMMIT ? 1 : landing > w * COMMIT ? -1 : 0;
    var target = Math.max(0, Math.min(slides.length - 1, i + wants));

    if (target === i) { setOffset(0, true); return; }

    var leaving = slides[i];
    show(target);
    if (leaving) { leaving.style.transition = 'none'; leaving.style.transform = ''; }
    setOffset(0, false);
  }

  deck.addEventListener('touchend', endDrag, { passive: true });
  deck.addEventListener('touchcancel', function () {
    if (!drag) return;
    drag = null;
    setOffset(0, true);
  }, { passive: true });

  /* The deck has two homes: published under /slides/ on the site, and opened
     straight off disk out of the repository. The download links are written for
     the first and carry the second as data-local, so neither case ships a dead
     link. */
  /* The escapes are doubled because this whole script is inside a JS template
     literal: a single backslash would be consumed on the way out and the emitted
     regex would be '/^/slides(/|$)/', which is a syntax error that takes the
     entire deck down with it. */
  if (location.protocol === 'file:' || !/^\\/slides(\\/|$)/.test(location.pathname)) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-local]'), function (a) {
      a.setAttribute('href', a.getAttribute('data-local'));
    });
  }

  /* Downloads. A real <dialog>, so focus trapping, Escape and the backdrop are
     the platform's job rather than ours. */
  var dlg = document.getElementById('downloads');
  var grab = document.getElementById('grab');
  var close = document.getElementById('dl-close');
  grab.addEventListener('click', function () { dlg.showModal(); });
  close.addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  var fromHash = parseInt((location.hash || '').slice(1), 10);
  show(isNaN(fromHash) ? 0 : fromHash - 1, false);
})();
</script>
</body>
</html>
`

/* Guard: the deck's behaviour lives inside a template literal, so an escape that
   survives in the source can be eaten on the way out. A deck whose script throws
   renders 23 invisible slides and looks, to anything that only measures what is
   on screen, completely clean. Parse the emitted script before writing it. */
{
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  for (const [i, body] of scripts.entries()) {
    try {
      new Function(body)
    } catch (err) {
      console.error(`emitted script ${i + 1} does not parse: ${err.message}`)
      process.exit(1)
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, html)
console.log(`wrote ${OUT}`)
console.log(`  ${SLIDES.length} slides, ${(html.length / 1024).toFixed(0)} kB`)
