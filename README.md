# Persistent Memory Architecture in Agents Using DBMS

A review paper on how AI agents should store what they remember, measured across
**ten storage architectures** — file stores, **SQLite 3.53**, and **PostgreSQL 18.3**
with `pgvector` and GIN — over one corpus of agent memories with non-circular
ground truth.

BTech CSE coursework, DBMS.

**Submitted by** Harshit Khemani
**Co-authors** Kush Ahuja, Madhav Bassi, Kushagra Agrawal
**Submitted to** Dr. Poonam Sangwan

Read online at **[dbms-memory.khe.money](https://dbms-memory.khe.money)** · download the
[PDF](paper/persistent-memory-architecture-in-agents.pdf) or
[ePub](paper/persistent-memory-architecture-in-agents.epub).

---

## What this repository contains

| Path | What it is |
|---|---|
| `web/` | Next.js 16 app — the paper, the ER diagram, charts and interactive explorers |
| `paper/` | The generated PDF and ePub editions |
| `engines/schema.mjs` | The logical model. The ER diagram, the DDL and the normalization argument all read this one file |
| `engines/contract.mjs` | The engine interface, the retrieval metrics, and RRF fusion |
| `engines/file.mjs` | Three file baselines: JSONL scan, flat vector index, vector + metadata post-filter |
| `engines/sqlite.mjs` | Three SQLite arms: B-tree, FTS5 inverted index, FTS5 + vectors |
| `engines/postgres.mjs` | Four Postgres arms: B-tree, GIN, HNSW, and GIN+HNSW fused by RRF **in SQL** |
| `tools/corpus.mjs` | The corpus generator — builds facts first, then renders memories from them |
| `tools/embed.mjs` | Local embedding cache (MiniLM-L6-v2, 384 d), shared by every arm |
| `tools/capture.mjs` | The measurement harness. Produces the entire dataset. |
| `tools/exp/` | Retrieval quality, dense-failure forensics, crash trials, lost updates, anomaly probe |
| `data/capture.json` | The dataset every figure and number in the paper reads from |

No number in the paper is transcribed by hand. Prose, tables and charts read the same
JSON, so the text and the evidence cannot drift apart. The PDF and ePub render from the
same page as the web edition, so the three editions cannot drift either.

## Reproducing everything

```bash
git clone https://github.com/HKTITAN/dbms-agent-memory && cd dbms-agent-memory
```

```bash
npm install && npm run paper
```

`npm run paper` runs corpus → embed → capture → QR → build → PDF → ePub → previews.

There is **no database server to install and no API key to set**. SQLite comes from
Node's built-in `node:sqlite`; PostgreSQL 18.3 runs through [PGlite](https://pglite.dev/)
as WebAssembly; the embedding model runs locally through `@huggingface/transformers`.
The first `npm run embed` downloads the model once (~90 MB) and caches 35,148 vectors.

## Method in one paragraph

Relevance labels are worthless if you pick them by looking at results, so the corpus is
built backwards. A world of services, incidents, config records and decisions produces
**facts** — subject-predicate-object triples. Each fact is then *rendered* into several
natural-language **memories** an agent might plausibly have written, scattered across
sessions. The memories relevant to a query about a fact are therefore exactly the
memories rendered from that fact, intersected with the query's structural predicate:
definitional, not judged. Distractors (mentioning an identifier while asserting nothing)
and supersessions (revising a fact after the fact) are added deliberately, because
without them a lexical index scores perfectly by accident and currency is untestable.

Queries are partitioned into **eight classes** — lexical, semantic, temporal, provenance,
currency, aggregate, negation, hybrid — chosen so that each stresses a different access
method. The column that carries the paper is whether a class can be answered by top-*k*
similarity alone.

## Key findings

1. **Most agent recall is not a similarity problem.** 61.7% of the query workload needs a
   predicate, a join or an aggregate. No top-*k* similarity search can express those, and
   the failure is silent — ten plausible memories come back with no signal that the
   question asked was not the question answered.
2. **Dense retrieval is near-random on identifiers.** On queries naming a record by its
   key, the pure vector arm scores ~0.00 nDCG against ~0.79 for BM25. In every probe the
   embedding's top hit was a distractor sharing the query's *grammatical shape*
   ("checked X, unrelated"), while the memory that answered it sat at median rank 271
   of 8,282.
3. **The same vector index inside a DBMS recovers most of the loss** — not because
   retrieval improved, but because a query language existed to state the constraint.
   `pg-hnsw` scores 1.000 on provenance, where the planner uses a B-tree and never
   consults the vector index at all.
4. **Hybrid retrieval is not uniformly better.** On classes a predicate already settles,
   rank fusion re-ranks *away* from the correct answer: 1.000 → 0.63 on currency.
5. **Whole-document rewrite loses everything, not the last record.** A crash inside the
   rewrite window left the entire store unparseable. Append-only JSONL, by contrast,
   survived every trial — an honest result that narrows the usual blanket claim.
6. **Eight concurrent writers cost the file store 87.5% of its updates**; both DBMS arms
   lost none. Textbook lost-update anomaly, textbook cause.
7. **Denormalization shows up as self-contradiction.** A fact is restated 3.7 times on
   average (max 15). A correction applied through top-10 retrieval leaves 64.5% of the
   restatements asserting the old value — and the agent will retrieve and believe them.
8. **Embeddings dominate storage.** One 384-d float32 vector is 1,536 bytes, larger than
   the ~25-token memory it describes. The vector arms cost ~8× the bytes per memory of an
   inverted index, and buy quality on one class out of eight.

## Design

Light theme only, matched to the sibling paper on compiler phases. Monochrome canvas with
a single warm accent, typography before surfaces, honest chart encodings with zero
baselines, tabular numerals, WCAG 2.2 AA contrast in both the screen and print palettes,
`transform`/`opacity`-only motion under 300 ms with a reduced-motion path.

The entity-relationship diagram is drawn in Chen notation and generated from
`engines/schema.mjs` — the same declaration the loaders execute. Every box is a table
that was created; every dashed edge is a foreign key that was enforced during measurement.

## Deploying

```bash
cd web && npx vercel deploy --prod
```

Static output, no runtime dependencies — the dataset is a build-time JSON artifact
inlined into the render.

## License

Coursework. PostgreSQL, SQLite, pgvector, PGlite and MiniLM belong to their respective
projects and are used under their own licences.
