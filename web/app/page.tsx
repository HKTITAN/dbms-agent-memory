import { getCapture, summarise, engine, bytes, ms, num, pct } from '@/lib/data'
import { Figure, StatStrip, BarChart, ScalingChart, ParetoChart, HeatMatrix } from '@/components/charts'
import {
  ValidationTable, EngineTable, CapabilityTable, ExpressibilityTable, StorageTable,
  ScalingTable, PostFilterTable, DurabilityTable, ConcurrencyTable, AnomalyTable,
} from '@/components/evidence'
import {
  MemoryLoopDiagram, IndexAnatomyDiagram, NormalizationLadder, PostFilterDiagram, StorageStackDiagram,
} from '@/components/diagrams'
import {
  QueryClassExplorer, DenseFailureExplainer, BudgetExplorer, SchemaBrowser,
} from '@/components/explainers'
import { ErDiagram } from '@/components/er-diagram'
import { Sidebar } from '@/components/sidebar'
import { QrCode, QR_URL } from '@/components/qr-code'
import { Icon } from '@/components/icons'
import { AudienceProvider, AudienceToggle, Audience, MachineBlock } from '@/components/audience'

export const dynamic = 'force-static'

const AUTHORS = {
  lead: 'Harshit Khemani',
  co: ['Kush Ahuja', 'Madhav Bassi', 'Kushagra Agrawal'],
  submittedTo: 'Dr. Poonam Sangwan',
  site: 'dbms-memory.khe.money',
}

const TOC = [
  { id: 'abstract', label: 'Abstract' },
  { id: 'introduction', label: '1. Introduction' },
  { id: 'memory', label: '2. What agent memory is' },
  { id: 'practice', label: '3. How it is built today' },
  { id: 'model', label: '4. The data model' },
  { id: 'method', label: '5. Methodology' },
  { id: 'results', label: '6. Results' },
  { id: 'sql', label: '7. Retrieval as a query' },
  { id: 'explore', label: '8. Explore the evidence' },
  { id: 'discussion', label: '9. Discussion' },
  { id: 'limitations', label: '10. Threats to validity' },
  { id: 'related', label: '11. Related work' },
  { id: 'conclusion', label: '12. Conclusion' },
  { id: 'references', label: 'References' },
  { id: 'appendix', label: 'Appendices' },
]

const DOWNLOADS = [
  {
    href: '/persistent-memory-architecture-in-agents.pdf',
    label: 'PDF',
    meta: 'A4',
    preview: '/preview-pdf.png',
    previewAlt: 'First page of the typeset PDF',
  },
  {
    href: '/persistent-memory-architecture-in-agents.epub',
    label: 'ePub',
    meta: 'reflow',
    preview: '/preview-epub.png',
    previewAlt: 'The abstract, reflowed for an e-reader',
  },
]

const R = {
  codd: 'https://dl.acm.org/doi/10.1145/362384.362685',
  chen: 'https://dl.acm.org/doi/10.1145/320434.320440',
  elmasri: 'https://www.pearson.com/en-us/subject-catalog/p/fundamentals-of-database-systems/P200000003546',
  ramakrishnan: 'https://pages.cs.wisc.edu/~dbbook/',
  gray: 'https://dl.acm.org/doi/book/10.5555/573304',
  aries: 'https://dl.acm.org/doi/10.1145/128765.128770',
  bm25: 'https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf',
  rrf: 'https://dl.acm.org/doi/10.1145/1571941.1572114',
  hnsw: 'https://arxiv.org/abs/1603.09320',
  pgvector: 'https://github.com/pgvector/pgvector',
  postgres: 'https://www.postgresql.org/docs/18/index.html',
  sqlite: 'https://sqlite.org/lang.html',
  fts5: 'https://sqlite.org/fts5.html',
  pglite: 'https://pglite.dev/',
  minilm: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2',
  tulving: 'https://alicekim.ca/EMSM72.pdf',
  memgpt: 'https://arxiv.org/abs/2310.08560',
  generative: 'https://arxiv.org/abs/2304.03442',
  rag: 'https://arxiv.org/abs/2005.11401',
  wal: 'https://www.postgresql.org/docs/18/wal-intro.html',
  repo: 'https://github.com/HKTITAN/dbms-agent-memory',
} as const

function Cite({ n }: { n: number }) {
  return <a href={`#ref-${n}`} className="cite" aria-label={`Reference ${n}`}>[{n}]</a>
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>
}

