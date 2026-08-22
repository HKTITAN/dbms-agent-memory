/* The paper.
 *
 * Prose and evidence in one file, deliberately. Every number the text states is
 * read from `capture.json` through `lib/data`, so the sentence and the table
 * cannot disagree — there is no number here for them to disagree about.
 *
 * The web edition, the PDF and the ePub all render from this page, so the three
 * cannot drift either.
 */

import {
  capture, schema, exp, limits, vault, classes, amp,
  n, pct, times, bytes, duration, capturedOn, worstClass,
  totalNotionRoundTrips, totalSqlStatements, workloadFloorSeconds,
  totalProperties, unenforcedInvariants,
} from '@/lib/data'
import { Figure, StatStrip, BarChart, GroupedBars, ScalingChart } from '@/components/charts'
import {
  DatabaseTable, ApiLimitsTable, VaultTable, InjectedTable, WorkloadTable, ArmTable,
  AmplificationTable, InvariantTable, NormalizationTable, FdTable, ConcurrencyTable,
  TemporalTable, ResolutionTable, FullTextTable, WakeupTable, CeilingTable,
  AnomalyTable, AliasTable, BitemporalTable, DanglingTable, ToolchainTable,
  SourceTable, CorrectnessMatrix,
} from '@/components/evidence'
import { ErDiagram, SchemaTable } from '@/components/er-diagram'
import {
  RoundTripDiagram, SurfaceDiagram, BitemporalDiagram, NormalizationLadder, ConstraintDiagram,
} from '@/components/diagrams'
import { QueryCostExplorer, VaultSizeExplorer, WriterRaceExplorer } from '@/components/explainers'
import { Sidebar } from '@/components/sidebar'
import { QrCode, QR_URL } from '@/components/qr-code'

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
  { id: 'background', label: '2. Background' },
  { id: 'system', label: '3. The system under review' },
  { id: 'model', label: '4. The data model' },
  { id: 'normalisation', label: '5. Normalisation' },
  { id: 'temporal', label: '6. The temporal model' },
  { id: 'method', label: '7. Methodology' },
  { id: 'expressibility', label: '8. Expressibility and cost' },
  { id: 'integrity', label: '9. Integrity' },
  { id: 'retrieval', label: '10. Retrieval' },
  { id: 'ceiling', label: '11. The ceiling' },
  { id: 'explore', label: '12. Explore the evidence' },
  { id: 'discussion', label: '13. Discussion' },
  { id: 'threats', label: '14. Threats to validity' },
  { id: 'related', label: '15. Related work' },
  { id: 'conclusion', label: '16. Conclusion' },
  { id: 'references', label: 'References' },
  { id: 'appendix', label: 'Appendices' },
]

const DOWNLOADS = [
  {
    href: '/persistent-memory-architecture-for-agents.pdf',
    label: 'PDF',
    meta: 'A4',
    preview: '/preview-pdf.png',
    previewAlt: 'First page of the typeset PDF',
  },
  {
    href: '/persistent-memory-architecture-for-agents.epub',
    label: 'ePub',
    meta: 'reflow',
    preview: '/preview-epub.png',
    previewAlt: 'The abstract, reflowed for an e-reader',
  },
]

/* Everything this repository produces, in one place. The slides and the dataset
   are not in the sidebar's list because that list carries page previews and
   these two have nothing to preview — but a reader who wants the numbers should
   not have to clone the repository to get them. */
const ARTIFACTS = [
  /* Two of these are the same document, so they cannot both be called "The
     paper" — a list where two rows share a name reads as a duplicate, and the
     distinction between them is precisely the format. */
  { href: '/persistent-memory-architecture-for-agents.pdf', name: 'The paper, typeset', meta: 'PDF · A4 · 43 pages' },
  { href: '/persistent-memory-architecture-for-agents.epub', name: 'The paper, reflowable', meta: 'ePub · for an e-reader' },
  { href: '/persistent-memory-architecture-for-agents-slides.pdf', name: 'The talk', meta: 'PDF · 16:9 · one slide per page' },
  /* Explicit filename rather than the directory: a static file under public/ is
     served at its path, and whether `/slides/` resolves to its index is a
     property of the host, not of the project. */
  { href: '/slides/index.html', name: 'The talk, live', meta: 'HTML · arrow keys, or swipe' },
  { href: '/capture.json', name: 'The dataset', meta: 'JSON · every number in the paper' },
]

function Cite({ n: id }: { n: number }) {
  return <a href={`#ref-${id}`} className="cite" aria-label={`Reference ${id}`}>[{id}]</a>
}

/**
 * A figure number, and nothing else.
 *
 * The diagram and explorer components each render their own `<Figure>` — title,
 * sub-line, caption. Wrapping them in a second one printed the title twice and
 * stacked three captions under one drawing. The number is the only thing the
 * page can supply that the component cannot, because it depends on position,
 * so the number is the only thing this supplies.
 */
function Plate({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="plate">
      <p className="plate-n">{label}</p>
      {children}
    </div>
  )
}

/** A quotation from Lore's own source. The paper leans on these, so they are marked. */
function Src({ file, children }: { file: string; children: React.ReactNode }) {
  return (
    <blockquote className="figure" style={{ margin: '1.25rem 0', padding: '0.9rem 1.1rem' }}>
      <p style={{ margin: 0, fontStyle: 'italic', color: 'var(--text)' }}>{children}</p>
      <p className="meta mono" style={{ margin: '0.5rem 0 0' }}>{file}</p>
    </blockquote>
  )
}

