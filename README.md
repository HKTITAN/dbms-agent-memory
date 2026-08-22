# Persistent memory architecture for agents

A review paper on **[Notion's Lore](https://github.com/makenotion/lore)** — the open-source
memory system that gives AI assistants a persistent, shared vault backed by five Notion
databases — read as a *database design*, and then reimplemented on **SQLite** and
**PostgreSQL** to measure what the substrate can and cannot do.

BTech CSE coursework, DBMS.

**Submitted by** Harshit Khemani
**Co-authors** Kush Ahuja, Madhav Bassi, Kushagra Agrawal
**Submitted to** Dr. Poonam Sangwan

Read online at **[dbms-memory.khe.money](https://dbms-memory.khe.money)** · the
[paper](paper/persistent-memory-architecture-for-agents.pdf) ·
the [ePub](paper/persistent-memory-architecture-for-agents.epub) ·
the [talk](deck/persistent-memory-architecture-for-agents-slides.pdf) ·
the [dataset](data/capture.json).

---

## The finding in one paragraph

Lore's vault is **correct**. It answers 100% of a 361-question workload exactly — the right
set, nothing added, nothing missing — the same as both relational engines. What separates
them is what the answer costs and what the store will refuse. Answering that workload takes
the Notion Data API **522 686 HTTP requests** against **361 SQL statements**; a single join
from a claim to the memory that supports it costs 1 138 requests; searching what memories
actually *say* costs 11 892, because the search endpoint matches titles and a memory's text
is page blocks. Eight agents upserting the same topic key lose **87.1%** of their updates,
because the read-then-write protocol has no conditional write to close. And PostgreSQL
declines even to *add* a temporal exclusion constraint to the vault as generated, because
70 subject-predicate pairs already assert two different objects over overlapping time.

None of this makes Lore a bad system. It makes the trade legible: every guarantee a database
declares, exchanged for human-legible memory, zero infrastructure and inherited permissions.

## What this repository contains

| Path | What it is |
|---|---|
| `engines/schema.mjs` | **The logical model, declared once.** Lore's five databases restated as a relational schema, transcribed from `src/notion/schema.ts` at commit `95c3558`. The ER diagram, the DDL both engines execute, the emulator's property catalogue and the normalisation argument all read this one file. |
| `engines/notion.mjs` | An emulator for the Notion Data API, restricted to operations the public reference documents. Every restriction carries the page it comes from. |
| `engines/sqlite.mjs` | The same schema as real tables through `node:sqlite`, with indexes, foreign keys and an FTS5 index over bodies. |
| `engines/postgres.mjs` | The same again through PGlite, adding range-typed validity, a GiST exclusion constraint and GIN over `to_tsvector`. |
| `engines/contract.mjs` | The ten question classes, the oracle that answers them in plain JavaScript, and the cost model. |
| `tools/vault.mjs` | The vault generator. Builds a world first, reads facts off it, then renders memories from the facts — so ground truth is definitional, not judged. |
| `tools/capture.mjs` | The measurement harness. Produces the entire dataset. |
| `tools/exp/` | Integrity, cost and full-text experiments. |
| `tools/deck.mjs` | Generates the talk from the same dataset. |
| `tools/audit.mjs` | The interface audit: contrast, target size, overflow and accessible names, measured in a real viewport at three widths. |
| `data/capture.json` | The dataset every figure and every number in the paper, the deck and the site reads from. |
| `web/` | Next.js 16 app — the paper, the ER diagram, the figures and three interactive explorers. |
| `deck/` | The talk. `.design` is its visual contract. |

**No number in any of the three editions is typed by hand.** Prose, tables, charts and slides
all read `data/capture.json`, so the text and the evidence cannot drift apart. The PDF and the
ePub render from the same page as the web edition, so the editions cannot drift either.

## Reproducing everything

```bash
git clone https://github.com/HKTITAN/dbms-agent-memory && cd dbms-agent-memory
```

```bash
npm install && npm run paper
```

`npm run paper` runs vault → capture → QR → build → PDF → ePub → deck → deck PDF → previews.

There is **no database server to install and no API key to set.** SQLite comes from Node's
built-in `node:sqlite`; PostgreSQL runs through [PGlite](https://pglite.dev/) as WebAssembly.
The vault is deterministic in its seed, so a rerun reproduces every number.

```bash
npm run vault && npm run capture   # just the measurement
npm run smoke                      # check every arm still agrees with the oracle
node tools/audit.mjs http://127.0.0.1:3200   # the interface audit
```

## Method in one paragraph

Relevance labels chosen by looking at what a store returned are worthless, so the corpus is
built backwards. A world of services, people, teams, incidents and decisions produces **facts**
— subject-predicate-object triples with validity intervals that open and close over 540
simulated days. Each fact is then *rendered* into several natural-language **memories** an
agent might plausibly have written, scattered across sessions and authors. Six defects are
injected on purpose — duplicate entities, unclosed intervals, stale subject titles, dangling
provenance, colliding aliases, distractors — because each is a state Lore's substrate cannot
refuse, and a clean vault would prove nothing. The ten question classes are read off Lore's
own commands and hooks, and each is annotated with the minimum relational algebra it needs.

**On the emulator.** We hold no Notion workspace and issue no requests, so wall-clock through
the Notion arm would measure our own JavaScript. What we report instead are counts — requests,
bytes, and rows the client had to examine — which are fixed by the API's shape rather than by
anyone's network. The documented average of three requests per second then converts a request
count into a floor on wall-clock. §14 of the paper states what this cannot capture, including
the largest limitation: Lore in practice delegates ranking to Notion's own search, including an
internal endpoint that is undocumented and tier-gated, which we could not model.

## Key findings

1. **Correctness is not the differentiator.** All three stores answer 100% of the workload
   exactly. A critique that expected wrong answers would stop here and be wrong to.
2. **Cost is.** 522 686 requests against 361 statements — 48.4 hours of rate-limit floor for a
   workload SQL finishes in one pass.
3. **A join costs 1 138 requests.** There is no way to filter Facts by a property of the page
   its relation points at, so the client fetches candidates and joins them itself.
4. **Searching what a memory says costs 66 minutes** at this vault's size, and 110 hours at a
   hundred times it. The search endpoint matches titles; the text is blocks.
5. **Eight concurrent writers lose 87.1% of their updates.** Lore's own source says why:
   *"Notion provides no per-key uniqueness enforcement."* A unique index loses none.
6. **The constraint refuses to be added.** PostgreSQL will not certify the vault as generated;
   192 of the writes that built it would have been rejected at the point of writing.
7. **Three normalisation violations ship**, each for a substrate reason that can be named: a
   repeating group in one cell, an expression index materialised as two columns, and a
   Boyce-Codd violation that leaves 105 facts whose title and whose relation disagree about
   their own subject.
8. **Two inverted indexes over the same text give different answers.** `phraseto_tsquery`
   parses *"timed out"* as the single lexeme `'time'` and returns 669 rows; FTS5 returns 0.
   Neither is wrong, and nothing in either answer says which position was taken.

## Design

One language, three editions, one contract: [`.design`](.design).

The **talk** and the **paper's web edition** both use Duolingo's design language, re-derived
rather than copied — the rules from [design.duolingo.com](https://design.duolingo.com/) and
from Duolingo's shipped production CSS, applied to material Duolingo has never rendered. The
rule that carries it: *depth is a solid darker edge, never a blur.* Every raised surface
offsets a fill against its darker sibling, and pressing lands it flush. Nothing reproduces
Duolingo's marks, its bespoke typefaces, or its characters; the three creatures are original,
built from the three primitives its shape language allows. Nunito is used because Duolingo's
own typography page names it as the substitute for its unlicensable faces.

The deck is the language at full volume. The web paper is the same tokens applied to a
document that is read rather than glanced at: the chrome carries the language and the reading
column stays calm. In both, the joke stops at the data — every figure that carries evidence is
drawn plainly, on a zero baseline, in tabular numerals, and colour is never the only signal.

The **PDF** inherits none of it. It is set to the conventions of
[Nakamoto's Bitcoin paper](https://bitcoin.org/bitcoin.pdf), measured off that file rather than
remembered: Times 10.1 pt on 11.65 pt leading, justified with hyphenation off, a 14.4 pt
first-line indent and no space between paragraphs, Century Schoolbook Bold headings, a run-in
bold `Abstract.` over an inset block, Courier code with no frame, Arial only inside diagram
labels, two inks, no rules, no running head, and a bare numeral for a folio. On A4, 35 mm side
margins give a 140 mm measure — 396.9 pt against the source document's 396 pt, so the line
length carries over exactly. Tinos, Cousine and Gelasio stand in for Times, Courier and Century
Schoolbook; Arial is left to the system stack, as the source document leaves it. The boundary is
the `@media print` block at the foot of `web/app/globals.css`.

WCAG 2.2 AA is verified arithmetically rather than by eye, against the darkest surface each
colour is actually set on — which is why the accent splits into a fill, an edge, a tint and an
ink, and why text only ever takes the ink. `tools/audit.mjs` checks the paper at 1280, 768 and
375 px, the machine canvas at 1280, and the deck at 1280 and 375.

## Deploying

```bash
cd web && npx vercel deploy --prod
```

Static output, no runtime dependencies — the dataset is a build-time artifact inlined into the
render.

## Licence

Coursework. **Lore is © Notion Labs, Inc., used under the MIT licence**; this paper reviews it
and is not affiliated with Notion. PostgreSQL, SQLite, PGlite and Nunito belong to their
respective projects and are used under their own licences. Duolingo's marks and typefaces are
its own and are not reproduced here.