export default function Page() {
  const c = getCapture()
  const s = summarise(c)
  const captured = c.capturedAt.slice(0, 10)

  const fts = engine('sqlite-fts')
  const vec = engine('file-vec')
  const hybrid = engine('pg-hybrid')
  const hnsw = engine('pg-hnsw')
  const gin = engine('pg-gin')

  const live = c.engines.filter((e) => !e.failed)
  const classCols = c.expressibility.classes.map((x) => ({
    id: x.class,
    label: x.class,
    flag: x.similarityExpressible ? undefined : 'needs SQL',
  }))
  const engineRows = live.map((e) => ({ id: e.id, label: e.short, sub: e.engine }))

  const pf1 = c.postFilter[0]
  const pfLast = c.postFilter[c.postFilter.length - 1]
  const rewrite = c.durability.find((d) => d.kind === 'file-rewrite')!
  const appendOnly = c.durability.find((d) => d.kind === 'file-append')!

  return (
    <AudienceProvider>
      <div className="shell">
        <header className="masthead no-print">
          <span className="label" style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4375rem' }}>
            <Icon name="book" size={16} />
            Persistent Memory in Agents
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <span className="meta">PostgreSQL 18.3 · SQLite {c.toolchain.sqlite}</span>
            <AudienceToggle />
          </span>
        </header>

        <div className="with-rail">
          <Sidebar entries={TOC} downloads={DOWNLOADS} />

          <main id="main">
            {/* ------------------------------------------------ title block */}
            <section className="section" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
              <p className="meta" style={{ marginBottom: '1.25rem' }}>Review paper</p>
              <h1 className="display" style={{ maxWidth: '20ch' }}>
                Persistent memory architecture in agents using DBMS
              </h1>
              <p className="lede" style={{ maxWidth: '58ch', marginTop: '1.5rem' }}>
                An agent&apos;s long-term memory is a database. We measure ten ways of
                building it — from a JSON file to PostgreSQL with a vector index — on one
                corpus with known answers.
              </p>

              <div className="split" style={{ marginTop: '2.5rem', paddingTop: '1.75rem', borderTop: 'var(--rule)' }}>
                <div>
                  <p className="label" style={{ marginBottom: '0.375rem' }}>Submitted by</p>
                  <p style={{ margin: 0, fontSize: '1.0625rem' }}>{AUTHORS.lead}</p>
                  <p className="label" style={{ margin: '1.125rem 0 0.375rem' }}>Co-authors</p>
                  <p style={{ margin: 0, fontSize: '1.0625rem' }}>{AUTHORS.co.join(', ')}</p>
                  <p className="label" style={{ margin: '1.125rem 0 0.375rem' }}>Submitted to</p>
                  <p style={{ margin: 0, fontSize: '1.0625rem' }}>{AUTHORS.submittedTo}</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <QrCode size={104} />
                  <div>
                    <p className="label" style={{ marginBottom: '0.25rem' }}>Read online</p>
                    <p style={{ margin: 0 }}>
                      <A href={QR_URL}>
                        <span className="mono" style={{
                          fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center',
                          minHeight: 24, paddingBlock: '0.25rem',
                        }}>{AUTHORS.site}</span>
                      </A>
                    </p>
                    <p className="caption" style={{ marginTop: '0.5rem', maxWidth: '26ch' }}>
                      Corpus, harness and dataset at <A href={R.repo}>github.com/HKTITAN/dbms-agent-memory</A>.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ---------------------------------------------------- abstract */}
            <section id="abstract" className="section">
              <h2 className="heading-24">Abstract</h2>

              <Audience
                human={
                  <div className="prose body">
                    <p>
                      An AI agent that persists anything across sessions is operating a database,
                      whether or not it calls it one. It writes records, indexes them, retrieves a
                      subset under a budget, and must survive a crash without contradicting itself.
                      Current practice largely ignores this: agent memory is typically a JSON file
                      or a standalone vector index, and the properties a database management system
                      was built to provide — a schema, a query language, transactions, concurrency
                      control, recovery — are absent by construction.
                    </p>
                    <p>
                      This paper asks what that costs. We model agent memory as an
                      entity-relationship schema, normalise it to BCNF, and implement it across{' '}
                      {s.engines} storage architectures spanning three families: file stores,
                      SQLite {c.toolchain.sqlite} embedded, and PostgreSQL 18.3 with{' '}
                      <code>pgvector</code> and GIN. All {s.engines} are measured on one corpus of{' '}
                      {num(s.memories)} agent memories ({num(s.tokens)} tokens) rendered from{' '}
                      {num(s.facts)} ground-truth facts, against {s.queries} labelled recall
                      queries partitioned into {s.classCount} classes.
                    </p>
                    <p>
                      Four results. First, <strong>most of a realistic recall workload is not a
                      similarity problem</strong>: {pct(s.structuralShare, 1)} of our queries
                      ({s.structuralQueries} of {c.expressibility.total}) require a predicate, a
                      join or an aggregate, and no top-<em>k</em> similarity search can express
                      them. Second, <strong>dense retrieval fails hardest on exactly what agents
                      remember</strong> — identifiers. On queries naming a record by its key, the
                      pure vector arm scores {vec.quality.byClass.find((b) => b.class === 'lexical')!.ndcg.toFixed(3)}{' '}
                      nDCG against {fts.quality.byClass.find((b) => b.class === 'lexical')!.ndcg.toFixed(3)}{' '}
                      for an inverted index; in every probe the embedding&apos;s top hit was a
                      distractor that shared the query&apos;s grammatical shape, while the memory
                      that answered it sat at median rank {s.denseFirstRank} of {num(s.memories)}.
                      Third, <strong>the properties that separate the families are the classical
                      ones</strong>: under eight concurrent writers the file store lost{' '}
                      {s.lostUpdates} of {c.concurrency.results.file.expected} updates
                      ({pct(s.lostUpdates / c.concurrency.results.file.expected, 1)}) where both
                      DBMS arms lost none, and a crash during a whole-document rewrite left the
                      entire store unreadable in {rewrite.unreadable} of {rewrite.trials} trials.
                      Fourth, <strong>normalisation is not bookkeeping here</strong>: a fact is
                      restated across {s.restatementsMean} memories on average, so a correction
                      applied through top-{c.k} retrieval leaves {s.staleAfterRepair}% of the
                      restatements asserting the old value — contradictions the agent will later
                      retrieve and believe.
                    </p>
                    <p>
                      The practical conclusion is narrower than &ldquo;use a database&rdquo;. The
                      best-scoring arm was {s.best.label} at {s.bestNdcg.toFixed(3)} nDCG, but{' '}
                      {fts.label} reached {fts.quality.overall.ndcg.toFixed(3)} at{' '}
                      {ms(fts.quality.overall.p50Ms)} median latency and{' '}
                      {fts.bytesPerMemory} bytes per memory — {s.vectorOverhead}× less storage than
                      the vector-bearing arms, whose embeddings dominate the store. Vectors earn
                      their cost on paraphrase and nowhere else.
                    </p>
                  </div>
                }
                machine={
                  <div>
                    <p className="caption" style={{ marginTop: 0, marginBottom: '0.875rem' }}>
                      The same claims as records — what an agent consuming this paper would read.
                    </p>
                    <MachineBlock
                      caption="abstract.findings"
                      data={{
                        study: {
                          subject: 'persistent agent memory',
                          engines: s.engines,
                          postgres: c.toolchain.postgres.split(' on ')[0],
                          sqlite: c.toolchain.sqlite,
                          embedding: c.toolchain.embeddingModel,
                          capturedAt: c.capturedAt,
                        },
                        corpus: {
                          memories: s.memories,
                          facts: s.facts,
                          sessions: s.sessions,
                          tokens: s.tokens,
                          queries: s.queries,
                          queryClasses: s.classCount,
                        },
                        findings: [
                          {
                            id: 'not-a-similarity-problem',
                            claim: 'Most agent recall requires relational operators, not similarity.',
                            evidence: {
                              structuralQueries: s.structuralQueries,
                              totalQueries: c.expressibility.total,
                              structuralShare: s.structuralShare,
                              classes: s.structuralClasses,
                            },
                          },
                          {
                            id: 'dense-fails-on-identifiers',
                            claim: 'Dense retrieval is near-random on queries naming a record by key.',
                            evidence: {
                              vectorLexicalNdcg: s.vecLexicalNdcg,
                              invertedLexicalNdcg: s.ftsLexicalNdcg,
                              medianRankOfFirstRelevant: s.denseFirstRank,
                              corpusSize: s.memories,
                              topHitWasDistractorRate: s.denseDistractorRate,
                            },
                          },
                          {
                            id: 'acid-properties-decide',
                            claim: 'Durability and concurrency separate the families, not retrieval tuning.',
                            evidence: {
                              lostUpdatesFile: c.concurrency.results.file.lost,
                              lostUpdatesSqlite: c.concurrency.results.sqlite.lost,
                              lostUpdatesPostgres: c.concurrency.results.postgres.lost,
                              rewriteUnreadableTrials: `${rewrite.unreadable}/${rewrite.trials}`,
                              appendUnreadableTrials: `${appendOnly.unreadable}/${appendOnly.trials}`,
                            },
                          },
                          {
                            id: 'denormalisation-produces-contradiction',
                            claim: 'An unnormalised memory store cannot be corrected atomically.',
                            evidence: {
                              meanRestatementsPerFact: c.anomaly.restatementsPerFact.mean,
                              maxRestatementsPerFact: c.anomaly.restatementsPerFact.max,
                              rowsToUpdateNormalised: 1,
                              staleFractionAfterTopKRepair: c.anomaly.topKRepair.staleFraction,
                            },
                          },
                        ],
                      }}
                    />
                  </div>
                }
              />

              <div style={{ marginTop: '2rem' }}>
                <StatStrip
                  stats={[
                    { value: num(s.memories), label: 'Memories in corpus' },
                    { value: String(s.engines), label: 'Architectures measured' },
                    { value: pct(s.structuralShare, 0), label: 'Queries needing SQL' },
                    { value: s.vecLexicalNdcg.toFixed(3), label: 'Vector nDCG on identifiers' },
                    { value: `${s.staleAfterRepair}`, unit: '%', label: 'Stale after top-k repair' },
                  ]}
                />
              </div>
              <p className="caption">
                All figures produced by <code>tools/capture.mjs</code> on {c.machine.cpu},{' '}
                {c.machine.cores} cores, {c.machine.totalMemGB} GB, {c.machine.platform}/{c.machine.arch}.
                Captured {captured}. Embeddings from{' '}
                <A href={R.minilm}>{c.toolchain.embeddingModel}</A> ({c.toolchain.embeddingDim} d);
                token counts from the {c.toolchain.tokenizer} tokenizer.
              </p>
            </section>

            {/* ------------------------------------------------ introduction */}
            <section id="introduction" className="section">
              <h2 className="heading-24">1. Introduction</h2>
              <div className="prose body">
                <p>
                  A language model has no memory. Each request is answered from the tokens in front
                  of it, and when the context window closes, everything in it is gone. An{' '}
                  <em>agent</em> — a model wrapped in a loop that runs over hours or months — has to
                  supply that memory from outside. It writes down what happened, and later it reads
                  some of it back.
                </p>
                <p>
                  Stated that way, the problem is immediately familiar. Records are inserted.
                  They are indexed so they can be found again. A query selects a subset under a
                  budget. Concurrent writers must not overwrite each other. A crash must not
                  leave the store asserting something that was never true. This is the problem
                  a database management system exists to solve, and it has been studied for
                  fifty years<Cite n={1} /><Cite n={3} />.
                </p>
                <p>
                  Agent frameworks have largely arrived at a different answer. Memory is usually
                  a file of JSON, or a vector index holding one embedding per remembered
                  utterance, retrieved by cosine similarity. Neither has a schema, a query
                  language, a transaction, or a recovery protocol. The question this paper asks
                  is direct: <strong>what does an agent lose by storing its memory outside a
                  DBMS, and which of the DBMS&apos;s properties actually matter?</strong>
                </p>
                <p>
                  We answer it by measurement rather than argument. We build one corpus of agent
                  memories with known ground truth, implement {s.engines} storage architectures
                  over it, and score them on the same {s.queries} queries — then subject the
                  same three families to a crash, to concurrent writers, and to a fact that
                  changes after it has been remembered {s.restatementsMean} times.
                </p>
              </div>

              <div style={{ marginTop: '1.75rem' }}>
                <MemoryLoopDiagram />
              </div>
              <p className="caption">
                Figure 1. The agent memory cycle. Every arrow crossing the store boundary is a
                database operation; the context-window budget on the recall path is what makes
                retrieval a top-<em>k</em> problem rather than a scan.
              </p>
            </section>

            {/* --------------------------------------------------- 2. memory */}
            <section id="memory" className="section">
              <h2 className="heading-24">2. What agent memory is</h2>
              <div className="prose body">
                <p>
                  The word covers three different things, and conflating them is the first source
                  of confusion. The division follows Tulving&apos;s<Cite n={12} /> and is now
                  standard in agent architectures<Cite n={13} />:
                </p>
                <ul style={{ paddingLeft: '1.15rem', margin: '0 0 1rem' }}>
                  {c.schema.entities.find((e) => e.specialization)?.specialization?.subtypes.map((t) => (
                    <li key={t.name} style={{ marginBottom: '0.375rem' }}>
                      <strong>{t.name}</strong> — {t.blurb}
                    </li>
                  ))}
                </ul>
                <p>
                  In the relational model these are not three stores. They are one relation with a
                  discriminator: a disjoint, total specialization on <code>kind</code>. That is a
                  design decision with consequences we return to in §4, and it is the first place
                  where having a data model at all changes what the system can do — a query can ask
                  for procedural memory only, and the engine can use an index to answer it.
                </p>
                <p>
                  What an agent actually writes is narrower than &ldquo;everything it saw&rdquo;.
                  In our corpus a memory is a short natural-language restatement of one fact,
                  produced during one turn of one session. It is roughly{' '}
                  {c.corpus.stats.meanTokensPerMemory} tokens. It carries a provenance
                  (<code>{c.corpus.sampleMemories[0]?.source}</code> and similar), a confidence,
                  a position in time, and — critically — it may later be contradicted by something
                  the agent learns afterwards.
                </p>
              </div>

              <div className="table-wrap" style={{ marginBlock: '1.75rem' }}>
                <table>
                  <caption>
                    Table 1. Six memories from the corpus, as stored. These are the rows every
                    architecture in this paper was given.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">id</th>
                      <th scope="col">session</th>
                      <th scope="col" className="n">turn</th>
                      <th scope="col">kind</th>
                      <th scope="col">body</th>
                      <th scope="col" className="n">day</th>
                      <th scope="col" className="n">tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.corpus.sampleMemories.map((m) => (
                      <tr key={m.id}>
                        <th scope="row" className="mono">{m.id}</th>
                        <td className="mono">{m.sessionId}</td>
                        <td className="n mono">{m.turn}</td>
                        <td className="mono">{m.kind}</td>
                        <td style={{ minWidth: '22rem' }}>{m.body}</td>
                        <td className="n mono">{m.day}</td>
                        <td className="n mono">{m.tokens}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ------------------------------------------------- 3. practice */}
            <section id="practice" className="section">
              <h2 className="heading-24">3. How agent memory is built today</h2>
              <div className="prose body">
                <p>
                  Two architectures dominate, and we implement both rather than describe them.
                </p>
                <p>
                  <strong>The file store.</strong> Memories are appended to a JSON or JSONL file
                  and recall reads the whole thing, scoring by keyword overlap. It has no index,
                  so recall is linear in the corpus; it has no transaction, so a crash mid-write is
                  whatever the filesystem left behind; and it has no concurrency control, so two
                  writers race. We implement the careful variant (append-only) and, for the
                  durability experiment, the common one (rewrite the whole document on every
                  change).
                </p>
                <p>
                  <strong>The vector index.</strong> Each memory is embedded once and recall is a
                  top-<em>k</em> nearest-neighbour search in that space<Cite n={9} />. This is the
                  architecture most often described as &ldquo;giving the agent memory&rdquo;, and
                  it is genuinely good at one thing: finding a memory that means the same as the
                  query while sharing none of its words. We implement it twice — once with no
                  filtering at all, and once with metadata post-filtering, because every production
                  vector store offers the latter and comparing against the former alone would be a
                  straw man.
                </p>
                <p>
                  Against these we put the same logical schema in two database engines: SQLite{' '}
                  {c.toolchain.sqlite} in process<Cite n={7} />, and PostgreSQL 18.3<Cite n={6} />{' '}
                  with the <A href={R.pgvector}>pgvector</A><Cite n={10} /> extension. Each family
                  is measured with progressively more indexing, so the paper can attribute a
                  result to an access method rather than to a product.
                </p>
              </div>

              <div style={{ marginTop: '1.75rem' }}>
                <CapabilityTable capture={c} n={2} />
              </div>

              <div className="prose body" style={{ marginTop: '1.5rem' }}>
                <p>
                  Table 2 is the paper&apos;s argument in one grid, and everything after it is the
                  measurement of what those columns are worth.
                </p>
              </div>
            </section>

            {/* ---------------------------------------------------- 4. model */}
            <section id="model" className="section">
              <h2 className="heading-24">4. The data model</h2>
              <div className="prose body">
                <p>
                  Before anything can be measured, the memory has to have a shape. We give it one
                  using the entity-relationship model<Cite n={2} />, then normalise it.
                </p>

                <h3 className="heading-20" style={{ marginTop: '1.75rem' }}>4.1 Entities and relationships</h3>
                <p>
                  Seven entities. The one that matters is <code>MEMORY</code>, and it is a{' '}
                  <strong>weak entity</strong>: a memory has no identity apart from the session
                  that produced it, so its natural key is{' '}
                  <code>(session_id, turn_no)</code> with <code>turn_no</code> as the partial key.
                  This is not a modelling nicety. A vector store treats each memory as a
                  free-floating document with a global identity, and every question of the form
                  &ldquo;what did I learn <em>in that session</em>&rdquo; becomes unanswerable as a
                  direct consequence.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <ErDiagram entities={c.schema.entities} relationships={c.schema.relationships} />
              </div>
              <p className="caption">
                Figure 2. The conceptual model in Chen notation, and the same model as tables.
                Both views are generated from <code>engines/schema.mjs</code> — the file the
                loaders execute — so every box is a table that was created and every dashed edge a
                foreign key that was enforced during measurement.
              </p>

              <div className="prose body" style={{ marginTop: '1.75rem' }}>
                <p>Three features of the diagram carry weight later:</p>
                <p>
                  <strong>The identifying relationship</strong> <em>records</em> is drawn double
                  because <code>SESSION</code> supplies part of <code>MEMORY</code>&apos;s key.
                  Participation is total on both ends: a memory without a session cannot exist.
                </p>
                <p>
                  <strong>The recursive relationship</strong> <em>supersedes</em> runs from{' '}
                  <code>MEMORY</code> to itself. It records that a later memory corrects an
                  earlier one, and it is the structure that distinguishes what the agent{' '}
                  <em>currently believes</em> from what it has <em>ever written down</em>. No
                  similarity function can recover it, because a superseded memory matches a query
                  at least as well as its replacement — usually better, since the replacement
                  carries the word &ldquo;correction&rdquo;.
                </p>
                <p>
                  <strong>The specialization</strong> on <code>kind</code> is disjoint and total:
                  every memory is exactly one of episodic, semantic or procedural.
                </p>

                <h3 className="heading-20" style={{ marginTop: '2.25rem' }}>4.2 Normalisation</h3>
                <p>
                  The file baselines store a self-contained record per memory: session metadata,
                  agent model, entity list and the restated fact all inline. That is the
                  unnormalised form, and walking it up to BCNF names exactly what each file
                  architecture is giving up.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <NormalizationLadder steps={c.schema.normalization} />
              </div>
              <p className="caption">
                Figure 3. From the unnormalised memory blob to BCNF. The final step is the one
                that decides an agent&apos;s behaviour rather than its disk usage:{' '}
                <code>fact_id → fact_text</code> is a dependency on a non-key attribute, and
                leaving it in place is what §6.10 measures.
              </p>

              <div className="prose body" style={{ marginTop: '1.75rem' }}>
                <p>
                  The functional dependencies that survive in the final schema are the ones a key
                  determines and nothing else:
                </p>
              </div>
              <div className="table-wrap" style={{ marginBlock: '1.25rem' }}>
                <table>
                  <caption>Table 3. Functional dependencies in the BCNF schema. Every determinant is a candidate key.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Relation</th>
                      <th scope="col">Determinant</th>
                      <th scope="col">Determines</th>
                      <th scope="col">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.schema.fds.map((f) => (
                      <tr key={`${f.in}-${f.lhs}`}>
                        <th scope="row" className="mono">{f.in}</th>
                        <td className="mono">{f.lhs}</td>
                        <td className="mono" style={{ fontSize: '0.8125rem' }}>{f.rhs}</td>
                        <td>{f.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ----------------------------------------------- 5. methodology */}
            <section id="method" className="section">
              <h2 className="heading-24">5. Methodology</h2>
              <div className="prose body">
                <h3 className="heading-20" style={{ marginTop: '1.5rem' }}>5.1 Ground truth that is not circular</h3>
                <p>
                  A retrieval benchmark is only as good as its labels, and labels chosen by looking
                  at results are worthless. We invert the usual order. First we build a world of
                  entities — services, incidents, configuration records, decisions, people. From it
                  we derive {num(s.facts)} <strong>facts</strong>, each a subject-predicate-object
                  triple with a validity interval. Each fact is then <em>rendered</em> into one or
                  more memories: short natural-language restatements an agent would plausibly have
                  written, in different surface forms, scattered across {num(s.sessions)} sessions.
                </p>
                <p>
                  Relevance is therefore definitional rather than judged: the memories relevant to
                  a query about a fact are exactly the memories rendered from that fact, intersected
                  with the query&apos;s structural predicate. Nothing is scored by eye. The
                  generator is seeded, so the corpus reproduces byte for byte.
                </p>
                <p>
                  Two deliberate contaminants make the benchmark hard. <strong>Distractors</strong>{' '}
                  ({num(c.corpus.stats.distractors)} memories, {pct(c.corpus.stats.distractors / s.memories, 0)}{' '}
                  of the corpus) mention a record&apos;s identifier while asserting nothing about
                  it — the agent-memory equivalent of &ldquo;checked X, unrelated&rdquo;. And{' '}
                  <strong>supersessions</strong> ({num(c.corpus.stats.superseded)} memories) revise
                  a fact after it was first recorded, so the best-matching text and the currently
                  true statement are different rows.
                </p>

                <h3 className="heading-20" style={{ marginTop: '1.75rem' }}>5.2 Query classes</h3>
                <p>
                  The {s.queries} queries are partitioned into {s.classCount} classes chosen to
                  stress different machinery. The column that matters is the last one: whether the
                  query can be answered by a top-<em>k</em> similarity search alone, with no
                  predicate, no join and no aggregate.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <ExpressibilityTable capture={c} n={4} />
              </div>

              <div className="prose body" style={{ marginTop: '1.75rem' }}>
                <h3 className="heading-20">5.3 Validating the corpus before using it</h3>
                <p>
                  A benchmark that claims &ldquo;lexical queries share identifiers and semantic
                  ones do not&rdquo; should demonstrate it rather than assert it, because if the
                  property fails, every downstream comparison measures nothing. Table 5 reports
                  what the corpus actually has.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <ValidationTable capture={c} n={5} />
              </div>

              <div className="prose body" style={{ marginTop: '1.75rem' }}>
                <p>
                  The design holds where it needs to. Lexical queries share the target&apos;s
                  identifier but sit at cosine{' '}
                  {c.corpus.validation.byClass.find((b) => b.class === 'lexical')!.meanCosine.toFixed(3)},
                  barely above the {c.corpus.validation.randomPairCosine} random-pair baseline —
                  they name the record without describing it. Semantic queries invert exactly that:
                  cosine {c.corpus.validation.byClass.find((b) => b.class === 'semantic')!.meanCosine.toFixed(3)}{' '}
                  with an identifier overlap of{' '}
                  {c.corpus.validation.byClass.find((b) => b.class === 'semantic')!.meanIdentifierOverlap.toFixed(2)}.
                  A retriever that wins one and loses the other is telling us about its access
                  method, which is the point.
                </p>

                <h3 className="heading-20" style={{ marginTop: '1.75rem' }}>5.4 Instrumentation</h3>
                <p>
                  One harness, <code>tools/capture.mjs</code>, drives every measurement into a
                  single JSON document. Engines return an ordered list of memory ids and nothing
                  else; precision, recall, MRR and nDCG are computed centrally, so no engine can
                  flatter itself. Latency is the median of three timed runs after a warm-up.
                  Embeddings are computed once and shared, so a retrieval difference can never be
                  an embedding difference. Storage is read from the engines&apos; own accounting —{' '}
                  <code>dbstat</code> for SQLite, <code>pg_class</code> for Postgres — not from
                  file sizes.
                </p>
                <p>
                  Both engines run without a server: SQLite through Node&apos;s built-in{' '}
                  <code>node:sqlite</code>, and PostgreSQL through <A href={R.pglite}>PGlite</A>
                  <Cite n={11} />, a genuine Postgres 18.3 build compiled to WebAssembly. The
                  whole study therefore reproduces from <code>npm install</code>, at the cost
                  discussed in §10.
                </p>
              </div>
            </section>

            {/* -------------------------------------------------- 6. results */}
            <section id="results" className="section">
              <h2 className="heading-24">6. Results</h2>

              <h3 className="heading-20" style={{ marginTop: '1.75rem' }}>6.1 Overall retrieval quality</h3>
              <div className="prose body">
                <p>
                  Aggregated over all {s.queries} queries at k={c.k}, the ordering is already
                  informative — and not the ordering the current literature would predict.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <EngineTable capture={c} n={6} />
              </div>

              <div className="grid-2" style={{ marginTop: '1.75rem' }}>
                <Figure
                  title="Overall retrieval quality"
                  meta={`nDCG@${c.k}, ${s.queries} queries`}
                  caption={<>Figure 4. Every arm on the same corpus and the same labels. The two pure-similarity arms are last.</>}
                >
                  <BarChart
                    unit=""
                    tableLabel="nDCG by engine"
                    format={(n) => n.toFixed(3)}
                    max={1}
                    data={live.map((e) => ({
                      label: e.short,
                      value: e.quality.overall.ndcg,
                      emphasis: e.id === s.best.id,
                    }))}
                  />
                </Figure>
                <Figure
                  title="Median recall latency"
                  meta="p50, log scale"
                  caption={<>Figure 5. The unindexed file scan is {s.scanSpeedup}× slower than an inverted index over the same {num(s.memories)} memories.</>}
                >
                  <BarChart
                    unit="ms"
                    tableLabel="p50 latency by engine"
                    format={(n) => n.toFixed(2)}
                    data={live.map((e) => ({
                      label: e.short,
                      value: e.quality.overall.p50Ms,
                      emphasis: e.id === 'sqlite-fts',
                    }))}
                  />
                </Figure>
              </div>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>
                6.2 The central result: quality depends on the question
              </h3>
              <div className="prose body">
                <p>
                  Aggregate scores hide the finding. Broken down by query class, the arms do not
                  merely differ in degree — the ordering inverts, and each architecture has classes
                  on which it is essentially unable to answer.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <HeatMatrix
                  rows={engineRows}
                  cols={classCols}
                  value={(r, col) =>
                    c.engines.find((e) => e.id === r)?.quality.byClass.find((b) => b.class === col)?.ndcg ?? null}
                  format={(n) => n.toFixed(2)}
                  legendLabel={`nDCG@${c.k}`}
                  caption="Columns marked “needs SQL” cannot be expressed as a top-k similarity search at all."
                />
              </div>
              <p className="caption">
                Figure 6. nDCG@{c.k} by engine and query class. Reading down a marked column shows
                what a predicate is worth; reading across the <code>{vec.short}</code> row shows
                what its absence costs.
              </p>

              <div className="prose body" style={{ marginTop: '1.75rem' }}>
                <p>
                  Three things happen in that grid.
                </p>
                <p>
                  <strong>Pure similarity collapses on structural questions.</strong> Averaged over
                  the {s.structuralClasses.length} classes requiring a predicate, join or
                  aggregate, {vec.short} reaches {s.vecStructuralMean.toFixed(3)} nDCG. Its
                  provenance score — &ldquo;everything I recorded during session S&rdquo; — is{' '}
                  {vec.quality.byClass.find((b) => b.class === 'provenance')!.ndcg.toFixed(3)},
                  because the question has no similarity content whatsoever. The answer is defined
                  by a foreign key.
                </p>
                <p>
                  <strong>The same index inside a DBMS recovers most of it.</strong>{' '}
                  {hnsw.short} uses the identical embeddings and an HNSW graph, and averages{' '}
                  {s.hnswStructuralMean.toFixed(3)} on those classes — reaching{' '}
                  {hnsw.quality.byClass.find((b) => b.class === 'provenance')!.ndcg.toFixed(3)} on
                  provenance, because the planner applies the predicate and the vector index is
                  simply not consulted. What changed is not the retrieval; it is that a query
                  language existed to state the constraint.
                </p>
                <p>
                  <strong>Adding a vector index can make things worse.</strong> On{' '}
                  <em>currency</em> — &ldquo;what is the current position on X&rdquo; — the
                  B-tree arms score{' '}
                  {engine('sqlite-btree').quality.byClass.find((b) => b.class === 'currency')!.ndcg.toFixed(3)},
                  because <code>superseded_by IS NULL</code> is exactly the right answer. The
                  hybrid arms score{' '}
                  {hybrid.quality.byClass.find((b) => b.class === 'currency')!.ndcg.toFixed(3)}:
                  rank fusion re-ranks away from a filter that was already correct. Hybrid retrieval
                  is not uniformly better, and treating it as a default costs accuracy on precisely
                  the questions a predicate settles.
                </p>
                <p>
                  The <em>aggregate</em> class makes the point without any ranking at all. Asked
                  how many times a fact was recorded, {s.exactCountEngines} of the {s.engines} arms
                  return the exact cardinality — every arm with a{' '}
                  <code>SELECT COUNT(*) … GROUP BY</code>. The file arms return none, and cannot:
                  a top-<em>k</em> list truncated at {c.k} is the wrong shape of answer to a
                  counting question.
                </p>
              </div>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>
                6.3 Why dense retrieval fails on identifiers
              </h3>
              <div className="prose body">
                <p>
                  The lexical column deserves its own explanation, because a score of{' '}
                  {s.vecLexicalNdcg.toFixed(3)} invites the reader to assume a bug. It is not a
                  bug, and the mechanism is worth seeing.
                </p>
                <p>
                  In {pct(s.denseDistractorRate ?? 0, 0)} of probed queries, the memory the
                  embedding ranked first was a <em>distractor</em> — a record that mentions the
                  identifier while explicitly disclaiming it. The memory that actually answered the
                  question sat at a median rank of {s.denseFirstRank} out of {num(s.memories)}.
                </p>
                <p>
                  The reason is structural. &ldquo;What do we know about ADR-297?&rdquo; is a
                  question <em>about a lookup</em>, and the distractor is a sentence{' '}
                  <em>about a lookup</em>. They share their grammatical shape, which is most of
                  what survives mean-pooling into {c.toolchain.embeddingDim} dimensions. The
                  identifier itself is a handful of subword pieces averaged in with everything
                  else, and it carries almost no weight. An inverted index has the opposite bias:
                  a rare term is the most informative thing in the query, which is why the same
                  corpus yields {s.ftsLexicalNdcg.toFixed(3)} nDCG for BM25.
                </p>
              </div>

              <div className="print-omit" style={{ marginTop: '1.75rem' }}>
                <DenseFailureExplainer capture={c} />
              </div>

              <div style={{ marginTop: '1.75rem' }}>
                <IndexAnatomyDiagram />
              </div>
              <p className="caption">
                Figure 7. What each access method physically is, and the question shape it cannot
                answer. The per-class results in Figure 6 follow from these three structures.
              </p>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>
                6.4 Metadata filtering does not close the gap
              </h3>
              <div className="prose body">
                <p>
                  The obvious objection to §6.2 is that production vector stores support metadata
                  filters. They do — but as a <em>post</em>-filter over an already-ranked candidate
                  list, and that is a different operation from a predicate the planner may apply
                  first.
                </p>
                <p>
                  With no overfetch, asking for {c.k} results returns{' '}
                  {pf1.meanSurvivingSlots} on average: {pct(pf1.slotFillRate, 1)} of the requested
                  slots are filled, because the filter can only remove candidates, never introduce
                  them. Raising the overfetch factor helps, but slowly and at a price — at ×
                  {pfLast.overfetch} the search touches {pct(pfLast.scanFraction, 1)} of the corpus
                  to reach recall {pfLast.recall.toFixed(3)}, which is to say it is becoming the
                  sequential scan the index was adopted to avoid.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <PostFilterDiagram capture={c} />
              </div>
              <p className="caption">
                Figure 8. Post-filtering against a selective predicate. The slots are allocated by
                similarity before the constraint is consulted, so the constraint can only empty them.
              </p>

              <div style={{ marginTop: '1.75rem' }}>
                <PostFilterTable capture={c} n={7} />
              </div>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>
                6.5 What the planner actually did
              </h3>
              <div className="prose body">
                <p>
                  The claim that a DBMS &ldquo;uses an index&rdquo; is checkable. Both engines
                  report their plans, and the harness captures one per query class per engine.
                  Two are worth reading side by side.
                </p>
              </div>

              <div className="grid-2" style={{ marginTop: '1.5rem' }}>
                <div className="code-block">
                  <div className="code-head">
                    <span>{gin.short} · provenance</span>
                    <span>EXPLAIN ANALYZE</span>
                  </div>
                  <pre><code>{gin.plans.find((p) => p.class === 'provenance')?.text ?? '—'}</code></pre>
                </div>
                <div className="code-block">
                  <div className="code-head">
                    <span>{fts.short} · provenance</span>
                    <span>EXPLAIN QUERY PLAN</span>
                  </div>
                  <pre><code>{fts.plans.find((p) => p.class === 'provenance')?.text ?? '—'}</code></pre>
                </div>
              </div>
              <p className="caption">
                Figure 9. The same question, two engines. Both resolve the session predicate through
                a B-tree rather than scanning, which is why both answer a class the similarity arms
                score near zero on.
              </p>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>6.6 Storage economics</h3>
              <div className="prose body">
                <p>
                  The corpus is {bytes(c.corpus.stats.bytes)} of text. What the architectures cost
                  to store it varies by more than an order of magnitude, and the reason is entirely
                  the embeddings.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <StorageStackDiagram capture={c} />
              </div>
              <p className="caption">
                Figure 10. Bytes by role. At {c.toolchain.embeddingDim} dimensions in float32, one
                vector is {c.toolchain.embeddingDim * 4} bytes — larger than the memory it
                describes, which averages {c.corpus.stats.meanTokensPerMemory} tokens.
              </p>

              <div style={{ marginTop: '1.75rem' }}>
                <StorageTable capture={c} n={8} />
              </div>

              <div className="prose body" style={{ marginTop: '1.75rem' }}>
                <p>
                  {fts.label} holds the corpus in {fts.bytesPerMemory} bytes per memory;{' '}
                  {hybrid.label} needs {hybrid.bytesPerMemory}, a factor of {s.vectorOverhead}. For
                  an agent whose memory grows monotonically, that ratio is the difference between a
                  store that fits on the machine and one that does not — and §6.2 shows the
                  vectors buying quality on one class out of {s.classCount}.
                </p>
              </div>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>6.7 Durability under crash</h3>
              <div className="prose body">
                <p>
                  Retrieval quality is the interesting half of the problem; not losing the memory
                  is the necessary half. We killed each writer with an uncatchable signal partway
                  through sustained writes, then reopened the store and asked what survived. The
                  clock starts only after the store holds a durable baseline, so this measures a
                  crash during writing rather than during initialisation.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <DurabilityTable capture={c} n={9} />
              </div>

              <div className="prose body" style={{ marginTop: '1.75rem' }}>
                <p>
                  The honest result is that <strong>append-only files are fine</strong>. Across{' '}
                  {appendOnly.trials} kills the JSONL store never lost a parseable line: appending
                  is close to atomic at these sizes, and the failure mode is a missing tail rather
                  than a corrupt file.
                </p>
                <p>
                  The common file pattern is not fine. Holding memory as one JSON document and
                  rewriting it on every change means the file is briefly neither the old state nor
                  the new one — and in {rewrite.unreadable} of {rewrite.trials} trials the crash
                  landed inside that window and left a document that no longer parses. The loss is
                  not the last record. It is all {num(rewrite.meanDurable)} of them, because the
                  store is a single value.
                </p>
                <p>
                  Both DBMS arms recovered to a committed boundary in every trial, with SQLite&apos;s{' '}
                  <code>integrity_check</code> returning{' '}
                  <code>{c.durability.find((d) => d.kind === 'sqlite')?.integrity ?? 'ok'}</code>{' '}
                  and Postgres replaying its write-ahead log<Cite n={4} /> on open. This is not a
                  surprising result; it is a fifty-year-old result<Cite n={5} />. It is included
                  because the architecture that gets it wrong is the one currently in widest use.
                </p>
              </div>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>6.8 Concurrency</h3>
              <div className="prose body">
                <p>
                  Agents increasingly run as fleets sharing one memory. We ran{' '}
                  {c.concurrency.writers} concurrent writers performing{' '}
                  {c.concurrency.rounds} increments each on the same record, in-process for every
                  family so the result isolates the concurrency-control mechanism rather than the
                  deployment model.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <ConcurrencyTable capture={c} n={10} />
              </div>

              <div className="prose body" style={{ marginTop: '1.75rem' }}>
                <p>
                  The file store lost {s.lostUpdates} of{' '}
                  {c.concurrency.results.file.expected} updates — {s.lostUpdatePct}%. It is the
                  textbook lost-update anomaly<Cite n={3} />, and it arrives here for the textbook
                  reason: read the document, modify a field, write the document back, and whoever
                  writes last erases everyone else. Both DBMS arms lost nothing, expressing the
                  same edit as a single statement whose atomicity the engine guarantees.
                </p>
              </div>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>
                6.9 The normalisation anomaly, as contradiction
              </h3>
              <div className="prose body">
                <p>
                  This is where the database-theory chapter stops being theoretical. In our corpus
                  a fact is restated across {c.anomaly.restatementsPerFact.mean} memories on
                  average and up to {c.anomaly.restatementsPerFact.max}. When the fact changes, a
                  normalised schema updates one row in <code>FACT</code>. A denormalised store must
                  find and rewrite every restatement.
                </p>
                <p>
                  An agent does not rewrite every restatement. It rewrites what it retrieved — at
                  most {c.anomaly.topKRepair.k} rows. Across{' '}
                  {c.anomaly.topKRepair.factsProbed} probed facts a top-{c.anomaly.topKRepair.k}{' '}
                  repair reached {c.anomaly.topKRepair.meanReached} of{' '}
                  {c.anomaly.topKRepair.meanTotal} restatements, leaving{' '}
                  <strong>{s.staleAfterRepair}% still asserting the old value</strong>.
                </p>
                <p>
                  Those rows do not sit inertly on disk. They match the same queries they always
                  did, so the agent retrieves them, reads them as confident statements of fact, and
                  acts on them. An update anomaly in an agent&apos;s memory does not present as a
                  data-quality metric. It presents as an agent that contradicts itself.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <AnomalyTable capture={c} n={11} />
              </div>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>6.10 The context-window budget</h3>
              <div className="prose body">
                <p>
                  Retrieval is not free at the point of use. Everything returned is pasted into a
                  context window and paid for per token, so the right question is not &ldquo;which
                  arm scores highest&rdquo; but &ldquo;which arm scores highest per token
                  spent&rdquo;.
                </p>
              </div>

              <div style={{ marginTop: '1.5rem' }}>
                <Figure
                  title="Quality against context cost"
                  meta={`k ∈ {${fts.budget.map((b) => b.k).join(', ')}}`}
                  caption={<>Figure 11. Each line is one architecture swept over k. Up and to the left is better: more quality for fewer tokens.</>}
                  full
                >
                  <ParetoChart
                    xLabel="Mean tokens returned"
                    yLabel={`nDCG@k`}
                    series={live.map((e) => ({
                      id: e.id,
                      label: e.short,
                      emphasis: e.id === 'sqlite-fts' || e.id === s.best.id,
                      points: e.budget.map((b) => ({ x: b.meanTokens, y: b.ndcg, k: b.k })),
                    }))}
                  />
                </Figure>
              </div>

              <div className="print-omit" style={{ marginTop: '1.75rem' }}>
                <BudgetExplorer capture={c} />
              </div>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>6.11 Scaling</h3>
              <div className="prose body">
                <p>
                  Every architecture was rebuilt and re-measured at{' '}
                  {c.scaling.map((r) => num(r.memories)).join(', ')} memories. The unindexed arms
                  degrade linearly, as they must; the indexed arms do not.
                </p>
              </div>

              <div className="grid-2" style={{ marginTop: '1.5rem' }}>
                <Figure
                  title="Recall latency against corpus size"
                  meta="p50, log-log"
                  caption={<>Figure 12. A scan is linear in the corpus. An index is not.</>}
                >
                  <ScalingChart
                    logX
                    logY
                    xLabel="Memories"
                    yLabel="p50 latency (ms)"
                    formatY={(n) => (n < 1 ? n.toFixed(2) : n.toFixed(0))}
                    series={['file-jsonl', 'file-vec', 'sqlite-fts', 'sqlite-hybrid', 'pg-gin', 'pg-hybrid']
                      .map((id) => ({
                        id,
                        label: c.engines.find((e) => e.id === id)?.short ?? id,
                        emphasis: id === 'sqlite-fts',
                        points: c.scaling
                          .map((r) => {
                            const e = r.engines.find((x) => x.id === id)
                            return e?.p50Ms != null ? { x: r.memories, y: e.p50Ms } : null
                          })
                          .filter((p): p is { x: number; y: number } => p !== null),
                      }))}
                  />
                </Figure>
                <Figure
                  title="Bytes per memory against corpus size"
                  meta="log-linear"
                  caption={<>Figure 13. Per-memory storage is roughly constant; the gap between arms is the embedding, not the data.</>}
                >
                  <ScalingChart
                    logX
                    xLabel="Memories"
                    yLabel="Bytes per memory"
                    series={['file-jsonl', 'sqlite-fts', 'sqlite-hybrid', 'pg-gin', 'pg-hybrid']
                      .map((id) => ({
                        id,
                        label: c.engines.find((e) => e.id === id)?.short ?? id,
                        emphasis: id === 'pg-hybrid',
                        points: c.scaling
                          .map((r) => {
                            const e = r.engines.find((x) => x.id === id)
                            return e?.bytesPerMemory != null ? { x: r.memories, y: e.bytesPerMemory } : null
                          })
                          .filter((p): p is { x: number; y: number } => p !== null),
                      }))}
                  />
                </Figure>
              </div>

              <div style={{ marginTop: '1.75rem' }}>
                <ScalingTable capture={c} n={12} />
              </div>

              <div className="prose body" style={{ marginTop: '1.75rem' }}>
                <p>
                  The ingest side carries the opposite lesson. Building an inverted index is
                  cheap; building an HNSW graph is not, and neither is writing{' '}
                  {c.toolchain.embeddingDim}-dimensional vectors through a query protocol. That
                  cost is paid once per memory rather than once per recall, which is the right
                  trade for a store written far less often than it is read — but it is not free,
                  and for a memory that is written on every turn it is the dominant term.
                </p>
              </div>
            </section>

            {/* -------------------------------------------------------- 7. */}
            <section id="sql" className="section">
              <h2 className="heading-24">7. Retrieval as a query, not as code</h2>
              <div className="prose body">
                <p>
                  One result deserves separating from the measurements, because it is about what
                  the architecture makes <em>expressible</em> rather than what it makes fast.
                </p>
                <p>
                  Hybrid retrieval is normally application code: run the keyword search, run the
                  vector search, merge the two ranked lists, apply the filters, return the top{' '}
                  <em>k</em>. In the Postgres arm none of that code exists. The entire strategy —
                  both indexes, the structural predicate, reciprocal rank fusion<Cite n={8} /> and
                  the truncation — is one statement the planner optimises as a unit.
                </p>
              </div>

              <div className="code-block" style={{ marginTop: '1.5rem' }}>
                <div className="code-head">
                  <span>{hybrid.label} — the whole retrieval strategy</span>
                  <span>generated by engines/postgres.mjs</span>
                </div>
                <pre><code>{hybrid.plans.find((p) => p.class === 'temporal')?.sql
                  ?? hybrid.plans.find((p) => p.sql)?.sql ?? '—'}</code></pre>
              </div>

              <div className="prose body" style={{ marginTop: '1.5rem' }}>
                <p>
                  This matters for a reason beyond elegance. Retrieval strategy is the part of an
                  agent that changes most often — a new filter, a different weighting, a
                  recency term. Expressed as a query it is data the engine re-plans against current
                  statistics. Expressed as application code it is a merge loop that has to be
                  rewritten, re-tested, and kept consistent with whatever the store is doing.
                </p>
              </div>
            </section>

            {/* --------------------------------------------------- 8. explore */}
            <section id="explore" className="section print-omit">
              <h2 className="heading-24">8. Explore the evidence</h2>
              <div className="prose body">
                <p>
                  The three panels below are the dataset rather than a summary of it: the recorded
                  output of each architecture on each query class, the schema as measured, and the
                  quality-per-token trade at every k.
                </p>
              </div>

              <div style={{ marginTop: '1.75rem' }}>
                <QueryClassExplorer capture={c} />
              </div>

              <h3 className="heading-20" style={{ marginTop: '2.5rem' }}>8.1 The schema, as executed</h3>
              <div style={{ marginTop: '1.25rem' }}>
                <SchemaBrowser capture={c} />
              </div>
            </section>

            <section className="section print-only" aria-hidden="true">
              <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
                <QrCode size={112} />
                <div style={{ minWidth: 0 }}>
                  <h2 className="heading-24" style={{ marginBottom: '0.5rem' }}>Section 8 is interactive</h2>
                  <p className="body" style={{ margin: '0 0 0.625rem', maxWidth: '46ch' }}>
                    The query-class explorer, the dense-retrieval forensics and the schema browser
                    are things you operate rather than read. Scan the code, or visit{' '}
                    <strong>{AUTHORS.site}</strong>.
                  </p>
                </div>
              </div>
            </section>

            {/* ----------------------------------------------- 9. discussion */}
            <section id="discussion" className="section">
              <h2 className="heading-24">9. Discussion</h2>
              <div className="prose body">
                <h3 className="heading-20" style={{ marginTop: '1.5rem' }}>
                  9.1 A vector index is not a memory system
                </h3>
                <p>
                  The strongest reading of our results is not that vector search is bad. On
                  paraphrase it is the best tool available, and it is the only arm that finds a
                  memory sharing no words with the query. The error is one of scope: a vector index
                  is <em>one access method</em>, and agent memory needs several.
                </p>
                <p>
                  {pct(s.structuralShare, 1)} of our workload is decided by a predicate, a join or
                  an aggregate. Those are not exotic queries — they are &ldquo;what did we decide
                  before the migration&rdquo;, &ldquo;what came out of that session&rdquo;,
                  &ldquo;what is still true&rdquo;, &ldquo;how many times did this come up&rdquo;.
                  A system whose only operation is top-<em>k</em> similarity cannot express them,
                  and the failure is silent: it returns ten plausible memories and no indication
                  that the question was not the one it answered.
                </p>

                <h3 className="heading-20" style={{ marginTop: '1.75rem' }}>
                  9.2 What a DBMS actually contributes
                </h3>
                <p>
                  Our results separate into two kinds, and they are worth keeping apart.
                </p>
                <p>
                  The <strong>retrieval</strong> results are contingent. They depend on our corpus,
                  our embedding model and our query mix; a different domain would move them.
                  A reader is entitled to discount them.
                </p>
                <p>
                  The <strong>integrity</strong> results are not contingent in the same way. A
                  store with no transaction will lose concurrent updates; a store that rewrites a
                  single document has no commit boundary to recover to; a store that repeats a
                  fact in {c.anomaly.restatementsPerFact.mean} places cannot correct it atomically.
                  These follow from the architecture, not from the workload. They are also the
                  results that current practice most consistently ignores.
                </p>

                <h3 className="heading-20" style={{ marginTop: '1.75rem' }}>
                  9.3 The recommendation is smaller than &ldquo;use Postgres&rdquo;
                </h3>
                <p>
                  {s.best.label} scored highest overall at {s.bestNdcg.toFixed(3)}. We would not
                  recommend it as a default. {fts.label} reached{' '}
                  {fts.quality.overall.ndcg.toFixed(3)} — {pct(1 - fts.quality.overall.ndcg / s.bestNdcg, 1)}{' '}
                  lower — at {ms(fts.quality.overall.p50Ms)} median latency, {s.vectorOverhead}×
                  less storage, no embedding model and no server. For a single agent on one
                  machine that is the better engineering.
                </p>
                <p>
                  The case for the server arm is the case for concurrency, for a real planner, and
                  for expressing retrieval as a query rather than as code. The case for the vectors
                  is narrower still: they earn their {s.vectorOverhead}× storage on paraphrase
                  recall and, on our corpus, nowhere else.
                </p>
                <p>
                  The general lesson is the one the normalisation ladder in §4.2 already states.
                  Agent memory has a schema whether or not anyone writes it down. Writing it down
                  is what makes the questions answerable.
                </p>
              </div>
            </section>

            {/* --------------------------------------------- 10. limitations */}
            <section id="limitations" className="section">
              <h2 className="heading-24">10. Threats to validity</h2>
              <div className="prose body">
                <p>
                  <strong>The corpus is synthetic.</strong> This is the most important caveat.
                  Real agent transcripts are private, and non-circular relevance labels require
                  knowing which fact each memory restates — which means generating the memories
                  from the facts. We accept the trade and mitigate it by validating the corpus
                  before using it (§5.3, Table 5) rather than assuming its properties. Absolute
                  scores should not be read as predictions for any deployed system; the
                  comparison between arms on identical data is what we claim.
                </p>
                <p>
                  <strong>The distractors are adversarial by construction.</strong>{' '}
                  {pct(c.corpus.stats.distractors / s.memories, 0)} of the corpus mentions an
                  identifier while asserting nothing about it, and those records share the
                  grammatical shape of a lookup question. That design is why dense retrieval scores
                  as low as it does on the lexical class. We think the pattern is realistic —
                  agents write &ldquo;checked X, unrelated&rdquo; constantly — but a corpus without
                  it would narrow the gap, and the {s.vecLexicalNdcg.toFixed(3)} figure should be
                  read as the behaviour under adversarial-but-plausible distractors rather than a
                  universal constant.
                </p>
                <p>
                  <strong>One embedding model, one dimensionality.</strong> All similarity results
                  use {c.toolchain.embeddingModel} at {c.toolchain.embeddingDim} dimensions. A
                  larger model, or one trained with identifier-aware objectives, would score better
                  on the lexical class. The structural classes would not move at all, because their
                  failure is representational rather than a matter of embedding quality.
                </p>
                <p>
                  <strong>PGlite is Postgres in WebAssembly.</strong> The SQL semantics, planner,
                  MVCC and WAL are genuine PostgreSQL 18.3, which is what our correctness claims
                  rest on. The absolute latencies are not those of a native server: WASM is slower
                  and single-threaded, so the Postgres arms are penalised on timing relative to a
                  real deployment. Where we compare engines on latency we say so; the structural
                  results do not depend on it.
                </p>
                <p>
                  <strong>Concurrency was measured in-process.</strong> Running the file store
                  across processes and PGlite in one would have confounded concurrency control with
                  the deployment model. The lost-update result therefore isolates the mechanism,
                  and says nothing about throughput under real multi-process contention.
                </p>
                <p>
                  <strong>Recency happens to substitute for currency.</strong> The file arm scores
                  well on the currency class, but not because it models supersession — it breaks
                  ties by recency, and in our corpus the correction is always the newest memory.
                  That coincidence is a property of the generator. It would fail the moment a
                  superseded memory were touched again, and the arm has no way to express the
                  constraint that would make it robust.
                </p>
                <p>
                  <strong>Single machine, single run.</strong> All measurements come from one
                  {' '}{c.machine.cores}-core machine on {c.machine.platform}/{c.machine.arch}.
                  Latency medians are over three timed runs per query; they are not a substitute
                  for a benchmarking harness with isolation and repetition across machines.
                </p>
              </div>
            </section>

            {/* ------------------------------------------------- 11. related */}
            <section id="related" className="section">
              <h2 className="heading-24">11. Related work</h2>
              <div className="prose body">
                <p>
                  The database side of this paper is textbook and deliberately so. The relational
                  model<Cite n={1} />, the entity-relationship model<Cite n={2} />, normalisation
                  and the transaction<Cite n={3} /> are settled results; our contribution is
                  applying them to a workload that has grown up without them, and measuring what
                  their absence costs. Recovery follows ARIES<Cite n={5} />; the ranking baseline
                  is BM25<Cite n={14} />; fusion uses reciprocal rank fusion with the original
                  constant rather than a tuned one<Cite n={8} />, since a tuned constant would let
                  the hybrid arm win by fitting our corpus.
                </p>
                <p>
                  On the agent side, retrieval-augmented generation<Cite n={15} /> established the
                  pattern of fetching text into a context window, and the systems that followed —
                  MemGPT<Cite n={16} /> with its paged memory hierarchy, and the generative-agent
                  architecture<Cite n={13} /> with its retrieval scored on recency, importance and
                  relevance — both treat memory as a storage problem. Neither is evaluated as a
                  database: we are not aware of prior work measuring agent memory for durability
                  under crash, for lost updates under concurrent writers, or for the update anomaly
                  that follows from storing an unnormalised fact.
                </p>
                <p>
                  Approximate nearest-neighbour search over HNSW<Cite n={9} /> and its integration
                  into a relational engine through pgvector<Cite n={10} /> are what make the hybrid
                  arm possible at all; the observation that filtered vector search interacts badly
                  with post-filtering is known in that literature, and §6.4 quantifies it for this
                  workload.
                </p>
              </div>
            </section>

            {/* ---------------------------------------------- 12. conclusion */}
            <section id="conclusion" className="section">
              <h2 className="heading-24">12. Conclusion</h2>
              <div className="prose body">
                <p>
                  An agent&apos;s memory is a database, and building it without one costs more than
                  performance. Across {s.engines} architectures on {num(s.memories)} memories and{' '}
                  {s.queries} labelled queries we find that {pct(s.structuralShare, 1)} of a
                  realistic recall workload cannot be expressed as similarity search at all; that
                  dense retrieval is near-random on the identifier queries agents ask most
                  ({s.vecLexicalNdcg.toFixed(3)} against {s.ftsLexicalNdcg.toFixed(3)} nDCG for an
                  inverted index); that eight concurrent writers cost a file store{' '}
                  {s.lostUpdatePct}% of its updates while costing both DBMS arms nothing; and that
                  a fact restated {c.anomaly.restatementsPerFact.mean} times cannot be corrected by
                  retrieval, leaving {s.staleAfterRepair}% of its restatements contradicting the
                  agent&apos;s current belief.
                </p>
                <p>
                  None of the database results are new. Codd<Cite n={1} />, Chen<Cite n={2} /> and
                  Gray<Cite n={3} /> settled them decades ago. What is new is the setting: a class
                  of system that writes records, indexes them, queries them under a budget and must
                  survive a crash — and that has largely been built as though none of that work had
                  happened. The useful contribution of this paper is not a new architecture. It is
                  a measurement of how much the old one is still worth.
                </p>
              </div>
            </section>

            {/* -------------------------------------------------- references */}
            <section id="references" className="section">
              <h2 className="heading-24">References</h2>
              <ol className="prose" style={{ paddingLeft: '1.25rem', fontSize: '0.9375rem', lineHeight: 1.65 }}>
                <li id="ref-1" style={{ marginBottom: '0.75rem' }}>
                  E. F. Codd. <em>A Relational Model of Data for Large Shared Data Banks.</em>{' '}
                  Communications of the ACM 13(6), 1970. <A href={R.codd}>dl.acm.org</A>
                </li>
                <li id="ref-2" style={{ marginBottom: '0.75rem' }}>
                  P. P.-S. Chen. <em>The Entity-Relationship Model — Toward a Unified View of Data.</em>{' '}
                  ACM TODS 1(1), 1976. <A href={R.chen}>dl.acm.org</A>
                </li>
                <li id="ref-3" style={{ marginBottom: '0.75rem' }}>
                  J. Gray, A. Reuter. <em>Transaction Processing: Concepts and Techniques.</em>{' '}
                  Morgan Kaufmann, 1993. <A href={R.gray}>dl.acm.org</A>
                </li>
                <li id="ref-4" style={{ marginBottom: '0.75rem' }}>
                  The PostgreSQL Global Development Group. <em>Write-Ahead Logging (WAL).</em>{' '}
                  PostgreSQL 18 documentation. <A href={R.wal}>postgresql.org</A>
                </li>
                <li id="ref-5" style={{ marginBottom: '0.75rem' }}>
                  C. Mohan et al. <em>ARIES: A Transaction Recovery Method Supporting Fine-Granularity
                  Locking and Partial Rollbacks Using Write-Ahead Logging.</em> ACM TODS 17(1), 1992.{' '}
                  <A href={R.aries}>dl.acm.org</A>
                </li>
                <li id="ref-6" style={{ marginBottom: '0.75rem' }}>
                  The PostgreSQL Global Development Group. <em>PostgreSQL 18 documentation.</em>{' '}
                  <A href={R.postgres}>postgresql.org/docs/18</A>. Measured build:{' '}
                  <span className="mono" style={{ fontSize: '0.8125rem' }}>{c.toolchain.postgres}</span>
                </li>
                <li id="ref-7" style={{ marginBottom: '0.75rem' }}>
                  SQLite Consortium. <em>SQLite {c.toolchain.sqlite}</em>, and{' '}
                  <A href={R.fts5}>FTS5 full-text search</A>. <A href={R.sqlite}>sqlite.org</A>
                </li>
                <li id="ref-8" style={{ marginBottom: '0.75rem' }}>
                  G. V. Cormack, C. L. A. Clarke, S. Buettcher. <em>Reciprocal Rank Fusion Outperforms
                  Condorcet and Individual Rank Learning Methods.</em> SIGIR 2009.{' '}
                  <A href={R.rrf}>dl.acm.org</A>
                </li>
                <li id="ref-9" style={{ marginBottom: '0.75rem' }}>
                  Y. A. Malkov, D. A. Yashunin. <em>Efficient and Robust Approximate Nearest Neighbor
                  Search Using Hierarchical Navigable Small World Graphs.</em> 2016.{' '}
                  <A href={R.hnsw}>arXiv:1603.09320</A>
                </li>
                <li id="ref-10" style={{ marginBottom: '0.75rem' }}>
                  A. Kane et al. <em>pgvector — open-source vector similarity search for Postgres.</em>{' '}
                  <A href={R.pgvector}>github.com/pgvector/pgvector</A>. Build {c.toolchain.pgvector}.
                </li>
                <li id="ref-11" style={{ marginBottom: '0.75rem' }}>
                  ElectricSQL. <em>PGlite — PostgreSQL packaged as WebAssembly.</em>{' '}
                  <A href={R.pglite}>pglite.dev</A>. Version {c.toolchain.pglite}.
                </li>
                <li id="ref-12" style={{ marginBottom: '0.75rem' }}>
                  E. Tulving. <em>Episodic and Semantic Memory.</em> In <em>Organization of Memory</em>,
                  Academic Press, 1972. <A href={R.tulving}>alicekim.ca</A>
                </li>
                <li id="ref-13" style={{ marginBottom: '0.75rem' }}>
                  J. S. Park et al. <em>Generative Agents: Interactive Simulacra of Human Behavior.</em>{' '}
                  UIST 2023. <A href={R.generative}>arXiv:2304.03442</A>
                </li>
                <li id="ref-14" style={{ marginBottom: '0.75rem' }}>
                  S. Robertson, H. Zaragoza. <em>The Probabilistic Relevance Framework: BM25 and Beyond.</em>{' '}
                  Foundations and Trends in Information Retrieval, 2009. <A href={R.bm25}>city.ac.uk</A>
                </li>
                <li id="ref-15" style={{ marginBottom: '0.75rem' }}>
                  P. Lewis et al. <em>Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.</em>{' '}
                  NeurIPS 2020. <A href={R.rag}>arXiv:2005.11401</A>
                </li>
                <li id="ref-16" style={{ marginBottom: '0.75rem' }}>
                  C. Packer et al. <em>MemGPT: Towards LLMs as Operating Systems.</em> 2023.{' '}
                  <A href={R.memgpt}>arXiv:2310.08560</A>
                </li>
                <li id="ref-17">
                  R. Elmasri, S. B. Navathe. <em>Fundamentals of Database Systems.</em> 7th ed.,
                  Pearson, 2016. <A href={R.elmasri}>pearson.com</A> · R. Ramakrishnan, J. Gehrke.{' '}
                  <em>Database Management Systems.</em> 3rd ed., McGraw-Hill, 2003.{' '}
                  <A href={R.ramakrishnan}>cs.wisc.edu</A>
                </li>
              </ol>
            </section>

            {/* ---------------------------------------------------- appendix */}
            <section id="appendix" className="section">
              <h2 className="heading-24">Appendix A. Reproduction</h2>
              <div className="prose body">
                <p>
                  Everything regenerates from one command. No database server, no API key and no
                  network access at measurement time — the embedding model and both engines are
                  local.
                </p>
              </div>
              <div style={{ maxWidth: 720, marginTop: '1rem' }}>
                <div className="code-block">
                  <div className="code-head"><span>regenerate everything</span></div>
                  <pre><code>{`git clone https://github.com/HKTITAN/dbms-agent-memory
cd dbms-agent-memory && npm install

npm run paper   # corpus -> embed -> capture -> qr -> build -> pdf -> epub`}</code></pre>
                </div>
              </div>

              <div className="prose body" style={{ marginTop: '1.5rem' }}>
                <p>
                  <code>npm run capture</code> alone rebuilds the dataset every figure reads.
                  It runs the {s.engines} architectures over the main corpus, the post-filter
                  sweep, the scaling sweep at {c.scaling.length} sizes, the crash trials, the
                  lost-update test and the anomaly probe, and writes{' '}
                  <code>data/capture.json</code>. Total runtime is dominated by the Postgres arms.
                </p>
              </div>

              <h3 className="heading-20" style={{ marginTop: '2rem' }}>Appendix B. Schema DDL</h3>
              <div className="prose body">
                <p>
                  Generated from <code>engines/schema.mjs</code> — the same declaration the ER
                  diagram in Figure 2 renders from, so the diagram and the executed schema cannot
                  disagree.
                </p>
              </div>
              <div className="code-block" style={{ marginTop: '1rem' }}>
                <div className="code-head">
                  <span>PostgreSQL</span>
                  <span>{c.schema.entities.length} relations, {c.schema.secondaryIndexes.length} secondary indexes</span>
                </div>
                <pre><code>{c.schema.ddl.postgres.join(';\n\n') + ';\n\n'
                  + c.schema.secondaryIndexes
                    .map((i) => `CREATE INDEX ${i.name} ON ${i.table}(${i.cols.join(', ')});  -- serves: ${i.serves}`)
                    .join('\n')}</code></pre>
              </div>
            </section>
          </main>
        </div>

        <footer className="footer">
          <span>
            {AUTHORS.lead}, {AUTHORS.co.join(', ')} · <A href={QR_URL}>{AUTHORS.site}</A>
          </span>
          <span className="meta">PostgreSQL 18.3 · SQLite {c.toolchain.sqlite} · {captured}</span>
        </footer>
      </div>
    </AudienceProvider>
  )
}