export default function Paper() {
  const s = schema.source
  const provenance = amp('provenance')
  const body = amp('body-search')
  const conc = exp.concurrency
  const temporal = exp.temporal
  const res = exp.resolution
  const ft = exp.fulltext
  const ceiling = exp.ceiling
  const bit = exp.bitemporal

  return (
    <div className="shell with-rail">
      <Sidebar entries={TOC} downloads={DOWNLOADS} />

      <main id="main">
        {/* ----------------------------------------------------- front matter
            Print only. A paper opens on a title page carrying the title, the
            authors, the abstract and the provenance of what was reviewed —
            not on a download list and a QR code, which is what the masthead
            below is for and what made the PDF read as a website export. */}
        <section className="titlepage">
          <p className="tp-kicker">Review paper · Database Management Systems</p>
          <h1>Persistent memory architecture for agents</h1>
          <p className="tp-sub">
            A review of Notion&rsquo;s Lore, and what happens when its schema is given a database
            to run on.
          </p>

          <p className="tp-authors">
            {AUTHORS.lead} &nbsp;·&nbsp; {AUTHORS.co.join(' · ')}
          </p>
          <p className="tp-affil">
            BTech, Computer Science and Engineering &nbsp;·&nbsp; submitted to {AUTHORS.submittedTo}
          </p>

          <p className="tp-label">Abstract</p>
          <div className="tp-abstract">
            <p>
              Lore is Notion&rsquo;s open-source memory system for AI agents: a persistent, shared
              vault that keeps context alive across a cleared session, a new branch or a handover,
              by storing that memory as rows in five Notion databases. The design is deliberate —
              the memory is human-readable, editable by hand, and inherits the permissions of a
              tool the team already pays for, and there is no database to run.
            </p>
            <p>
              This paper reviews that design as a database design. We reconstruct Lore&rsquo;s
              schema from its source — {n(totalProperties)} properties across five databases, read
              from <span className="mono">{s.schemaFile}</span> at commit{' '}
              <span className="mono">{s.commit}</span> — and analyse it with the entity-relationship
              model, normal forms, functional dependencies, and the temporal-database distinction
              between valid time and transaction time. We then reimplement the same schema on
              SQLite and PostgreSQL, generate a vault of {n(vault.memories)} memories and{' '}
              {n(vault.facts)} facts whose ground truth is definitional rather than judged, and put
              a workload of {n(vault.questions)} questions in {classes.length} classes through three
              stores: an emulator restricted to the documented Notion Data API, and the two engines.
            </p>
            <p>
              The vault is not wrong. It answers {pct(capture.byArm.notion.exact, 1)} of the
              workload exactly, the same as both engines. What separates them is cost and refusal:{' '}
              {n(totalNotionRoundTrips)} requests against {n(totalSqlStatements)} SQL statements,
              a single join at {n(provenance.notionRoundTrips, 0)} requests, a complete body search
              at {duration(body.notionFloorSeconds)}, {pct(conc.notion.lostUpdateRate)} of updates
              lost by eight concurrent writers, and a temporal exclusion constraint PostgreSQL
              declines even to add because {n(temporal.trueConflictKeys)} subject-predicate pairs
              already contradict each other. We argue these are the visible price of a legible
              trade rather than defects, and put numbers on it.
            </p>
          </div>

          <p className="tp-label">Keywords</p>
          <p className="tp-keywords">
            Agent memory · entity-relationship model · normalisation · Boyce-Codd normal form ·
            functional dependency · temporal databases · valid time · transaction time · exclusion
            constraints · referential integrity · lost update · entity resolution · provenance ·
            full-text retrieval · Model Context Protocol · Notion · PostgreSQL · SQLite
          </p>

          <div className="tp-colophon">
            <div>
              <p style={{ margin: 0 }}>
                Subject: {s.repo.replace('https://', '')} at {s.commit} ({s.version}, {s.license}),
                read {s.commitDate}.
              </p>
              <p style={{ margin: 0 }}>
                Measured {capturedOn} on {capture.machine.cpu}. Every figure in this paper is read
                from <span className="mono">data/capture.json</span>; no number is typed by hand.
              </p>
              <p style={{ margin: 0 }}>{QR_URL}</p>
            </div>
            <QrCode size={84} />
          </div>
        </section>

        {/* ------------------------------------------------------- masthead */}
        <header className="masthead no-print">
          <p className="kicker">Review paper · Database Management Systems</p>
          <h1 className="title">Persistent memory architecture for agents</h1>
          <p className="lede">
            A review of Notion&rsquo;s <span className="mono">Lore</span>, and what happens when its
            schema is given a database to run on.
          </p>

          <div className="meta" style={{ marginTop: '1.5rem' }}>
            <p>
              <strong>{AUTHORS.lead}</strong> · {AUTHORS.co.join(' · ')}
            </p>
            <p>Submitted to {AUTHORS.submittedTo} · BTech CSE coursework</p>
            <p>
              Subject: <a href={s.repo} className="cite">{s.repo.replace('https://', '')}</a> at{' '}
              <span className="mono">{s.commit}</span> ({s.version}, {s.license}), read {s.commitDate}.
              Measured {capturedOn}.
            </p>
          </div>

          <div className="downloads">
            <div>
              <h2 className="kicker" id="artifacts-heading">Everything, downloadable</h2>
              <ul className="download-list" aria-labelledby="artifacts-heading">
                {ARTIFACTS.map((a) => (
                  <li key={a.href}>
                    <a className="download" href={a.href} download={a.href.endsWith('.html') ? undefined : ''}>
                      <span className="download-name">{a.name}</span>
                      <span className="download-meta">{a.meta}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="download-qr">
              <QrCode />
              <p className="meta">{QR_URL}</p>
            </div>
          </div>
        </header>

        {/* -------------------------------------------------------- abstract */}
        <section id="abstract" className="section">
          <h2 className="heading-24">Abstract</h2>
          <div className="prose">
            <p>
              Lore is Notion&rsquo;s open-source memory system for AI agents. It gives an assistant a
              persistent, shared vault so that context survives a cleared session, a new branch, or a
              handover between people, and it does so by storing that memory as rows in five Notion
              databases: Projects, Topics, Memories, Entities and Facts. The design is unusual and
              deliberate. The memory is human-readable, editable by hand, and inherits the
              permissions of a tool the team already pays for; there is no database to run.
            </p>
            <p>
              This paper reviews that design as a database design. We reconstruct Lore&rsquo;s schema
              from its source — {n(totalProperties)} properties across five databases, read from{' '}
              <span className="mono">{s.schemaFile}</span> at commit <span className="mono">{s.commit}</span> —
              and analyse it with the ordinary tools: the entity-relationship model, normal forms,
              functional dependencies, the temporal-database distinction between valid time and
              transaction time, and the invariants a schema can declare. We then reimplement the same
              schema on SQLite and PostgreSQL, generate a vault of {n(vault.memories)} memories and{' '}
              {n(vault.facts)} facts whose ground truth is definitional rather than judged, and put a
              workload of {n(vault.questions)} questions in {classes.length} classes through three
              stores: an emulator restricted to the documented Notion Data API, and the two engines.
            </p>
            <p>
              The result is not that the vault gets things wrong. It gets them right: the Notion arm
              answers <strong>{pct(capture.byArm.notion.exact, 1)}</strong> of the workload exactly,
              the same as both engines. What separates them is what the answer costs and what the
              store will refuse. Answering the workload takes the Data API{' '}
              <strong>{n(totalNotionRoundTrips)}</strong> requests against{' '}
              <strong>{n(totalSqlStatements)}</strong> SQL statements — {duration(workloadFloorSeconds)} of
              wall-clock floor at the documented {limits.requestsPerSecond} requests per second, before
              anyone&rsquo;s network is involved. A single join from a claim to the memory that
              supports it costs {n(provenance.notionRoundTrips, 0)} requests
              ({times(provenance.roundTrips)}). Searching what memories actually say costs{' '}
              {n(body.notionRoundTrips, 0)} ({duration(body.notionFloorSeconds)}), because the search
              endpoint matches titles and a memory&rsquo;s text is page blocks.
            </p>
            <p>
              The sharper finding is about refusal. Eight agents upserting the same topic key lose{' '}
              <strong>{pct(conc.notion.lostUpdateRate)}</strong> of their updates, because the
              read-then-write protocol has no conditional write to close; the same workload through a
              unique index loses none. PostgreSQL declines even to <em>add</em> a temporal exclusion
              constraint to the vault as generated, because {n(temporal.trueConflictKeys)} subject-predicate
              pairs already assert two different objects over overlapping time — contradictions that
              Lore detects afterwards, with a documented scan cap, and that a range-typed constraint
              refuses at the point of writing. Three normalisation violations ship, each for a
              substrate reason we can name: a repeating group in one cell, a stored expression
              standing in for an index Notion has no way to create, and a Boyce-Codd violation in the
              centre of the knowledge graph that leaves {n(res.staleSubjectStrings)} facts whose title
              and whose relation disagree about their own subject.
            </p>
            <p>
              We argue that these are not defects so much as the visible price of a real trade, and
              that the trade is legible: Lore exchanges every guarantee a database declares —
              uniqueness, referential integrity, atomicity, the ability to state a join — for
              human-legible memory, zero infrastructure and inherited permissions, and then
              re-implements the discarded guarantees as scanners, migrations and filesystem locks. Its
              own documentation is unusually candid about where the seams are. The contribution here
              is to put numbers on them.
            </p>
          </div>

          <StatStrip
            stats={[
              { value: pct(capture.byArm.notion.exact, 0), label: 'workload answered exactly, all three stores' },
              { value: n(totalNotionRoundTrips), label: 'requests the Data API needs' },
              { value: n(totalSqlStatements), label: 'SQL statements the same workload needs' },
              { value: pct(conc.notion.lostUpdateRate, 0), label: 'updates lost by 8 concurrent writers' },
            ]}
          />
        </section>

        {/* ---------------------------------------------------- introduction */}
        <section id="introduction" className="section">
          <h2 className="heading-24">1. Introduction</h2>
          <div className="prose">
            <p>
              An agent that forgets is a tool. An agent that remembers is a colleague, and colleagues
              need somewhere to keep what they know. The last three years have produced a shelf of
              answers to that need — paged context windows <Cite n={3} />, memory streams with
              reflection <Cite n={9} />, extraction-and-update pipelines over a vector store{' '}
              <Cite n={5} />, temporal knowledge graphs <Cite n={6} />, and, at the simple end, a
              markdown file the model rewrites <Cite n={15} />. What almost none of them do is take
              seriously the possibility that this is a problem the database community solved, in
              stages, between 1970 and 2011.
            </p>
            <p>
              Lore is interesting because it comes closer than most. It is not a vector index with a
              metadata blob bolted on. It is a schema: five related tables, a subject-predicate-object
              fact relation with validity intervals and a confidence, a canonical entity registry with
              aliases, and a set of services that maintain them. Reading its source, one keeps meeting
              old friends — a specialisation hierarchy, a bridge table, a derived attribute, a
              supersession chain — and the pleasure of the exercise is watching a team arrive at the
              relational model from the outside, under a constraint the relational model has never had
              to work under: the store is a document database exposed over HTTP, and it has no joins,
              no aggregates, no unique indexes, no constraints, and no conditional writes.
            </p>
            <p>
              This paper asks a narrow question with a broad answer. <em>What does that constraint
              actually cost?</em> Not rhetorically — in requests, in bytes, in rows the client has to
              look at itself, and in states the store will happily accept and a database would refuse.
            </p>
            <p>Our contributions are four.</p>
            <ol>
              <li>
                <strong>A schema reconstruction.</strong> Lore&rsquo;s five databases, restated as a
                relational schema with an entity-relationship diagram, functional dependencies, and a
                normalisation walk. Every property name and enumeration is read from{' '}
                <span className="mono">{s.schemaFile}</span>, not from prose, and the diagram, the DDL
                and the argument are all generated from one declaration so they cannot drift (§4, §5).
              </li>
              <li>
                <strong>A workload with non-circular ground truth.</strong> {classes.length} question
                classes read off Lore&rsquo;s own commands and hooks, each annotated with the minimum
                relational algebra it needs, over a vault generated world-first so that the correct
                answer is definitional (§7).
              </li>
              <li>
                <strong>A cost measurement in substrate-independent units.</strong> Round trips, bytes
                and client-side rows, against an emulator restricted to the documented Data API, with
                every restriction carrying the reference page it comes from (§8).
              </li>
              <li>
                <strong>Integrity experiments.</strong> Four invariants, attacked deliberately, on
                both the vault and a reimplementation that can declare them (§9).
              </li>
            </ol>
            <p>
              We are reviewing a system, not competing with it. Where a measurement came out smaller
              than the argument would have liked, §9.5 and §14 say so.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------- background */}
        <section id="background" className="section">
          <h2 className="heading-24">2. Background</h2>

          <h3 className="heading-20">2.1 What an agent memory has to do</h3>
          <div className="prose">
            <p>
              The surveys converge on a decomposition. Du and colleagues split memory operations into
              six atoms — consolidation, updating, indexing, forgetting, retrieval and compression{' '}
              <Cite n={19} /> — and every one of the six has a database name. Consolidation is
              materialisation. Updating is the update anomaly problem. Indexing is indexing. Forgetting
              is a retention policy. Retrieval is query processing. Compression is, roughly,
              summarisation as a materialised view. Zhang and colleagues&rsquo; earlier survey{' '}
              <Cite n={17} /> and Wu and colleagues&rsquo; human-memory mapping <Cite n={18} /> reach
              the same place from different directions.
            </p>
            <p>
              What the benchmarks then show is that the hard part is not recall of a single fact but
              recall <em>through change</em>. LongMemEval isolates five abilities and two of them —
              temporal reasoning and knowledge updates — are exactly the ones a validity interval
              exists to serve <Cite n={24} />; LoCoMo finds that models struggle with long-range
              temporal and causal dynamics even when the whole history is in context <Cite n={23} />.
              An agent memory that cannot say <em>when</em> something was true is not a memory, it is
              a pile.
            </p>
          </div>

          <h3 className="heading-20">2.2 Why this is a database problem</h3>
          <div className="prose">
            <p>
              Codd&rsquo;s 1970 paper is about the same complaint <Cite n={39} />: applications were
              storing data in a shape that made some questions easy and others unaskable, and changing
              the shape broke the applications. Chen gave the modelling vocabulary six years later{' '}
              <Cite n={41} />. Temporal databases gave us the distinction that the agent-memory
              literature keeps rediscovering — valid time, when a fact was true in the world, against
              transaction time, when the database came to believe it <Cite n={42} /><Cite n={43} /> —
              and SQL:2011 standardised it <Cite n={44} />. Record linkage has a theory from 1969{' '}
              <Cite n={46} /> and a generic framework from 2009 <Cite n={47} />. Provenance has a
              characterisation <Cite n={48} /> and a survey <Cite n={49} />. The lost update is in
              Gray <Cite n={51} /> and the isolation levels that permit it are in Berenson{' '}
              <Cite n={52} />.
            </p>
            <p>
              None of this is a criticism of the agent-memory literature, which is solving a different
              and newer problem. It is an observation that a memory system arriving at
              subject-predicate-object triples with validity windows and a confidence score has
              arrived at RDF <Cite n={53} /> with named graphs <Cite n={55} /> and a probabilistic
              layer <Cite n={58} />, and that the questions those communities asked next are the
              questions worth asking here.
            </p>
          </div>

          <h3 className="heading-20">2.3 The Model Context Protocol</h3>
          <div className="prose">
            <p>
              Lore reaches assistants through MCP, opened by Anthropic in November 2024{' '}
              <Cite n={25} />. The specification defines exactly three server primitives —
              resources, prompts and tools <Cite n={26} />. Lore exposes its entire vault through
              tools alone, six of them, each multiplexing several actions behind one registration.
              That is a substantive design choice: a vault modelled as resources would be
              addressable and cacheable by the host, and a vault modelled as tools is a set of
              procedures the model must decide to call.
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------- the system */}
        <section id="system" className="section">
          <h2 className="heading-24">3. The system under review</h2>
          <div className="prose">
            <p>
              Lore is an MIT-licensed Node package, <span className="mono">@notionhq/lore</span>, at
              version {s.version} when we read it. Three surfaces share one set of domain services: an
              MCP server for assistants, a CLI for people, and lifecycle hooks that load context at
              session start and save it at session end. Underneath all three is the Notion Data API,
              and underneath that is a page: a vault is one Notion page containing five databases.
            </p>
          </div>

          <Plate label="Figure 1">
            <SurfaceDiagram />
          </Plate>

          <div className="prose">
            <p>
              The choice of substrate is the whole design. Notion is a document store with a
              relational veneer: a database is a collection of pages, a page has typed properties, and
              a relation property holds an array of page identifiers. What it is not is a query
              processor. The public reference documents filters and sorts over properties, cursor
              pagination at a hundred rows a request, and a search endpoint; it offers no join, no
              aggregate, no unique index, no check constraint, and no conditional write.
            </p>
          </div>

          <Figure
            title="Table 1 — The documented limits our emulator enforces"
            caption="Each row is a constraint the Notion arm respects, with the reference page it comes from. Nothing in the emulator refuses anything the reference offers, and nothing permits anything it does not."
            full
          >
            <ApiLimitsTable />
          </Figure>

          <div className="prose">
            <p>
              Two of these deserve emphasis because the paper returns to them. First,{' '}
              <strong>the search endpoint matches titles</strong>, not page content. A memory in Lore
              is a title, a set of properties, and a body of blocks; the body is where the sentence
              somebody wrote lives, and no property filter can see it. Second,{' '}
              <strong>there is no documented conditional write</strong> — no ETag, no{' '}
              <span className="mono">If-Match</span>, no version token — so a client that reads a row
              and then writes it cannot ask the server to apply the write only if nothing changed in
              between.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- model */}
        <section id="model" className="section">
          <h2 className="heading-24">4. The data model</h2>
          <div className="prose">
            <p>
              Lore&rsquo;s schema is declared in one TypeScript file that describes itself as
              &ldquo;the single source of truth for every read and write on this database&rdquo;. We
              transcribed it into the relational vocabulary, and everything downstream in this
              repository — the diagram below, the DDL both engines execute, the property catalogue the
              emulator creates, and the dependency analysis in §5 — is generated from that one
              transcription.
            </p>
          </div>

          <Figure
            title="Table 2 — The five databases"
            caption="Property counts are computed from the declaration, not counted by hand. 'Derived' means a column whose value is a function of other columns in the same row; 'system-managed' means a column the agent-facing tools do not accept."
            full
          >
            <DatabaseTable />
          </Figure>

          <div className="prose">
            <p>
              Three things about that table are worth stopping on.
            </p>
            <p>
              <strong>Memories is a single-table specialisation with ten subtypes.</strong> The{' '}
              <span className="mono">Kind</span> property takes ten values — note, decision, incident,
              runbook, postmortem, policy, state, operational, task and procedure — and the subtypes do
              not share attributes. A task has <span className="mono">Task State</span>,{' '}
              <span className="mono">Blocked By</span> and <span className="mono">Done At</span>; a
              decision has <span className="mono">Alternatives</span>,{' '}
              <span className="mono">Consequences</span> and <span className="mono">Decided At</span>;
              a pinned block has <span className="mono">Pinned Priority</span> and{' '}
              <span className="mono">Mutability</span>. This is the classic single-table
              specialisation, and it is paid for exactly as the textbooks say: in columns that are null
              for most rows, and in the impossibility of declaring &ldquo;a task must have a task
              state&rdquo; anywhere the store can enforce it.
            </p>
            <p>
              <strong>Facts is a triple store with two time axes and two confidences.</strong> Subject,
              predicate and object; <span className="mono">Valid From</span> and{' '}
              <span className="mono">Valid Until</span>; <span className="mono">Observed At</span>,{' '}
              <span className="mono">Invalidated At</span> and{' '}
              <span className="mono">Invalidated By</span>; a categorical{' '}
              <span className="mono">Confidence</span> and a numeric{' '}
              <span className="mono">Confidence Score</span>. Lore&rsquo;s comment on the four dates is
              precise about what they are for:
            </p>
          </div>

          <Src file="src/notion/schema.ts">
            &ldquo;Valid From / Valid Until model domain truth (when the fact was true in the world);
            Observed At and Invalidated At model what Lore knew and when. Together they implement the
            bitemporal axis used for as-of recall.&rdquo;
          </Src>

          <div className="prose">
            <p>
              <strong>Facts is also the link table.</strong> Four of Lore&rsquo;s predicates are
              referential plumbing rather than domain knowledge:{' '}
              <span className="mono">mentions</span> is auto-emitted when a memory is saved,{' '}
              <span className="mono">decided_by</span>, <span className="mono">supersedes_decision</span>{' '}
              and <span className="mono">informs</span> are written only by the decision service. They
              live in the same relation as <span className="mono">owned_by</span> and{' '}
              <span className="mono">depends_on</span>, so any aggregate over &ldquo;the facts we
              know&rdquo; counts pointers as claims unless it filters them out. In our generated vault
              those system predicates are {pct(vault.systemPredicateShare)} of all facts.
            </p>
          </div>

          <Figure
            title="Figure 2 — Entity-relationship diagram, Chen notation"
            caption={
              <>
                Generated from the schema declaration. Every box is a relation the reimplementation
                creates; every edge is a foreign key it enforces. The dashed box is{' '}
                <span className="mono">ENTITY_ALIAS</span> — the relation a normalised schema would
                have and the vault does not, because Lore stores aliases as a joined string in one
                cell.
              </>
            }
            full
          >
            <ErDiagram />
          </Figure>

          <h3 className="heading-20">4.1 The property catalogue</h3>
          <div className="prose">
            <p>
              A reader with their own vault can check our reconstruction against it. The catalogue
              below lists every property we model, its Notion type, and the flags that matter for the
              analysis: whether it is derived, whether it is system-managed, whether it is a repeating
              group inside a single cell, and which temporal axis it belongs to. Properties marked{' '}
              <em>not modelled</em> exist in Lore and are left null by our generator because the
              workload does not exercise them; naming them is cheaper than a footnote and harder to
              forget.
            </p>
          </div>

          <Figure title="Table 3 — Property catalogue" full>
            <SchemaTable />
          </Figure>
        </section>

        {/* -------------------------------------------------- normalisation */}
        <section id="normalisation" className="section">
          <h2 className="heading-24">5. Normalisation</h2>
          <div className="prose">
            <p>
              The usual normalisation exercise walks a badly-shaped relation to Boyce-Codd form and
              declares victory. That is not the interesting exercise here, because Lore&rsquo;s
              designers are not naïve — most of the schema is in good shape. The interesting exercise
              is the other one: <em>which violations ship, and why</em>. Three do, and each has a
              substrate reason we can name.
            </p>
          </div>

          <Plate label="Figure 3">
            <NormalizationLadder />
          </Plate>

          <h3 className="heading-20">5.1 A repeating group in one cell</h3>
          <div className="prose">
            <p>
              <span className="mono">Entities.Aliases</span> is a single{' '}
              <span className="mono">rich_text</span> cell holding a comma-joined list. This is a first
              normal form violation of the most textbook kind, and Lore states its reason plainly:
            </p>
          </div>

          <Src file="src/notion/schema.ts">
            &ldquo;Multi-select option lists require a schema migration whenever a new alias appears,
            and aliases are deeply free-form (case variants, &lsquo;MemoryService.create&rsquo;
            alongside &lsquo;MemoryService&rsquo;, legacy spellings) — every new fact would force a{' '}
            <span className="mono">dataSources.update</span> round-trip.&rdquo;
          </Src>

          <div className="prose">
            <p>
              The reasoning is sound and the consequence is real. Because the list lives inside a
              string, the only server-side operator that reaches it is{' '}
              <span className="mono">contains</span> — a substring test over the whole cell. Lore does
              the correct thing: it uses the substring filter as a <em>candidate</em> filter and then
              re-splits every candidate in the client to keep exact tokens. Correctness survives. What
              does not survive is the claim that the store answered the question, and the invariant
              &ldquo;an alias identifies one entity&rdquo; is not merely unenforced but explicitly
              disclaimed — the source comment reads &ldquo;aliases are deliberately not unique across
              entities&rdquo;. §9.5 measures what the over-matching costs, and the honest answer is:
              less than we expected.
            </p>
            <p>
              The same violation appears three more times on Memories, and one of the three is worse
              than the alias case. <span className="mono">Compare Notes</span> is an append-only NDJSON
              audit log — one JSON line per adjudication verdict — stored in a single{' '}
              <span className="mono">rich_text</span> cell, and Lore&rsquo;s comment records that
              appending past the {n(limits.richTextChars)}-character cap throws. That is a child table
              inside an attribute, with a hard row limit, and the revision chain of a topic-keyed
              memory is worse still: it is prose in page blocks, so &ldquo;what did this runbook say in
              March&rdquo; is not a question anyone can write a query for.
            </p>
          </div>

          <h3 className="heading-20">5.2 An index, materialised as a column</h3>
          <div className="prose">
            <p>
              Facts carries two derived columns. <span className="mono">DedupKey</span> is a hash of
              normalised subject, predicate and object, used to coalesce cosmetic duplicates.{' '}
              <span className="mono">SubjectKey</span> is the lowercased, whitespace-collapsed subject.
              A relational engine expresses both as one line —{' '}
              <span className="mono">CREATE UNIQUE INDEX ON fact (lower(subject), predicate, lower(object))</span>{' '}
              — because it has expression indexes. Notion does not, so the expression becomes a stored
              column, which can drift from its source, and which needs a backfill migration for every
              row written before it existed.
            </p>
            <p>
              Lore&rsquo;s comment even explains why <em>two</em> columns are needed rather than one,
              and the reason is a second substrate limitation stacked on the first: they need{' '}
              <span className="mono">contains</span> substring matching, &ldquo;which Notion
              doesn&rsquo;t run against hashed values&rdquo;. A hash serves uniqueness; a normalised
              string serves lookup; a database would have served both with one index and no columns.
            </p>
          </div>

          <h3 className="heading-20">5.3 The violation in the middle of the graph</h3>
          <div className="prose">
            <p>
              Every Notion database has exactly one title property, and a title property cannot be a
              relation. Facts therefore carries its subject twice: as{' '}
              <span className="mono">Subject</span>, a string, and as{' '}
              <span className="mono">SubjectEntity</span>, a relation to the canonical Entity row. The
              relation determines the string. Neither is a candidate key of Facts. That is a Boyce-Codd
              violation, and it is not hypothetical — it is reachable by the most ordinary maintenance
              operation the system has.
            </p>
            <p>
              <span className="mono">mergeEntities</span> repoints every fact relation from the losing
              entity to the winner, absorbs the loser&rsquo;s lookup forms as aliases, and archives the
              loser. It never rewrites the <span className="mono">Subject</span> title. After a merge,
              the vault holds facts whose title says one name and whose relation points at a row with
              another. In our generated vault, {n(res.staleSubjectStrings)} facts are in that state —{' '}
              {pct(res.staleSubjectRate)} of all facts — and an agent reading the title reads the old
              name while an agent following the relation reads the new one.
            </p>
          </div>

          <Figure title="Table 4 — Functional dependencies" full>
            <FdTable />
          </Figure>
          <Figure
            title="Table 5 — The normalisation walk, tabulated"
            caption="The 'ships' column is the finding. Everything above it is the standard exercise."
            full
          >
            <NormalizationTable />
          </Figure>

          <div className="prose">
            <p>
              A fourth item belongs here even though it is not a normal-form violation in the classical
              sense. <span className="mono">Confidence Score</span> is a stored derivation whose inputs
              are not stored. Lore seeds it from the categorical stance
              ({Object.entries(schema.confidenceModel.seed).map(([k, v]) => `${k} → ${v}`).join(', ')}),
              raises it by {schema.confidenceModel.bumpRate} of the remaining headroom on each read
              citation, multiplies it by {schema.confidenceModel.decrementFactor} on a contradiction,
              and decays it at {schema.confidenceModel.decayRate} per day of neglect after a{' '}
              {schema.confidenceModel.staleGraceDays}-day grace period. Because the citations,
              contradictions and touches are not themselves rows, the score cannot be recomputed,
              audited or rolled back, and two vaults that saw the same evidence in a different order
              hold different scores for the same fact.
            </p>
            <p>
              The most striking thing about the score is what happens to it next. Lore maintains it,
              pays write amplification to persist it, and then declines to let it influence retrieval
              at all — <span className="mono">confidenceFactor</span> returns{' '}
              {schema.confidenceModel.retrievalFactor} for every input, with the comment that
              &ldquo;ranking callers cannot use confidence as a multiplier&rdquo;. It is a trust
              label, not a probability, and reading it as either a probabilistic database tuple weight{' '}
              <Cite n={58} /> or an AGM belief state <Cite n={57} /> would misrepresent it. We think
              declining to rank on it is the right call — a citation is a retrieval event, not a
              corroboration, so a frequently-retrieved wrong fact would otherwise ratchet upward — but
              it leaves a maintained column that nothing consumes.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- temporal */}
        <section id="temporal" className="section">
          <h2 className="heading-24">6. The temporal model</h2>
          <div className="prose">
            <p>
              Lore&rsquo;s Facts relation is bitemporal in schema, which puts it ahead of most agent
              memory systems and level with Zep&rsquo;s Graphiti <Cite n={6} /><Cite n={7} />. Valid
              time says when a claim was true; transaction time says when the vault believed it. The
              standard has had the vocabulary since SQL:2011 <Cite n={44} /> and the consensus
              glossary since 1998 <Cite n={43} />.
            </p>
            <p>
              The question a review has to ask is whether the second axis pays for itself, and the
              honest way to answer it is to count the rows where the two axes disagree. If they never
              disagree, the schema is carrying a column for nothing. In our vault they disagree often:
              retractions lag the world by a median of {n(bit.lagDaysMedian)} days and a 95th
              percentile of {n(bit.lagDaysP95)}, and at four probe instants between{' '}
              {pct(Math.min(...bit.disagreements.map((d) => d.share)))} and{' '}
              {pct(Math.max(...bit.disagreements.map((d) => d.share)))} of all facts answer
              differently depending on which axis the question asked about.
            </p>
          </div>

          <Plate label="Figure 4">
            <BitemporalDiagram />
          </Plate>

          <Figure title="Table 6 — Where the axes disagree" full>
            <BitemporalTable />
          </Figure>

          <div className="prose">
            <p>
              Two caveats, both of which cut against a simple reading. First, Notion&rsquo;s own{' '}
              <span className="mono">last_edited_time</span> is not transaction time in
              Snodgrass&rsquo;s sense: it is overwritten in place, so there is no history to query and
              no way to reconstruct what the vault believed before the last edit. Lore&rsquo;s{' '}
              <span className="mono">Observed At</span> and{' '}
              <span className="mono">Invalidated At</span> are doing the work the substrate does not
              do, and they can do it only once per fact — one observation and one retraction, not a
              history of belief. Second, our reading of Lore&rsquo;s query paths suggests the surface
              is narrower than the schema: the <span className="mono">asOf</span> parameter applies a
              single date, and we did not find a path that filters valid time and transaction time
              independently. A bitemporal schema with a single-axis query surface is a common and
              recoverable state — the columns are there when someone wants them — but it is worth
              naming, and we flag it as inference rather than measurement in §14.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- method */}
        <section id="method" className="section">
          <h2 className="heading-24">7. Methodology</h2>

          <h3 className="heading-20">7.1 The vault, generated backwards</h3>
          <div className="prose">
            <p>
              Relevance labels chosen by looking at what a store returned are worthless, because the
              store gets to define what counts as right. So nothing in our corpus is labelled. A world
              is generated first — services, people, teams, incidents, decisions — and the facts are
              read off that world by construction, with ownership histories that open and close over
              540 simulated days. Memories are then <em>rendered</em> from facts: several
              natural-language restatements of the same triple, scattered across sessions and authors.
              The correct answer to &ldquo;what is currently true about{' '}
              <span className="mono">payments-api</span>&rdquo; is therefore definitional: it is the
              set of facts the generator emitted with an open interval for that subject.
            </p>
          </div>

          <Figure title="Table 7 — The generated vault" full>
            <VaultTable />
          </Figure>

          <div className="prose">
            <p>
              A clean vault would prove nothing, so six defects are injected deliberately. Each is a
              state the substrate cannot refuse, and each is recorded with its ground-truth extent so
              that §9 reports detection rates rather than impressions.
            </p>
          </div>

          <Figure title="Table 8 — Defects injected on purpose" full>
            <InjectedTable />
          </Figure>

          <h3 className="heading-20">7.2 The workload</h3>
          <div className="prose">
            <p>
              The {classes.length} question classes are read off Lore&rsquo;s own surface, not chosen
              to make a point. If <span className="mono">lore ask &lt;entity&gt;</span> exists, the
              workload contains an ask-entity question; if{' '}
              <span className="mono">lore conflicts scan</span> exists, it contains a conflict scan.
              Each class is annotated with the minimum relational algebra it needs, and with what the
              documented Data API can state as a query.
            </p>
          </div>

          <Figure title="Table 9 — The question classes" full>
            <WorkloadTable />
          </Figure>

          <div className="prose">
            <p>
              Of the {n(capture.expressibility.instances)} question instances,{' '}
              {pct(capture.expressibility.shareNeedingJoin)} need a join,{' '}
              {pct(capture.expressibility.shareNeedingAggregate)} need an aggregate, and{' '}
              {pct(capture.expressibility.shareNeedingRecursion)} need a transitive closure. Together,{' '}
              {pct(capture.expressibility.shareNeedingMoreThanFilter)} of the workload needs something
              the Data API cannot state as a filter.
            </p>
          </div>

          <h3 className="heading-20">7.3 The arms</h3>
          <div className="prose">
            <p>
              Three stores answer every question. The <strong>Notion arm</strong> is an emulator whose
              surface is restricted to operations the public reference documents, and whose refusals
              are restricted to things that reference does not offer. The <strong>SQLite arm</strong>{' '}
              runs the reimplemented schema in process through <span className="mono">node:sqlite</span>,
              with secondary indexes, foreign keys and an FTS5 index over bodies. The{' '}
              <strong>PostgreSQL arm</strong> runs the same schema through PGlite, adding range-typed
              validity, a GiST exclusion constraint, and a GIN index over{' '}
              <span className="mono">to_tsvector</span>. Two ablations drop every secondary index.
            </p>
            <p>
              <strong>What the emulator is not.</strong> We hold no Notion workspace and issue no
              requests. Wall-clock through an emulator measures our own JavaScript, so we do not report
              it. What we report instead are counts — requests, bytes, and rows the client had to
              examine — which are fixed by the API&rsquo;s shape rather than by anyone&rsquo;s network.
              The documented average of {limits.requestsPerSecond} requests per second then converts a
              request count into a floor on wall-clock that no bandwidth removes. §14 states what this
              cannot capture.
            </p>
          </div>

          <h3 className="heading-20">7.4 Scoring</h3>
          <div className="prose">
            <p>
              Answers here are sets, not ranked lists, because every question in this workload has a
              definite answer rather than a best guess. We report set F<sub>1</sub> and, more
              importantly, the <em>exact</em> rate — the share of questions where the returned set is
              the correct set with nothing added and nothing missing. For a memory system that is the
              number that matters: an agent acting on a nearly-correct set of facts acts wrongly.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------- expressibility */}
        <section id="expressibility" className="section">
          <h2 className="heading-24">8. Expressibility and cost</h2>
          <div className="prose">
            <p>
              The first result is the one we did not expect to have to lead with:{' '}
              <strong>the vault is correct</strong>. Across the whole workload the Notion arm returns
              the exactly-correct set for {pct(capture.byArm.notion.exact, 1)} of questions, the same
              as SQLite and within a rounding of PostgreSQL, whose {n((1 - capture.byArm.postgres.exact) * capture.workload.instances, 0)}{' '}
              divergences are the full-text stemming case dissected in §10.2 rather than an error.
            </p>
            <p>
              A critique that expected the substrate to give wrong answers would stop here, and it
              would be wrong to. The Data API is not a bad store. It is a store that will do the work
              if you send it enough requests — and the question this paper is actually about is how
              many.
            </p>
          </div>

          <Figure title="Table 10 — Correctness and cost, by arm" full>
            <ArmTable />
          </Figure>
          <Figure
            title="Table 11 — Exact-answer rate by class"
            caption="Flat, and that is the point. The differences between these stores are not in this table."
            full
          >
            <CorrectnessMatrix />
          </Figure>

          <h3 className="heading-20">8.1 Amplification</h3>
          <div className="prose">
            <p>
              Every question in this workload is one statement in SQL. The same questions cost the
              Data API a mean of {n(capture.byArm.notion.roundTrips, 1)} requests, and the
              distribution is wildly uneven: two classes cost two or three requests, and two cost more
              than a thousand.
            </p>
          </div>

          <Figure
            title="Figure 5 — Requests per question, by class"
            caption="Logarithmic, because a linear axis would render eight of the ten classes as a flat line against body search. Every bar is a mean over that class's instances."
            full
          >
            <BarChart
              tableLabel="Mean requests per question by class"
              unit="requests"
              format={(v) => n(v, v < 10 ? 2 : 0)}
              data={[...classes]
                .sort((a, b) => (amp(b.id)?.notionRoundTrips ?? 0) - (amp(a.id)?.notionRoundTrips ?? 0))
                .map((c) => ({
                  label: c.label,
                  value: amp(c.id)?.notionRoundTrips ?? 0,
                  emphasis: (amp(c.id)?.roundTrips ?? 0) > 100,
                }))}
            />
          </Figure>

          <Figure title="Table 12 — Request amplification" full>
            <AmplificationTable />
          </Figure>

          <h3 className="heading-20">8.2 The join that is not there</h3>
          <div className="prose">
            <p>
              Provenance is the cleanest case, and it is one question:{' '}
              <em>which claims about this predicate came from a memory written by this author?</em> The
              author lives on Memories. The fact points at the memory through a{' '}
              <span className="mono">Source</span> relation. In SQL that is a join and the planner
              picks an index. Through the Data API there is no way to filter Facts by a property of the
              page its relation points at, so the client queries Facts, then retrieves each candidate
              memory by identifier, then filters on author locally: {n(provenance.notionRoundTrips, 0)}{' '}
              requests, {n(provenance.rowsClientSide, 0)} rows examined in the client,{' '}
              {duration(provenance.notionFloorSeconds)} of floor.
            </p>
          </div>

          <Plate label="Figure 6">
            <RoundTripDiagram />
          </Plate>

          <div className="prose">
            <p>
              The other join-shaped classes behave the same way at smaller scale. Following a decision
              chain costs {n(amp('supersession')?.notionRoundTrips ?? 0, 2)} requests because{' '}
              <span className="mono">Supersedes</span> is a{' '}
              <span className="mono">single_property</span> self-relation with no reverse edge, so
              &ldquo;what replaced this&rdquo; is a filter and the walk pays a request per hop; a
              recursive CTE does the whole closure in one statement. Two joins deep — facts about
              entities introduced by memories a given author wrote — costs{' '}
              {n(amp('cross-db')?.notionRoundTrips ?? 0, 1)}, and the client has to chunk its own
              disjunction because <span className="mono">relation contains</span> takes one page
              identifier at a time and the payload cap is {bytes(limits.payloadBytes)}.
            </p>
            <p>
              Finding contradictions is the aggregate case. It is a self-join with an overlap
              predicate, and there is no way to express either, so the client fetches every fact on a
              functional predicate and compares them pairwise: {n(amp('conflict-scan')?.notionRoundTrips ?? 0, 0)}{' '}
              requests and {n(amp('conflict-scan')?.rowsClientSide ?? 0, 0)} row-comparisons here. This
              is why Lore ships <span className="mono">lore conflicts scan</span> with a documented cap
              of {schema.scanCaps[0]?.value} raw candidates per project, and why bypassing the cap is
              described in its own source as &ldquo;full O(n²) coverage&rdquo;.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------- integrity */}
        <section id="integrity" className="section">
          <h2 className="heading-24">9. Integrity</h2>
          <div className="prose">
            <p>
              Cost is the half of the story a reader expects. The other half is what the store will
              refuse, and it is the half where the gap is not a multiple but a categorical difference.
              A database&rsquo;s central service is not answering questions; it is declining to enter
              states that would make future answers wrong.
            </p>
            <p>
              We took {schema.invariants.length} invariants from the schema, named the DDL that would
              enforce each one declaratively, and attacked them.{' '}
              {unenforcedInvariants.length} of the {schema.invariants.length} have no declarative
              enforcement anywhere in the substrate.
            </p>
          </div>

          <Figure title="Table 13 — Invariants and what enforces them" full>
            <InvariantTable />
          </Figure>
          <Plate label="Figure 7">
            <ConstraintDiagram />
          </Plate>

          <h3 className="heading-20">9.1 Concurrent upsert</h3>
          <div className="prose">
            <p>
              Lore upserts a topic-keyed memory by reading the vault for a matching row and then either
              creating or patching. The Data API documents no conditional write, so the window between
              the read and the write cannot be closed from the client. Lore knows this and says so:
            </p>
          </div>

          <Src file="src/core/memory-topic-key.ts">
            &ldquo;Concurrent upserts remain a single-agent serial workflow. Two parallel saves with
            the same <span className="mono">topicKey</span> can both find no existing match and both
            create fresh rows with <span className="mono">Revision Count: 1</span>; Notion provides no
            per-key uniqueness enforcement.&rdquo;
          </Src>

          <div className="prose">
            <p>
              We ran the interleave explicitly rather than depending on a scheduler, because a
              scheduler-dependent result is not a measurement. With {conc.writers} writers over{' '}
              {n(conc.rounds)} rounds, every writer reading before any writer writes — the worst case
              the protocol admits and the one the API gives no way to exclude — the read-then-write
              path lost {pct(conc.notion.lostUpdateRate)} of its {n(conc.writesAttempted)} updates and
              left {n(conc.notion.duplicateRows)} duplicate rows for a key that should have one. The
              same workload through <span className="mono">INSERT … ON CONFLICT</span> against a unique
              index lost {pct(conc.sql.lostUpdateRate)} and left {n(conc.sql.duplicateRows)}. This is
              the lost update of Gray <Cite n={51} /> and Berenson <Cite n={52} />, arriving in 2026 by
              a new route.
            </p>
          </div>

          <Figure title="Table 14 — Concurrent upsert on one topic key" full>
            <ConcurrencyTable />
          </Figure>
          <Figure
            title="Figure 8 — Loss against writer count"
            caption="Measured at 2, 4, 8 and 16 writers. The unique-index arm is flat at zero, which is why it is drawn rather than omitted."
            full
          >
            <GroupedBars
              tableLabel="Lost update rate by writer count"
              unit="lost updates"
              format={(v) => pct(v, 0)}
              groups={exp.concurrencySweep.map((p) => ({
                label: `${p.writers} writers`,
                bars: [
                  { label: 'read-then-write', value: p.notionLostUpdateRate },
                  { label: 'unique index', value: p.sqlLostUpdateRate },
                ],
              }))}
            />
          </Figure>

          <h3 className="heading-20">9.2 A temporal primary key</h3>
          <div className="prose">
            <p>
              Some predicates are functional: a service has one owner at a time. That is a constraint,
              and PostgreSQL can declare it — an exclusion constraint over a range type saying that no
              two rows may share a subject and a predicate while their validity intervals overlap. Once
              declared, the write that would create the contradiction is the write that fails, and no
              scan is needed because the state is unreachable.
            </p>
            <p>
              The experiment has two halves, and the first half is the more telling. We built the
              constraint against the vault <em>as generated</em> and PostgreSQL refused to create it,
              because {n(temporal.trueConflictKeys)} subject-predicate pairs already violate it. The
              engine declined to certify data written without it. The second half loads the same rows
              one at a time with the constraint in place: {n(temporal.postgres.insertedUnderConstraint.accepted)}{' '}
              accepted, <strong>{n(temporal.postgres.insertedUnderConstraint.rejected)} rejected</strong>,
              and the rejections are precisely the writes that would have created a contradiction. The
              vault rejected {n(temporal.notion.rejectedWrites)} of them.
            </p>
            <p>
              We want to be fair about what this shows. Lore is not unaware of contradictions — it
              ships a scanner for them, with a verdict workflow and an adjudication trail, and the
              scanner exists precisely because the store cannot refuse the write. The comparison is
              between <em>preventing</em> a state and <em>detecting</em> it afterwards at O(n²) cost
              under a cap of {schema.scanCaps[0]?.value}. Detection is a real and useful thing to ship.
              It is not the same thing.
            </p>
          </div>

          <Figure title="Table 15 — The exclusion constraint" full>
            <TemporalTable />
          </Figure>

          <h3 className="heading-20">9.3 Referential integrity</h3>
          <div className="prose">
            <p>
              A relation property is not a foreign key. It holds page identifiers, and nothing checks
              them at write time or complains at read time. When a memory that facts already cite is
              archived, every relation pointing at it stays intact and stays wrong. In our vault{' '}
              {n(exp.dangling.archivedMemories)} such memories were archived, leaving{' '}
              {n(exp.dangling.notion.danglingPointers)} claims whose provenance the store can no longer
              return. Under <span className="mono">ON DELETE RESTRICT</span> the same operation is
              refused {n(exp.dangling.sql.refusedWrites)} times out of{' '}
              {n(exp.dangling.archivedMemories)} and leaves {n(exp.dangling.sql.danglingPointers)}{' '}
              orphans.
            </p>
            <p>
              This one bit us, twice, inside our own tooling. The subsampling routine that builds
              smaller vaults for the scaling experiment has to compute referential closure by hand over
              five foreign keys; both times we missed one, and both times the SQLite arm failed
              immediately and loudly while every other path would have carried the broken state
              silently. We have left the incident in a comment in the source, because it is the
              paper&rsquo;s argument arriving unannounced in the paper&rsquo;s own machinery.
            </p>
          </div>

          <Figure title="Table 16 — Archiving a cited memory" full>
            <DanglingTable />
          </Figure>

          <h3 className="heading-20">9.4 Entity resolution</h3>
          <div className="prose">
            <p>
              Nothing gives a Notion title a unique index, so the same real thing can be introduced
              twice by two sessions — once under its name and once under its handle. Our vault contains{' '}
              {n(res.duplicatePairs)} such pairs, {pct(res.duplicateRate, 2)} of all entities, and{' '}
              {n(res.splitSubjects)} subjects have their facts split across both rows. An agent asking
              about one row gets a partial answer and no signal that a second row exists.
            </p>
            <p>
              Lore&rsquo;s merge is careful — non-destructive, idempotent on retry, and archiving the
              loser only after every fact relation has moved — but it is explicitly single-hop, so a
              chain A → B → C requires two merges and there is no transitive closure of the kind
              Swoosh formalises <Cite n={47} />. The cost of a merge is also structural: it is one page
              update per affected row, non-atomic, at {limits.requestsPerSecond} requests per second.
              The mean merge in our vault touches {n(res.merge.pageUpdatesPerMerge, 1)} pages and the
              largest touches {n(res.merge.maxPageUpdates)}. The same merge in SQL is{' '}
              {n(res.merge.sqlStatements)} statements inside one transaction, which either all happen
              or none do.
            </p>
          </div>

          <Figure title="Table 17 — Entity resolution" full>
            <ResolutionTable />
          </Figure>

          <h3 className="heading-20">9.5 Where the measurement disappointed us</h3>
          <div className="prose">
            <p>
              We predicted that resolving an alias through a comma-joined cell would be expensive,
              because the only operator that reaches inside the cell is a substring test and substring
              tests over-match. We built the vault with {n(capture.injected.collidingAliases.length)}{' '}
              aliases deliberately constructed as prefixes of others, and measured.
            </p>
            <p>
              The effect is real and it is small. Across {n(exp.alias.terms)} alias terms, the
              substring filter returned {n(exp.alias.candidatesFetched)} rows where{' '}
              {n(exp.alias.exactMatches)} were exact matches — {n(exp.alias.rowsFetchedAndDiscarded)}{' '}
              rows fetched and discarded, or {pct(exp.alias.wastedShare)} of the traffic. At this
              vault&rsquo;s alias density the 1NF violation costs one extra query and a client-side
              re-split, not a flood of false candidates. We report it because a critique that only
              prints the measurements that went its way is not a measurement, and because the shape of
              the risk is worth stating even when the magnitude is not: the over-match grows with the
              number of aliases sharing a prefix, and nothing in the schema bounds that number.
            </p>
          </div>

          <Figure title="Table 18 — Alias resolution" full>
            <AliasTable />
          </Figure>

          <h3 className="heading-20">9.6 The update anomaly</h3>
          <div className="prose">
            <p>
              The Boyce-Codd violation of §5.3 has a downstream cost that no amount of careful merging
              fixes, because it is not about the Facts table at all. A fact is restated across memories
              — a mean of {n(exp.anomaly.restatementMean, 2)} times in our vault, a maximum of{' '}
              {n(exp.anomaly.restatementMax)} — and those restatements are prose. When the fact
              changes, the Fact row is updated and the prose is not.
            </p>
            <p>
              Across {n(exp.anomaly.closedFacts)} facts whose validity has closed, we found{' '}
              {n(exp.anomaly.staleRestatements)} memories still asserting the closed value — a mean of{' '}
              {n(exp.anomaly.meanPerClosedFact, 2)} per fact. For {n(exp.anomaly.factsWhoseStaleCopiesFillTopK)}{' '}
              facts, the stale restatements alone would fill a top-ten recall. An agent that retrieves
              memories rather than facts retrieves the old answer, in a confident sentence somebody
              wrote, with no marker distinguishing it from the current one.
            </p>
          </div>

          <Figure title="Table 19 — Stale restatements" full>
            <AnomalyTable />
          </Figure>
        </section>

        {/* ------------------------------------------------------- retrieval */}
        <section id="retrieval" className="section">
          <h2 className="heading-24">10. Retrieval</h2>

          <h3 className="heading-20">10.1 The text is not where the filters are</h3>
          <div className="prose">
            <p>
              A memory in Lore has a title, properties, and a body of blocks. The body is where the
              sentence lives. Property filters cannot see blocks, and the search endpoint matches
              titles. So the only way to search completely over what memories <em>say</em>, through the
              documented API, is to enumerate every memory and fetch each one&rsquo;s children.
            </p>
            <p>
              At this vault&rsquo;s size that is {n(ceiling.now.totalRequests)} requests and{' '}
              {duration(ceiling.now.floorSeconds)}. Ten times larger is{' '}
              {duration(ceiling.x10.floorSeconds)}; a hundred times larger is{' '}
              {duration(ceiling.x100.floorSeconds)}. Either engine answers the same question with one
              statement against an inverted index it already maintains.
            </p>
          </div>

          <Figure title="Table 20 — The cost of a complete body search" full>
            <CeilingTable />
          </Figure>

          <div className="prose">
            <p>
              <strong>An important qualification.</strong> This measures what the <em>documented</em>{' '}
              Data API permits, which is what our emulator models. Lore in practice does not do this:
              it delegates ranking to Notion&rsquo;s own search — a REST endpoint that ranks over
              titles and bodies, and, behind a feature flag, an internal tool endpoint that is neither
              publicly documented nor available on every workspace tier. That is a sensible engineering
              choice and it changes the cost picture materially. It also means Lore owns no index: it
              cannot pre-filter a semantic query by project or tag (those filters are applied in the
              client, after ranking), it has no semantic path over Facts at all, and its retrieval
              quality depends on an endpoint that can be changed or disabled without notice. We could
              not measure that endpoint and do not claim to have. §14 restates this as the study&rsquo;s
              main limitation.
            </p>
          </div>

          <h3 className="heading-20">10.2 Two indexes, one text, two answers</h3>
          <div className="prose">
            <p>
              The workload turned up a result we did not design for. The phrase{' '}
              <span className="mono">timed out</span> matches nothing in our corpus as a literal
              substring — the memories say <em>times out</em>. SQLite&rsquo;s FTS5, whose default
              tokeniser does not stem, agrees: {n(ft.terms.find((t) => t.term === 'timed out')?.fts5 ?? 0)}{' '}
              rows. PostgreSQL, asked the same phrase, returns{' '}
              {n(ft.terms.find((t) => t.term === 'timed out')?.gin ?? 0)}.
            </p>
            <p>
              The reason is visible in the parse. <span className="mono">phraseto_tsquery(&apos;english&apos;, &apos;timed out&apos;)</span>{' '}
              produces the single lexeme <span className="mono">&apos;time&apos;</span>: the English
              configuration stems <em>timed</em> to <em>time</em> and drops <em>out</em> as a stopword,
              so a two-word phrase query collapses into a one-word one and matches every memory that
              mentions timing at all. Notion&rsquo;s search endpoint returns nothing for any of the
              eight phrases, because none of them appears in a title.
            </p>
            <p>
              None of the three is wrong. A stemmer is a considered position on what &ldquo;discusses
              this&rdquo; means, not a bug. What matters for a memory system is that the position is a
              choice, and that nothing in any of the three answers says which choice was made. An agent
              asking the same question of two vaults built on two engines reasons from two different
              sets of facts.
            </p>
          </div>

          <Figure title="Table 21 — Three indexes over the same text" full>
            <FullTextTable />
          </Figure>
        </section>

        {/* --------------------------------------------------------- ceiling */}
        <section id="ceiling" className="section">
          <h2 className="heading-24">11. The ceiling</h2>
          <div className="prose">
            <p>
              Lore&rsquo;s wake-up hook runs before the first response of every session and loads the
              latest digest, recent memories, active facts and task-matched context. It is the feature
              that makes the memory ambient rather than requested, and it is also where a memory
              system&rsquo;s recurring cost lives.
            </p>
            <p>
              Two quantities scale differently, and separating them is the point of this experiment.
              The <strong>payload</strong> is capped by construction — {exp.wakeup.config.recentMemories}{' '}
              memories, {exp.wakeup.config.activeFacts} facts — so the tokens injected into the model on
              every session start are nearly flat as the vault grows. The <strong>cost of assembling
              it</strong> is not, because the queries that produce it run against a growing store, and
              because the text the hook wants to quote lives in bodies, which is one request per memory.
            </p>
          </div>

          <Figure title="Table 22 — Wake-up cost as the vault grows" full>
            <WakeupTable />
          </Figure>

          <Figure
            title="Figure 9 — Assembly cost against payload size"
            caption="Requests to assemble the wake-up context, against the tokens that context contains. The second line is flat by design; the first is not."
            full
          >
            <ScalingChart
              xLabel="memories in the vault"
              yLabel="count"
              formatY={(v) => n(v)}
              series={[
                {
                  id: 'assemble',
                  label: 'requests to assemble',
                  points: exp.wakeup.points.map((p) => ({ x: p.memories, y: p.notion.roundTrips })),
                },
                {
                  id: 'tokens',
                  label: 'tokens injected (approx.)',
                  points: exp.wakeup.points.map((p) => ({ x: p.memories, y: p.notion.injectedTokensApprox })),
                },
              ]}
            />
          </Figure>

          <div className="prose">
            <p>
              The conclusion a practitioner should take from this is narrow and useful: a memory system
              that feels slow at scale is usually not slow because the prompt grew. It is slow because
              assembling a bounded prompt from an unbounded store costs a number of round trips that
              grows with the store, and a rate limit turns that number into seconds. Lore mitigates
              this thoughtfully — a per-session marker debounces the hook, the digest exists precisely
              to compress the starting context, and the hook can be turned off — but the mitigations are
              caps, and a cap is where a full scan was found to be infeasible.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- explore */}
        {/* The explorers are inert on paper, so the printed edition says where
            they are instead of printing twelve pages of their default state. */}
        <section className="section print-only">
          <h2 className="heading-24">12. Explore the evidence</h2>
          <div className="prose">
            <p>
              Three interactive explorers accompany the web edition: the cost of any one question
              class, the wake-up cost against vault size, and the upsert race at a chosen number of
              writers. They compute from the same dataset as every figure above, and they are
              omitted here because a control that cannot be operated is not evidence. They are at{' '}
              <span className="mono">{QR_URL}</span>, and the dataset behind them is at{' '}
              <span className="mono">{QR_URL}/capture.json</span>.
            </p>
          </div>
        </section>

        <section id="explore" className="section">
          <h2 className="heading-24">12. Explore the evidence</h2>
          <div className="prose">
            <p>
              Everything below is computed from the same dataset as the figures above. These are the
              parts of the argument that are easier to feel than to read.
            </p>
          </div>

          <Plate label="Explorer 1">
            <QueryCostExplorer />
          </Plate>
          <Plate label="Explorer 2">
            <VaultSizeExplorer />
          </Plate>
          <Plate label="Explorer 3">
            <WriterRaceExplorer />
          </Plate>
        </section>

        {/* ------------------------------------------------------ discussion */}
        <section id="discussion" className="section">
          <h2 className="heading-24">13. Discussion</h2>

          <h3 className="heading-20">13.1 What the trade actually buys</h3>
          <div className="prose">
            <p>
              It would be easy, and wrong, to read this paper as an argument that Lore should have used
              PostgreSQL. The things Lore gets from Notion are not conveniences.
            </p>
            <p>
              <strong>The memory is legible.</strong> A teammate can open the vault, read what the
              agent believes, and correct it, in a tool they already use, without a client or a query
              language. No system in the related work offers this. It is the reason a wrong fact gets
              fixed instead of accumulating.
            </p>
            <p>
              <strong>The permissions already exist.</strong> A vault inherits Notion&rsquo;s
              permission model. A bespoke store would need its own access control replicated from an
              identity provider, which is a well-known source of leaks. Lore gets a working
              authorisation story for free, and that is worth more than several of the guarantees it
              gives up.
            </p>
            <p>
              <strong>There is no infrastructure.</strong> No server, no backup policy, no migration
              window, no on-call rotation for the memory system itself. For a team of five to fifty
              engineers, the entire operational budget is a tool they already pay for.
            </p>
            <p>
              Against that: no uniqueness, no referential integrity, no atomicity across pages, no
              isolation, no joins, no aggregates, and a rate limit that turns every vault-wide operation
              into a scheduling problem. The honest summary is that Lore trades every guarantee a
              database declares for legibility, zero infrastructure and inherited permissions, and then
              re-implements the discarded guarantees as scanners, migrations and filesystem locks. What
              is unusual, and creditable, is how openly its own source records where the seams are.
            </p>
          </div>

          <h3 className="heading-20">13.2 Where the boundary actually is</h3>
          <div className="prose">
            <p>
              The measurements suggest a specific and non-obvious boundary. Lore&rsquo;s{' '}
              <em>retrieval</em> path is fine: bounded page windows, server-side filters, a capped
              payload. What degrades is <em>maintenance and analytics</em> — the conflict scan, the
              entity backfill, the debt sweep, the aggregate. Those are the operations that touch every
              row, and every one of them is O(n) HTTP requests paced by a per-operator token bucket.
              This is why Lore&rsquo;s caps cluster where they do, and why its own dogfood vault of
              roughly nine hundred facts already saturates the one server-side aggregate it attempts.
            </p>
            <p>
              A practitioner reading this should not conclude &ldquo;do not use Lore&rdquo;. They
              should conclude: the vault is the system of record because it is legible, and if the
              vault grows past the point where hygiene passes finish, the answer is a read-side
              projection — a local relational mirror that carries the indexes, the constraints and the
              joins, rebuilt from the vault, with the vault remaining the thing humans edit. That is an
              ordinary architecture with an ordinary name, and nothing in Lore&rsquo;s design forecloses
              it.
            </p>
          </div>

          <h3 className="heading-20">13.3 A note on security</h3>
          <div className="prose">
            <p>
              One observation falls outside the database framing but would be irresponsible to omit,
              because we met it while reading the source. Lore contains a careful prompt-injection
              containment layer for <em>upstream</em> vaults: inherited titles and tags are wrapped in
              inline code, backticks are doubled, control characters are stripped, and every line is
              labelled as untrusted so the model weights it down. None of that containment is applied
              to primary-vault content, which is written by an autosave summariser over conversation
              text, is editable in the Notion UI by any vault member, and is injected into every
              teammate&rsquo;s session at wake-up. The mitigation exists and is scoped to the boundary
              the authors considered external. A shared vault is a same-privilege channel among
              everyone with write access, and it is worth saying so.
            </p>
            <p>
              Relatedly, we note that Lore&rsquo;s documented background-hook invocation includes a
              flag that disables the assistant&rsquo;s permission prompts alongside a tool allowlist,
              and that the documentation acknowledges the allowlist may need out-of-band configuration.
              We did not test this and make no claim about exploitability; we record it because it
              interacts with the previous paragraph.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- threats */}
        <section id="threats" className="section">
          <h2 className="heading-24">14. Threats to validity</h2>
          <div className="prose">
            <p>
              <strong>The Notion arm is an emulator.</strong> We hold no workspace and issue no
              requests. Every restriction it enforces carries a reference page, and it refuses nothing
              the reference offers — but an emulator cannot capture server-side behaviour that is not
              documented, and we report counts rather than wall-clock for exactly that reason. A reader
              who wants the missing number should measure it against a real vault.
            </p>
            <p>
              <strong>We modelled the documented Data API, and Lore uses more than that.</strong> This
              is the most consequential limitation. Lore&rsquo;s search delegates to Notion&rsquo;s own
              ranking, including an internal endpoint that is undocumented and tier-gated. Our
              body-search figure of {n(ceiling.now.totalRequests)} requests describes what the
              documented API permits, not what Lore does. The direction of the error is known — Lore is
              cheaper than our figure on that class — and the structural point survives it: Lore owns
              no index, so it cannot pre-filter a semantic query, has no semantic path over Facts, and
              depends on an endpoint it does not control.
            </p>
            <p>
              <strong>The corpus is synthetic.</strong> The vault is generated, which is what makes the
              ground truth definitional and non-circular, and it is also what makes it not a real
              team&rsquo;s memory. Restatement rates, alias density and the frequency of ownership
              changes are parameters we chose. We report them, and the seed reproduces the vault
              exactly, but a real vault would have a different shape and might have a different alias
              over-match than the {pct(exp.alias.wastedShare)} we measured.
            </p>
            <p>
              <strong>Some claims about Lore&rsquo;s query surface are inference.</strong> We read the
              schema and a substantial part of the services, but not all of the code paths. Where we
              say the bitemporal surface is narrower than the schema (§6), or that supersession has no
              reverse edge, those are readings of the source rather than executions of it, and we have
              marked them.
            </p>
            <p>
              <strong>PGlite is not a server.</strong> PostgreSQL through WebAssembly is the same
              source tree, planner and type system, but it is not a claim about throughput and we make
              none. Nothing in this paper depends on a PostgreSQL latency number.
            </p>
            <p>
              <strong>The concurrency schedule is chosen, not observed.</strong> We place every read
              before every write because that is the worst case the protocol admits. Real interleavings
              are less adversarial and the real loss rate would be lower. The point is not the
              magnitude but that the API offers no way to make the rate zero.
            </p>
          </div>
        </section>

        {/* --------------------------------------------------------- related */}
        <section id="related" className="section">
          <h2 className="heading-24">15. Related work</h2>
          <div className="prose">
            <p>
              <strong>Agent memory systems.</strong> MemGPT framed memory as virtual paging with the
              model as its own memory manager <Cite n={3} />; Letta productionised it as shareable
              memory blocks maintained by asynchronous agents <Cite n={4} />. Generative Agents
              introduced the memory stream with recency-, importance- and relevance-weighted retrieval
              and periodic reflection <Cite n={9} /> — the ancestor of Lore&rsquo;s memory-to-fact
              promotion and of its confidence decay. Mem0 is the closest thing in the literature to a
              DML over agent memory, with explicit ADD, UPDATE, DELETE and NOOP operations{' '}
              <Cite n={5} />. A-MEM argues the opposite case to Lore&rsquo;s — that a fixed schema
              limits cross-task adaptability, and that notes should link themselves into an emergent
              network <Cite n={8} />. MemOS is the closest in spirit to this paper&rsquo;s framing,
              treating memory as a managed resource with provenance and version tracking{' '}
              <Cite n={21} />, and MIRIX independently arrives at a six-store typed decomposition{' '}
              <Cite n={22} />.
            </p>
            <p>
              <strong>Temporal knowledge graphs.</strong> Zep and its Graphiti engine are the sharpest
              prior art for Lore&rsquo;s Facts relation: both attach validity windows to
              subject-predicate-object edges, and Graphiti is explicit that old facts are invalidated
              rather than deleted, so a vault can be asked what was true at any point in time{' '}
              <Cite n={6} /><Cite n={7} />. Lore&rsquo;s schema matches this; §6 argues its query
              surface reaches less of it.
            </p>
            <p>
              <strong>Retrieval.</strong> The dense-retrieval baseline <Cite n={29} /> is complicated
              by BEIR&rsquo;s finding that BM25 generalises better out of distribution <Cite n={32} />{' '}
              and by Sciavolino and colleagues&rsquo; result that dense retrievers underperform badly
              on entity-centric questions <Cite n={33} /> — which is the regime agent memory lives in,
              and a good structural argument for Lore&rsquo;s typed Entities table over an
              undifferentiated vector store. Reciprocal rank fusion <Cite n={34} /> is the fusion rule
              Lore uses, at the constant its authors recommend.
            </p>
            <p>
              <strong>Databases.</strong> The relational model <Cite n={39} />, the
              entity-relationship model <Cite n={41} />, temporal databases <Cite n={42} />
              <Cite n={43} /><Cite n={44} />, slowly changing dimensions <Cite n={45} />, record
              linkage <Cite n={46} /><Cite n={47} />, provenance <Cite n={48} /><Cite n={49} />,
              transactions and isolation <Cite n={50} /><Cite n={51} /><Cite n={52} />, RDF and named
              graphs <Cite n={53} /><Cite n={55} />, truth maintenance <Cite n={56} />, belief revision{' '}
              <Cite n={57} />, probabilistic databases <Cite n={58} /> and knowledge-graph refinement{' '}
              <Cite n={60} />. This paper&rsquo;s claim is not that these are novel but that they are
              load-bearing, and that a memory system arriving at triples with validity intervals and a
              confidence has arrived somewhere with fifty years of results in it.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------ conclusion */}
        <section id="conclusion" className="section">
          <h2 className="heading-24">16. Conclusion</h2>
          <div className="prose">
            <p>
              Lore is a good schema on a substrate that cannot enforce it. Every one of the five
              databases is a relation a database designer would recognise, the fact table is bitemporal
              before most of the field has noticed that it should be, and the maintenance surface —
              conflict scans, entity merges, dedup backfills — is exactly the surface you build when
              you know what constraints you would like and cannot declare them.
            </p>
            <p>
              We measured what that costs. Not correctness: the vault answers{' '}
              {pct(capture.byArm.notion.exact, 1)} of a {n(vault.questions)}-question workload exactly,
              the same as both engines. It costs requests — {n(totalNotionRoundTrips)} of them against{' '}
              {n(totalSqlStatements)} statements, {duration(workloadFloorSeconds)} of rate-limit floor,
              {' '}{times(worstClass ? amp(worstClass.id).roundTrips : 1)} on the worst class — and it
              costs refusal. Eight agents on one topic key lose {pct(conc.notion.lostUpdateRate)} of
              their writes. {n(temporal.trueConflictKeys)} subject-predicate pairs assert two things at
              once, and the constraint that would have prevented every one of them refuses to be added
              to the vault at all.
            </p>
            <p>
              The lesson generalises past Lore. The agent-memory field is converging on triples with
              validity intervals, entity registries with aliases, provenance edges and confidence
              scores. That is a database schema. The question every such system has to answer is not
              which embedding model to use; it is which of the guarantees a database provides it is
              choosing to do without, and what it will do instead. Lore answers that question more
              explicitly than most, in comments in its own source. The contribution of this paper is to
              put the numbers next to the answer.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------ references */}
        <section id="references" className="section">
          <h2 className="heading-24">References</h2>
          <ol className="prose" style={{ fontSize: '0.94rem' }}>
            {REFERENCES.map((r, i) => (
              <li key={i + 1} id={`ref-${i + 1}`} style={{ marginBottom: '0.6rem' }}>
                {r.authors}. <em>{r.title}</em>. {r.venue}.{' '}
                {r.url ? <a className="cite" href={r.url}>{r.url.replace(/^https?:\/\//, '')}</a> : null}
              </li>
            ))}
          </ol>
        </section>

        {/* -------------------------------------------------------- appendix */}
        <section id="appendix" className="section">
          <h2 className="heading-24">Appendices</h2>

          <h3 className="heading-20">A. What we read</h3>
          <div className="prose">
            <p>
              Every claim this paper makes about Lore&rsquo;s implementation was read from one of these
              files, in a clone at commit <span className="mono">{s.commit}</span>.
            </p>
          </div>
          <SourceTable />

          <h3 className="heading-20">B. The DDL both engines execute</h3>
          <div className="prose">
            <p>
              Generated from the same declaration as the diagram in §4. The PostgreSQL dialect is shown;
              the SQLite dialect differs only in type names and in the constraints SQLite cannot express.
            </p>
          </div>
          <pre className="code-block"><code>{schema.ddl.postgres.join(';\n\n')};</code></pre>

          <h3 className="heading-20">C. The constraints Notion cannot express</h3>
          <pre className="code-block"><code>{schema.extraConstraints.postgres.map((c) => `-- ${c.id}${c.note ? `: ${c.note}` : ''}\n${c.sql};`).join('\n\n')}</code></pre>

          <h3 className="heading-20">D. Toolchain and reproduction</h3>
          <ToolchainTable />
          <div className="prose">
            <p>
              The whole dataset regenerates with{' '}
              <span className="mono">npm install &amp;&amp; npm run paper</span>. There is no database
              server to install and no API key to set: SQLite comes from Node&rsquo;s built-in{' '}
              <span className="mono">node:sqlite</span>, and PostgreSQL runs through PGlite as
              WebAssembly. The vault is deterministic in its seed, so a rerun reproduces every number
              on this page.
            </p>
          </div>
        </section>

        <footer className="footer">
          <p>
            {AUTHORS.lead} · {AUTHORS.co.join(' · ')} · submitted to {AUTHORS.submittedTo}
          </p>
          <p className="meta">
            Measured {capturedOn} on {capture.machine.cpu}. Subject read at{' '}
            <span className="mono">{s.commit}</span>. Lore is © Notion Labs, Inc., used under the MIT
            licence; this paper is coursework and is not affiliated with Notion.
          </p>
        </footer>
      </main>
    </div>
  )
}

/* ----------------------------------------------------------------- refs */

const REFERENCES: { authors: string; title: string; venue: string; url?: string }[] = [
  { authors: 'Notion', title: 'Building Shared Memory for AI Agents in Notion', venue: 'Notion Engineering Blog, 2026', url: 'https://www.notion.com/blog/building-shared-memory-for-ai-agents-in-notion' },
  { authors: 'Notion (makenotion)', title: 'lore — persistent, shared AI memory backed by Notion for MCP-compatible assistants', venue: 'GitHub, MIT licence, commit 95c3558', url: 'https://github.com/makenotion/lore' },
  { authors: 'C. Packer, V. Fang, S. G. Patil, K. Lin, S. Wooders, J. E. Gonzalez', title: 'MemGPT: Towards LLMs as Operating Systems', venue: 'arXiv:2310.08560, 2023', url: 'https://arxiv.org/abs/2310.08560' },
  { authors: 'Letta', title: 'Sleep-time agents and memory blocks', venue: 'Letta documentation', url: 'https://docs.letta.com/guides/agents/architectures/sleeptime/' },
  { authors: 'P. Chhikara, D. Khant, S. Aryan, T. Singh, D. Yadav', title: 'Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory', venue: 'arXiv:2504.19413, 2025', url: 'https://arxiv.org/abs/2504.19413' },
  { authors: 'P. Rasmussen, P. Paliychuk, T. Beauvais, J. Ryan, D. Chalef', title: 'Zep: A Temporal Knowledge Graph Architecture for Agent Memory', venue: 'arXiv:2501.13956, 2025', url: 'https://arxiv.org/abs/2501.13956' },
  { authors: 'Zep AI', title: 'Graphiti — build temporal context graphs for AI agents', venue: 'GitHub, Apache-2.0', url: 'https://github.com/getzep/graphiti' },
  { authors: 'W. Xu, Z. Liang, K. Mei, H. Gao, J. Tan, Y. Zhang', title: 'A-MEM: Agentic Memory for LLM Agents', venue: 'arXiv:2502.12110, 2025', url: 'https://arxiv.org/abs/2502.12110' },
  { authors: 'J. S. Park, J. C. O’Brien, C. J. Cai, M. R. Morris, P. Liang, M. S. Bernstein', title: 'Generative Agents: Interactive Simulacra of Human Behavior', venue: 'UIST ’23, ACM', url: 'https://dl.acm.org/doi/10.1145/3586183.3606763' },
  { authors: 'N. Shinn, F. Cassano, E. Berman, A. Gopinath, K. Narasimhan, S. Yao', title: 'Reflexion: Language Agents with Verbal Reinforcement Learning', venue: 'NeurIPS 2023; arXiv:2303.11366', url: 'https://arxiv.org/abs/2303.11366' },
  { authors: 'G. Wang, Y. Xie, Y. Jiang, A. Mandlekar, C. Xiao, Y. Zhu, L. Fan, A. Anandkumar', title: 'Voyager: An Open-Ended Embodied Agent with Large Language Models', venue: 'arXiv:2305.16291, 2023', url: 'https://arxiv.org/abs/2305.16291' },
  { authors: 'V. Markovic, L. Obradovic, L. Hajdu, J. Pavlovic', title: 'Optimizing the Interface Between Knowledge Graphs and LLMs for Complex Reasoning (Cognee)', venue: 'arXiv:2505.24478, 2025', url: 'https://arxiv.org/abs/2505.24478' },
  { authors: 'LangChain', title: 'LangMem SDK for agent long-term memory', venue: 'LangChain Blog, 2025', url: 'https://www.langchain.com/blog/langmem-sdk-launch' },
  { authors: 'Anthropic', title: 'Effective context engineering for AI agents', venue: 'Anthropic Engineering Blog, 2025', url: 'https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents' },
  { authors: 'Anthropic', title: 'How Claude remembers your project (Claude Code memory)', venue: 'Claude Code documentation', url: 'https://code.claude.com/docs/en/memory' },
  { authors: 'OpenAI', title: 'Memory and new controls for ChatGPT', venue: 'OpenAI, 2024', url: 'https://openai.com/index/memory-and-new-controls-for-chatgpt/' },
  { authors: 'Z. Zhang, X. Bo, C. Ma, R. Li, X. Chen, Q. Dai, J. Zhu, Z. Dong, J.-R. Wen', title: 'A Survey on the Memory Mechanism of Large Language Model based Agents', venue: 'ACM TOIS; arXiv:2404.13501', url: 'https://arxiv.org/abs/2404.13501' },
  { authors: 'Y. Wu, S. Liang, C. Zhang, Y. Wang, Y. Zhang, H. Guo, R. Tang, Y. Liu', title: 'From Human Memory to AI Memory: A Survey on Memory Mechanisms in the Era of LLMs', venue: 'arXiv:2504.15965, 2025', url: 'https://arxiv.org/abs/2504.15965' },
  { authors: 'Y. Du, W. Huang, D. Zheng, Z. Wang, S. Montella, M. Lapata, K.-F. Wong, J. Z. Pan', title: 'Rethinking Memory in AI: Taxonomy, Operations, Topics, and Future Directions', venue: 'arXiv:2505.00675, 2025', url: 'https://arxiv.org/abs/2505.00675' },
  { authors: 'L. Mei et al.', title: 'A Survey of Context Engineering for Large Language Models', venue: 'arXiv:2507.13334, 2025', url: 'https://arxiv.org/abs/2507.13334' },
  { authors: 'Z. Li et al.', title: 'MemOS: A Memory OS for AI System', venue: 'arXiv:2507.03724, 2025', url: 'https://arxiv.org/abs/2507.03724' },
  { authors: 'Y. Wang, X. Chen', title: 'MIRIX: Multi-Agent Memory System for LLM-Based Agents', venue: 'arXiv:2507.07957, 2025', url: 'https://arxiv.org/abs/2507.07957' },
  { authors: 'A. Maharana, D.-H. Lee, S. Tulyakov, M. Bansal, F. Barbieri, Y. Fang', title: 'Evaluating Very Long-Term Conversational Memory of LLM Agents (LoCoMo)', venue: 'ACL 2024; arXiv:2402.17753', url: 'https://arxiv.org/abs/2402.17753' },
  { authors: 'D. Wu, H. Wang, W. Yu, Y. Zhang, K.-W. Chang, D. Yu', title: 'LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory', venue: 'ICLR 2025; arXiv:2410.10813', url: 'https://arxiv.org/abs/2410.10813' },
  { authors: 'Anthropic', title: 'Introducing the Model Context Protocol', venue: 'Anthropic News, 25 November 2024', url: 'https://www.anthropic.com/news/model-context-protocol' },
  { authors: 'Model Context Protocol', title: 'Specification, revision 2024-11-05', venue: 'modelcontextprotocol.io', url: 'https://modelcontextprotocol.io/specification/2024-11-05' },
  { authors: 'Notion', title: 'Notion API reference: request limits, pagination, database query, search', venue: 'developers.notion.com', url: 'https://developers.notion.com/reference/request-limits' },
  { authors: 'P. Lewis et al.', title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', venue: 'NeurIPS 2020; arXiv:2005.11401', url: 'https://arxiv.org/abs/2005.11401' },
  { authors: 'V. Karpukhin et al.', title: 'Dense Passage Retrieval for Open-Domain Question Answering', venue: 'EMNLP 2020; arXiv:2004.04906', url: 'https://arxiv.org/abs/2004.04906' },
  { authors: 'L. Gao, X. Ma, J. Lin, J. Callan', title: 'Precise Zero-Shot Dense Retrieval without Relevance Labels (HyDE)', venue: 'ACL 2023; arXiv:2212.10496', url: 'https://arxiv.org/abs/2212.10496' },
  { authors: 'S. Robertson, H. Zaragoza', title: 'The Probabilistic Relevance Framework: BM25 and Beyond', venue: 'Foundations and Trends in IR 3(4), 2009', url: 'https://dl.acm.org/doi/10.1561/1500000019' },
  { authors: 'N. Thakur, N. Reimers, A. Rücklé, A. Srivastava, I. Gurevych', title: 'BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models', venue: 'NeurIPS 2021; arXiv:2104.08663', url: 'https://arxiv.org/abs/2104.08663' },
  { authors: 'C. Sciavolino, Z. Zhong, J. Lee, D. Chen', title: 'Simple Entity-Centric Questions Challenge Dense Retrievers', venue: 'EMNLP 2021; arXiv:2109.08535', url: 'https://arxiv.org/abs/2109.08535' },
  { authors: 'G. V. Cormack, C. L. A. Clarke, S. Büttcher', title: 'Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods', venue: 'SIGIR ’09', url: 'https://dl.acm.org/doi/10.1145/1571941.1572114' },
  { authors: 'S. Bruch, S. Gai, A. Ingber', title: 'An Analysis of Fusion Functions for Hybrid Retrieval', venue: 'ACM TOIS 42(1), 2023; arXiv:2210.11934', url: 'https://arxiv.org/abs/2210.11934' },
  { authors: 'D. Edge et al.', title: 'From Local to Global: A Graph RAG Approach to Query-Focused Summarization', venue: 'arXiv:2404.16130, 2024', url: 'https://arxiv.org/abs/2404.16130' },
  { authors: 'B. J. Gutiérrez, Y. Shu, Y. Gu, M. Yasunaga, Y. Su', title: 'HippoRAG: Neurobiologically Inspired Long-Term Memory for Large Language Models', venue: 'NeurIPS 2024; arXiv:2405.14831', url: 'https://arxiv.org/abs/2405.14831' },
  { authors: 'B. J. Gutiérrez, Y. Shu, W. Qi, S. Zhou, Y. Su', title: 'From RAG to Memory: Non-Parametric Continual Learning for Large Language Models', venue: 'ICML 2025; arXiv:2502.14802', url: 'https://arxiv.org/abs/2502.14802' },
  { authors: 'E. F. Codd', title: 'A Relational Model of Data for Large Shared Data Banks', venue: 'CACM 13(6):377–387, 1970', url: 'https://dl.acm.org/doi/10.1145/362384.362685' },
  { authors: 'E. F. Codd', title: 'Recent Investigations into Relational Data Base Systems', venue: 'IFIP Congress 1974, pp. 1017–1021' },
  { authors: 'P. P.-S. Chen', title: 'The Entity-Relationship Model — Toward a Unified View of Data', venue: 'ACM TODS 1(1):9–36, 1976', url: 'https://dl.acm.org/doi/10.1145/320434.320440' },
  { authors: 'R. T. Snodgrass (ed.)', title: 'The TSQL2 Temporal Query Language', venue: 'Kluwer Academic Publishers, 1995' },
  { authors: 'C. S. Jensen, C. E. Dyreson et al.', title: 'The Consensus Glossary of Temporal Database Concepts', venue: 'LNCS 1399, Springer, 1998', url: 'https://link.springer.com/chapter/10.1007/BFb0053710' },
  { authors: 'K. Kulkarni, J.-E. Michels', title: 'Temporal Features in SQL:2011', venue: 'ACM SIGMOD Record 41(3):34–43, 2012', url: 'https://dl.acm.org/doi/10.1145/2380776.2380786' },
  { authors: 'R. Kimball, M. Ross', title: 'The Data Warehouse Toolkit, 3rd edition', venue: 'John Wiley & Sons, 2013' },
  { authors: 'I. P. Fellegi, A. B. Sunter', title: 'A Theory for Record Linkage', venue: 'JASA 64(328):1183–1210, 1969', url: 'https://www.tandfonline.com/doi/abs/10.1080/01621459.1969.10501049' },
  { authors: 'O. Benjelloun, H. Garcia-Molina, D. Menestrina, Q. Su, S. E. Whang, J. Widom', title: 'Swoosh: A Generic Approach to Entity Resolution', venue: 'The VLDB Journal 18(1):255–276, 2009', url: 'https://link.springer.com/article/10.1007/s00778-008-0098-x' },
  { authors: 'P. Buneman, S. Khanna, W.-C. Tan', title: 'Why and Where: A Characterization of Data Provenance', venue: 'ICDT 2001, LNCS 1973', url: 'https://link.springer.com/chapter/10.1007/3-540-44503-X_20' },
  { authors: 'J. Cheney, L. Chiticariu, W.-C. Tan', title: 'Provenance in Databases: Why, How, and Where', venue: 'Foundations and Trends in Databases 1(4):379–474, 2009', url: 'https://homepages.inf.ed.ac.uk/jcheney/publications/provdbsurvey.pdf' },
  { authors: 'T. Härder, A. Reuter', title: 'Principles of Transaction-Oriented Database Recovery', venue: 'ACM Computing Surveys 15(4):287–317, 1983', url: 'https://dl.acm.org/doi/10.1145/289.291' },
  { authors: 'J. N. Gray, R. A. Lorie, G. R. Putzolu, I. L. Traiger', title: 'Granularity of Locks and Degrees of Consistency in a Shared Data Base', venue: 'Modelling in Data Base Management Systems, North Holland, 1976' },
  { authors: 'H. Berenson, P. A. Bernstein, J. Gray, J. Melton, E. O’Neil, P. O’Neil', title: 'A Critique of ANSI SQL Isolation Levels', venue: 'SIGMOD ’95', url: 'https://dl.acm.org/doi/10.1145/223784.223785' },
  { authors: 'R. Cyganiak, D. Wood, M. Lanthaler (eds.)', title: 'RDF 1.1 Concepts and Abstract Syntax', venue: 'W3C Recommendation, 2014', url: 'https://www.w3.org/TR/rdf11-concepts/' },
  { authors: 'S. Harris, A. Seaborne (eds.)', title: 'SPARQL 1.1 Query Language', venue: 'W3C Recommendation, 2013', url: 'https://www.w3.org/TR/sparql11-query/' },
  { authors: 'J. J. Carroll, C. Bizer, P. Hayes, P. Stickler', title: 'Named Graphs, Provenance and Trust', venue: 'WWW ’05, ACM', url: 'https://dl.acm.org/doi/10.1145/1060745.1060835' },
  { authors: 'J. Doyle', title: 'A Truth Maintenance System', venue: 'Artificial Intelligence 12(3):231–272, 1979', url: 'https://www.sciencedirect.com/science/article/abs/pii/0004370279900080' },
  { authors: 'C. E. Alchourrón, P. Gärdenfors, D. Makinson', title: 'On the Logic of Theory Change: Partial Meet Contraction and Revision Functions', venue: 'Journal of Symbolic Logic 50(2):510–530, 1985' },
  { authors: 'D. Suciu, D. Olteanu, C. Ré, C. Koch', title: 'Probabilistic Databases', venue: 'Morgan & Claypool, 2011' },
  { authors: 'X. L. Dong et al.', title: 'Knowledge Vault: A Web-Scale Approach to Probabilistic Knowledge Fusion', venue: 'KDD ’14, pp. 601–610', url: 'https://www.cs.ubc.ca/~murphyk/papers/kv-kdd14.pdf' },
  { authors: 'H. Paulheim', title: 'Knowledge Graph Refinement: A Survey of Approaches and Evaluation Methods', venue: 'Semantic Web 8(3):489–508, 2017', url: 'https://dl.acm.org/doi/10.3233/SW-160218' },
]
