/* The tables.
 *
 * Every one of these reads `capture.json` and formats it. None of them contains
 * a number. That is the rule the whole repository is built around: if a figure
 * in the paper disagrees with the dataset, the build is wrong, not the prose —
 * because the prose cannot disagree with the dataset, it does not hold any
 * numbers to disagree with.
 *
 * A second rule, less obvious and more important for a paper making a critical
 * argument: a table that flatters the argument is worth less than one that does
 * not. Where the measurement came out smaller than the thesis would like — the
 * alias over-match, the wake-up hook, the classes where the substrate does fine
 * — the table prints it at the same size as everything else.
 *
 * These are server components. The dataset is a build-time artifact, so there is
 * nothing to hydrate.
 */

import type { ReactNode } from 'react'
import {
  capture, schema, exp, limits, vault, classes, arms, primaryArms,
  armClass, amp, n, pct, times, bytes, duration,
} from '@/lib/data'

/* ------------------------------------------------------------------ atoms */

function Wrap({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="table-wrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  )
}

const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

/** A yes/no that survives greyscale, because the word is the signal. */
function Flag({ on, yes = 'yes', no = '—' }: { on: boolean; yes?: string; no?: string }) {
  return on ? <span className="pill pill-bad">{yes}</span> : <span style={{ color: 'var(--text-faint)' }}>{no}</span>
}

/* ------------------------------------------------------- the five databases */

/**
 * What `lore init` creates. The property counts are computed from the schema
 * declaration rather than counted by hand, so they cannot fall behind it.
 */
export function DatabaseTable() {
  return (
    <Wrap label="The five Notion databases Lore creates">
      <table>
        <caption className="meta">
          Read from <span className="mono">{schema.source.schemaFile}</span> at commit{' '}
          <span className="mono">{schema.source.commit}</span>.
        </caption>
        <thead>
          <tr>
            <th scope="col">Database</th>
            <th scope="col">Title property</th>
            <th scope="col" style={num}>Properties</th>
            <th scope="col" style={num}>Relations</th>
            <th scope="col" style={num}>Derived</th>
            <th scope="col" style={num}>System-managed</th>
          </tr>
        </thead>
        <tbody>
          {capture.subject.databases.map((db) => {
            const c = schema.propertyCounts[db.name]
            return (
              <tr key={db.name}>
                <th scope="row">{db.name}</th>
                <td className="mono">{db.title}</td>
                <td style={num}>{c ? n(c.total) : '—'}</td>
                <td style={num}>{c ? n(c.relations) : '—'}</td>
                <td style={num}>{c ? n(c.derived) : '—'}</td>
                <td style={num}>{c ? n(c.systemManaged) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Wrap>
  )
}

/* --------------------------------------------------- the documented limits */

/**
 * The constraints the emulator enforces, each with the page it comes from. This
 * table is the paper's warrant: it is what makes the Notion arm a model of a
 * documented interface rather than a straw man.
 */
export function ApiLimitsTable() {
  const rows: { what: string; value: string; source: string }[] = [
    { what: 'Rows per request', value: `${limits.pageSizeDefault} default, ${limits.pageSizeMax} maximum`, source: 'pagination' },
    { what: 'Request rate, one connection', value: `${limits.requestsPerSecond} per second on average`, source: 'requestLimits' },
    { what: 'rich_text value', value: `${n(limits.richTextChars)} characters`, source: 'requestLimits' },
    { what: 'Relation property', value: `${limits.relationPages} related pages`, source: 'requestLimits' },
    { what: 'multi_select property', value: `${limits.multiSelectOptions} options`, source: 'requestLimits' },
    { what: 'Request payload', value: bytes(limits.payloadBytes), source: 'requestLimits' },
    { what: 'Joins across databases', value: limits.joins, source: 'query' },
    { what: 'Aggregate functions', value: limits.aggregates, source: 'query' },
    { what: 'Search endpoint matches', value: limits.searchMatches, source: 'search' },
    { what: 'Conditional writes', value: limits.conditionalWrites, source: 'pagination' },
  ]
  return (
    <Wrap label="Documented Notion Data API limits">
      <table>
        <thead>
          <tr>
            <th scope="col">Constraint</th>
            <th scope="col">Documented value</th>
            <th scope="col">Reference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.what}>
              <th scope="row">{r.what}</th>
              <td>{r.value}</td>
              <td>
                <a className="cite" href={limits.sources[r.source]}>
                  {new URL(limits.sources[r.source]).pathname.replace('/reference/', '')}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

/* ---------------------------------------------------------------- the vault */

export function VaultTable() {
  const rows: [string, string, string][] = [
    ['Memories', n(vault.memories), `${n(vault.archivedMemories)} archived`],
    ['Facts', n(vault.facts), `${n(vault.openIntervals)} open, ${n(vault.closedIntervals)} closed`],
    ['Entities', n(vault.entities), `${n(vault.aliases)} aliases in ${n(vault.aliasCells)} cells`],
    ['Projects and topics', n(vault.projects + vault.topics), `${n(vault.projects)} projects`],
    ['Sessions', n(vault.sessions), 'across 540 simulated days'],
    ['Questions', n(vault.questions), `${classes.length} classes`],
  ]
  return (
    <Wrap label="Composition of the generated vault">
      <table>
        <caption className="meta">
          Seed <span className="mono">{capture.vaultMeta.seed}</span>, scale{' '}
          <span className="mono">{capture.vaultMeta.scale}</span>. Regenerating with the same seed
          reproduces this vault exactly.
        </caption>
        <thead>
          <tr>
            <th scope="col">Relation</th>
            <th scope="col" style={num}>Rows</th>
            <th scope="col">Composition</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v, note]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td style={num}>{v}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

/** The defects injected on purpose, with their ground-truth extent. */
export function InjectedTable() {
  const inj = capture.injected
  const rows: [string, number, string][] = [
    ['Duplicate entity rows', inj.duplicateEntities.length, 'the same service introduced twice, by two sessions'],
    ['Facts with a stale Subject title', inj.staleSubjectFacts.length, 'the state an entity merge leaves behind'],
    ['Subject-predicate pairs with overlapping validity', inj.overlappingIntervals.length, 'a new owner asserted without closing the old one'],
    ['Memories archived after facts cite them', inj.danglingProvenance.length, 'a relation pointing at a page in the trash'],
    ['Aliases that are a prefix of another', inj.collidingAliases.length, 'so a substring filter over the joined cell over-matches'],
    ['Distractor memories', inj.distractorMemories, 'name an identifier, assert nothing about it'],
  ]
  return (
    <Wrap label="Defects injected into the vault">
      <table>
        <thead>
          <tr>
            <th scope="col">Defect</th>
            <th scope="col" style={num}>Count</th>
            <th scope="col">Why it is there</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v, why]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td style={num}>{n(v)}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

/* --------------------------------------------------------------- workload */

/**
 * The ten question classes and the relational algebra each needs. The column
 * that carries the paper is the last one: what the Data API can state as a
 * query, as opposed to what a client has to compute after the query returns.
 */
export function WorkloadTable() {
  return (
    <Wrap label="The ten question classes">
      <table>
        <thead>
          <tr>
            <th scope="col">Class</th>
            <th scope="col">Raised by</th>
            <th scope="col">Minimum algebra</th>
            <th scope="col" style={num}>Instances</th>
            <th scope="col">Data API</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.label}</th>
              <td className="mono" style={{ fontSize: '0.86em' }}>{c.surface}</td>
              <td className="mono">{c.algebra.join(' ')}</td>
              <td style={num}>{n(capture.workload.perClass[c.id] ?? 0)}</td>
              <td>
                {c.notion === 'expressible' ? (
                  <span className="pill pill-ok">expressible</span>
                ) : c.notion === 'not expressible' ? (
                  <span className="pill pill-bad">not expressible</span>
                ) : (
                  <span className="pill">{c.notion}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

/* ------------------------------------------------------------ the arms */

/**
 * Correctness and cost, side by side, for every arm. The point of putting them
 * in one table is that the correctness column is flat and the cost column is
 * not — which is the finding.
 */
export function ArmTable() {
  return (
    <Wrap label="Correctness and cost by arm">
      <table>
        <thead>
          <tr>
            <th scope="col">Arm</th>
            <th scope="col" style={num}>Exact</th>
            <th scope="col" style={num}>F<sub>1</sub></th>
            <th scope="col" style={num}>Requests</th>
            <th scope="col" style={num}>Bytes in</th>
            <th scope="col" style={num}>Rows scanned client-side</th>
          </tr>
        </thead>
        <tbody>
          {arms.map((a) => {
            const g = capture.byArm[a.id]
            return (
              <tr key={a.id}>
                <th scope="row">
                  {a.label}
                  {a.emulated ? <span className="meta"> emulated</span> : null}
                </th>
                <td style={num}>{pct(g.exact, 1)}</td>
                <td style={num}>{g.f1.toFixed(3)}</td>
                <td style={num}>{n(g.roundTrips, 1)}</td>
                <td style={num}>{g.bytesIn ? bytes(g.bytesIn) : '—'}</td>
                <td style={num}>{n(g.rowsClientSide, 1)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Wrap>
  )
}

/* ---------------------------------------------------------- amplification */

/**
 * The headline table. One row per question class; the last column is how many
 * times more requests the substrate needs than the reimplementation needs
 * statements.
 */
export function AmplificationTable() {
  const ordered = [...classes].sort((a, b) => (amp(b.id)?.roundTrips ?? 0) - (amp(a.id)?.roundTrips ?? 0))
  return (
    <Wrap label="Request amplification by question class">
      <table>
        <caption className="meta">
          Requests are means over the instances of each class. The floor is what Notion&rsquo;s
          documented {limits.requestsPerSecond} requests per second implies for one token; it is a
          lower bound on wall-clock, not a measurement of it.
        </caption>
        <thead>
          <tr>
            <th scope="col">Class</th>
            <th scope="col" style={num}>Notion requests</th>
            <th scope="col" style={num}>SQL statements</th>
            <th scope="col" style={num}>Amplification</th>
            <th scope="col" style={num}>Rows in client</th>
            <th scope="col" style={num}>Rate-limit floor</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((c) => {
            const a = amp(c.id)
            if (!a) return null
            return (
              <tr key={c.id}>
                <th scope="row">{c.label}</th>
                <td style={num}>{n(a.notionRoundTrips, a.notionRoundTrips < 10 ? 2 : 0)}</td>
                <td style={num}>{n(a.sqlStatements)}</td>
                <td style={num}>{times(a.roundTrips)}</td>
                <td style={num}>{n(a.rowsClientSide, 0)}</td>
                <td style={num}>{duration(a.notionFloorSeconds)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Wrap>
  )
}

/* ------------------------------------------------------------ integrity */

export function InvariantTable() {
  return (
    <Wrap label="Invariants and what enforces them">
      <table>
        <thead>
          <tr>
            <th scope="col" style={{ width: '4rem' }}>ID</th>
            <th scope="col">Invariant</th>
            <th scope="col">Declarative form</th>
            <th scope="col">Enforced in the vault by</th>
            <th scope="col">Broken by</th>
          </tr>
        </thead>
        <tbody>
          {schema.invariants.map((i) => (
            <tr key={i.id}>
              <th scope="row" className="mono">{i.id}</th>
              <td>{i.statement}</td>
              <td className="mono" style={{ fontSize: '0.82em' }}>{i.declarative}</td>
              <td>
                {i.enforcedBy.startsWith('nothing') ? (
                  <span className="pill pill-bad">nothing</span>
                ) : (
                  <span style={{ color: 'var(--text-secondary)' }}>{i.enforcedBy}</span>
                )}
              </td>
              <td style={{ color: 'var(--text-secondary)' }}>{i.breaks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

export function NormalizationTable() {
  return (
    <Wrap label="Normalisation walk">
      <table>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">Violation</th>
            <th scope="col">Anomaly it permits</th>
            <th scope="col">Ships?</th>
          </tr>
        </thead>
        <tbody>
          {schema.normalization.filter((s) => s.violation).map((s, i) => (
            <tr key={`${s.form}-${i}`}>
              <th scope="row" className="mono">{s.form}</th>
              <td>{s.violation}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{s.anomaly}</td>
              <td><Flag on={!!s.survives} yes="ships" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

export function FdTable() {
  return (
    <Wrap label="Functional dependencies">
      <table>
        <thead>
          <tr>
            <th scope="col">Relation</th>
            <th scope="col">Dependency</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {schema.fds.map((f, i) => (
            <tr key={i}>
              <th scope="row" className="mono">{f.in}</th>
              <td className="mono" style={{ fontSize: '0.86em' }}>
                {f.lhs} <span style={{ color: 'var(--text-faint)' }}>&rarr;</span> {f.rhs}
              </td>
              <td>
                {f.violation ? <span className="pill pill-bad">{f.violation}</span> : <span className="pill pill-ok">holds</span>}
                {f.note ? <div className="meta" style={{ marginTop: '0.25rem' }}>{f.note}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

/* --------------------------------------------------------- the experiments */

export function ConcurrencyTable() {
  const c = exp.concurrency
  return (
    <Wrap label="Concurrent upsert on one topic key">
      <table>
        <caption className="meta">
          {n(c.writers)} writers, {n(c.rounds)} rounds, {n(c.writesAttempted)} attempted writes.
          The interleave is explicit rather than scheduler-dependent: every writer reads before any
          writer writes, which is the worst case the protocol admits and the one the API gives no
          way to exclude.
        </caption>
        <thead>
          <tr>
            <th scope="col">Protocol</th>
            <th scope="col" style={num}>Rows for one key</th>
            <th scope="col" style={num}>Duplicate rows</th>
            <th scope="col" style={num}>Lost updates</th>
            <th scope="col" style={num}>Loss rate</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Read-then-write, no conditional write</th>
            <td style={num}>{n(c.notion.rows)}</td>
            <td style={num}>{n(c.notion.duplicateRows)}</td>
            <td style={num}>{n(c.notion.lostUpdates)}</td>
            <td style={num}>{pct(c.notion.lostUpdateRate)}</td>
          </tr>
          <tr>
            <th scope="row"><span className="mono">INSERT … ON CONFLICT</span> on a unique index</th>
            <td style={num}>{n(c.sql.rows)}</td>
            <td style={num}>{n(c.sql.duplicateRows)}</td>
            <td style={num}>{n(c.sql.lostUpdates)}</td>
            <td style={num}>{pct(c.sql.lostUpdateRate)}</td>
          </tr>
        </tbody>
      </table>
    </Wrap>
  )
}

export function TemporalTable() {
  const t = exp.temporal
  return (
    <Wrap label="Temporal exclusion constraint">
      <table>
        <tbody>
          <tr>
            <th scope="row">Facts on a functional predicate</th>
            <td style={num}>{n(t.functionalFacts)}</td>
          </tr>
          <tr>
            <th scope="row">Subject-predicate pairs asserting two objects at once</th>
            <td style={num}>{n(t.trueConflictKeys)}</td>
          </tr>
          <tr>
            <th scope="row">Writes the vault refused</th>
            <td style={num}>{n(t.notion.rejectedWrites)}</td>
          </tr>
          <tr>
            <th scope="row">Writes PostgreSQL refused under the exclusion constraint</th>
            <td style={num}>{n(t.postgres.insertedUnderConstraint.rejected)}</td>
          </tr>
          <tr>
            <th scope="row">Rows held after those refusals</th>
            <td style={num}>{n(t.postgres.insertedUnderConstraint.rowsHeld)}</td>
          </tr>
          <tr>
            <th scope="row">Constraint added to the vault as written</th>
            <td>
              {t.postgres.addConstraintToExistingVault.created
                ? <span className="pill pill-ok">accepted</span>
                : <span className="pill pill-bad">refused</span>}
              {t.postgres.addConstraintToExistingVault.detail
                ? <div className="meta mono" style={{ marginTop: '0.3rem' }}>{t.postgres.addConstraintToExistingVault.detail}</div>
                : null}
            </td>
          </tr>
        </tbody>
      </table>
    </Wrap>
  )
}

export function ResolutionTable() {
  const r = exp.resolution
  const rows: [string, string][] = [
    ['Entity rows', n(r.entities)],
    ['Duplicate pairs', `${n(r.duplicatePairs)} (${pct(r.duplicateRate, 2)})`],
    ['Facts attached to the canonical row', n(r.factsOnCanonical)],
    ['Facts attached to the duplicate', n(r.factsOnDuplicate)],
    ['Subjects whose facts are split across both', n(r.splitSubjects)],
    ['Facts whose Subject title contradicts their SubjectEntity relation', `${n(r.staleSubjectStrings)} (${pct(r.staleSubjectRate, 1)})`],
    ['Aliases claimed by more than one entity', n(r.contestedAliases)],
    ['Page updates one merge has to issue, mean', n(r.merge.pageUpdatesPerMerge, 1)],
    ['Page updates the largest merge has to issue', n(r.merge.maxPageUpdates)],
    ['SQL statements the same merge takes', n(r.merge.sqlStatements)],
  ]
  return (
    <Wrap label="Entity resolution">
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td style={num}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

export function FullTextTable() {
  const f = exp.fulltext
  return (
    <Wrap label="Three indexes over the same text">
      <table>
        <caption className="meta">
          Rows are the number of memories each index returns for the same phrase. The literal
          substring column is the definition the oracle uses; the other three are what the engines
          think the question means.
        </caption>
        <thead>
          <tr>
            <th scope="col">Phrase</th>
            <th scope="col">PostgreSQL parses it as</th>
            <th scope="col" style={num}>Substring</th>
            <th scope="col" style={num}>FTS5</th>
            <th scope="col" style={num}>GIN</th>
            <th scope="col" style={num}>Notion search</th>
          </tr>
        </thead>
        <tbody>
          {f.terms.map((t) => {
            const diverges = t.ginVsFts5 < 1
            return (
              <tr key={t.term} style={diverges ? { background: 'var(--bad-quiet)' } : undefined}>
                <th scope="row" className="mono">{t.term}</th>
                <td className="mono" style={{ fontSize: '0.82em' }}>{t.lexemes}</td>
                <td style={num}>{n(t.substring)}</td>
                <td style={num}>{n(t.fts5)}</td>
                <td style={num}>{n(t.gin)}</td>
                <td style={num}>{n(t.notionTitleSearch)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Wrap>
  )
}

export function WakeupTable() {
  const w = exp.wakeup
  return (
    <Wrap label="Cost of the wake-up hook as the vault grows">
      <table>
        <caption className="meta">
          The payload is capped at {w.config.recentMemories} memories and {w.config.activeFacts} facts,
          so the tokens injected are nearly flat. The cost of assembling them is not.
        </caption>
        <thead>
          <tr>
            <th scope="col" style={num}>Memories</th>
            <th scope="col" style={num}>Facts</th>
            <th scope="col" style={num}>Requests</th>
            <th scope="col" style={num}>Bytes in</th>
            <th scope="col" style={num}>Floor</th>
            <th scope="col" style={num}>SQL statements</th>
            <th scope="col" style={num}>Tokens injected</th>
          </tr>
        </thead>
        <tbody>
          {w.points.map((p) => (
            <tr key={p.fraction}>
              <td style={num}>{n(p.memories)}</td>
              <td style={num}>{n(p.facts)}</td>
              <td style={num}>{n(p.notion.roundTrips)}</td>
              <td style={num}>{bytes(p.notion.bytesIn)}</td>
              <td style={num}>{duration(p.notion.rateLimitFloorMs / 1000)}</td>
              <td style={num}>{n(p.sqlite.statements)}</td>
              <td style={num}>{n(p.notion.injectedTokensApprox)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

export function CeilingTable() {
  const c = exp.ceiling
  const rows: [string, typeof c.now][] = [
    ['This vault', c.now],
    ['Ten times larger', c.x10],
    ['A hundred times larger', c.x100],
  ]
  return (
    <Wrap label="Cost of a complete body search">
      <table>
        <caption className="meta">
          The search endpoint matches titles, and property filters cannot see page blocks, so a
          complete search over what memories actually say is one list request per hundred rows plus
          one children request per row.
        </caption>
        <thead>
          <tr>
            <th scope="col">Vault</th>
            <th scope="col" style={num}>Memories</th>
            <th scope="col" style={num}>List requests</th>
            <th scope="col" style={num}>Body requests</th>
            <th scope="col" style={num}>Total</th>
            <th scope="col" style={num}>Floor at {limits.requestsPerSecond} req/s</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, p]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td style={num}>{n(p.rows)}</td>
              <td style={num}>{n(p.listRequests)}</td>
              <td style={num}>{n(p.bodyRequests)}</td>
              <td style={num}>{n(p.totalRequests)}</td>
              <td style={num}>{duration(p.floorSeconds)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">Either engine, one inverted index</th>
            <td style={num}>{n(c.now.rows)}</td>
            <td style={num}>—</td>
            <td style={num}>—</td>
            <td style={num}>{n(c.invertedIndex.requests)}</td>
            <td style={num}>—</td>
          </tr>
        </tbody>
      </table>
    </Wrap>
  )
}

export function AnomalyTable() {
  const a = exp.anomaly
  const rows: [string, string][] = [
    ['Facts whose validity interval has closed', n(a.closedFacts)],
    ['Memories still asserting the closed value', n(a.staleRestatements)],
    ['Mean stale restatements per closed fact', n(a.meanPerClosedFact, 2)],
    ['Median, where any exist', n(a.medianWhenPresent)],
    ['95th percentile, where any exist', n(a.p95WhenPresent)],
    ['Facts whose stale copies alone would fill a top-10 recall', n(a.factsWhoseStaleCopiesFillTopK)],
    ['Times a fact is restated across memories, mean', n(a.restatementMean, 2)],
    ['Times a fact is restated, maximum', n(a.restatementMax)],
  ]
  return (
    <Wrap label="Update anomaly from restatement">
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td style={num}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

export function AliasTable() {
  const a = exp.alias
  const rows: [string, string][] = [
    ['Distinct alias terms', n(a.terms)],
    ['Rows the substring filter returns', n(a.candidatesFetched)],
    ['Rows that are exact alias matches', n(a.exactMatches)],
    ['Rows fetched and discarded by the client', `${n(a.rowsFetchedAndDiscarded)} (${pct(a.wastedShare)})`],
    ['Aliases a prefix of another, by construction', n(a.collidingInjected)],
    ['Aliases claimed by more than one entity', n(a.contestedAliases)],
    ['Rows an indexed relation would return', n(a.sql.rowsFetched)],
  ]
  return (
    <Wrap label="Alias resolution through a joined cell">
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td style={num}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

export function BitemporalTable() {
  const b = exp.bitemporal
  return (
    <Wrap label="Where the two time axes disagree">
      <table>
        <caption className="meta">
          A row disagrees on day <em>D</em> when &ldquo;was this true on <em>D</em>&rdquo; and
          &ldquo;did the vault believe it on <em>D</em>&rdquo; give different answers. Choosing the
          wrong axis is a correctness error, not a formality.
        </caption>
        <thead>
          <tr>
            <th scope="col" style={num}>Probe day</th>
            <th scope="col" style={num}>Rows where the axes disagree</th>
            <th scope="col" style={num}>Share of all facts</th>
          </tr>
        </thead>
        <tbody>
          {b.disagreements.map((d) => (
            <tr key={d.day}>
              <td style={num}>{n(d.day)}</td>
              <td style={num}>{n(d.rowsWhereAxesDisagree)}</td>
              <td style={num}>{pct(d.share)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2}>Retraction lag behind reality, median / 95th percentile</th>
            <td style={num}>{n(b.lagDaysMedian)} / {n(b.lagDaysP95)} days</td>
          </tr>
        </tfoot>
      </table>
    </Wrap>
  )
}

export function DanglingTable() {
  const d = exp.dangling
  return (
    <Wrap label="Referential integrity under archiving">
      <table>
        <thead>
          <tr>
            <th scope="col">Store</th>
            <th scope="col" style={num}>Deletes attempted</th>
            <th scope="col" style={num}>Refused</th>
            <th scope="col" style={num}>Claims left without provenance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Relation property, no foreign key</th>
            <td style={num}>{n(d.archivedMemories)}</td>
            <td style={num}>{n(d.notion.refusedWrites)}</td>
            <td style={num}>{n(d.notion.danglingPointers)}</td>
          </tr>
          <tr>
            <th scope="row"><span className="mono">FOREIGN KEY … ON DELETE RESTRICT</span></th>
            <td style={num}>{n(d.archivedMemories)}</td>
            <td style={num}>{n(d.sql.refusedWrites)}</td>
            <td style={num}>{n(d.sql.danglingPointers)}</td>
          </tr>
        </tbody>
      </table>
    </Wrap>
  )
}

/* ------------------------------------------------------------ reproduction */

export function ToolchainTable() {
  const t = capture.toolchain
  const m = capture.machine
  const rows: [string, string][] = [
    ['Captured', new Date(capture.capturedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'],
    ['Duration', duration(capture.durationMs / 1000)],
    ['Repository commit', t.commit ?? 'working tree'],
    ['Node', t.node],
    ['SQLite', t.sqlite],
    ['PGlite', t.pglite ?? '—'],
    ['Machine', `${m.cpu}, ${m.cores} cores, ${m.memoryGb} GB, ${m.platform}/${m.arch}`],
    ['Timed runs per question', String(capture.runs)],
    ['Subject', `${capture.subject.repo} @ ${schema.source.commit} (${schema.source.version}, ${schema.source.license})`],
  ]
  return (
    <Wrap label="Toolchain and machine">
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td className="mono" style={{ fontSize: '0.86em' }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

/** Where each claim about Lore was read from. The paper's audit trail. */
export function SourceTable() {
  return (
    <Wrap label="Files read in the subject repository">
      <table>
        <caption className="meta">
          {schema.source.repo} at <span className="mono">{schema.source.commit}</span>,{' '}
          {schema.source.commitDate}.
        </caption>
        <thead>
          <tr>
            <th scope="col">File</th>
            <th scope="col">What it settled</th>
          </tr>
        </thead>
        <tbody>
          {schema.source.files.map((f) => (
            <tr key={f.path}>
              <th scope="row" className="mono" style={{ fontSize: '0.86em' }}>{f.path}</th>
              <td style={{ color: 'var(--text-secondary)' }}>{f.why}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

/** Per-class correctness for every arm, so the flat column is visible. */
export function CorrectnessMatrix() {
  return (
    <Wrap label="Exact-answer rate by arm and class">
      <table>
        <thead>
          <tr>
            <th scope="col">Class</th>
            {primaryArms.map((a) => (
              <th key={a.id} scope="col" style={num}>{a.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id}>
              <th scope="row">{c.label}</th>
              {primaryArms.map((a) => {
                const g = armClass(a.id, c.id)
                return <td key={a.id} style={num}>{g ? pct(g.exact, 0) : '—'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}
