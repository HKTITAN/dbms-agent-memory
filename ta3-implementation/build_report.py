"""Build the TA-3 group report.

Names and roll numbers come from members.json. The code figures and the
terminal figures are screenshots already stored under screenshots/. This
script runs the demo to confirm the checks, renders the Graphviz diagrams,
and prints the PDF. It does not redraw those screenshots.
"""

from __future__ import annotations

import base64
import html
import json
import platform
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
SHOTS = ROOT / "screenshots"
CAPTURES = ROOT / "captures"
DIAGRAMS = ROOT / "diagrams"
PDF_PATH = ROOT / "DBMS-TA3-Persistent-Memory.pdf"
LOGO_PATH = ROOT / "assets" / "sgt-logo.png"
# The google-chrome wrapper pins a shared profile and debugging port, and a
# second headless call then waits forever. The stable binary does not.
CHROME = "/usr/bin/google-chrome-stable"

SHOT_FILES = {
    "architecture": SHOTS / "architecture.png",
    "er": SHOTS / "er.png",
    "code_schema": SHOTS / "code-schema.png",
    "code_retrieve": SHOTS / "code-retrieve.png",
    "code_demo": SHOTS / "code-demo.png",
    "term_write": SHOTS / "term-write.png",
    "term_update": SHOTS / "term-update.png",
    "term_retrieve": SHOTS / "term-retrieve.png",
    "term_checks": SHOTS / "term-checks.png",
    "term_queries": SHOTS / "term-queries.png",
}


def load_members() -> dict:
    data = json.loads((ROOT / "members.json").read_text())
    if not data["members"]:
        raise SystemExit("members.json has no students")
    return data


def run(cmd: list[str], *, cwd: Path = ROOT, input_text: str | None = None) -> str:
    completed = subprocess.run(
        cmd,
        cwd=cwd,
        input=input_text,
        text=True,
        check=True,
        capture_output=True,
    )
    return completed.stdout


def command_text(cmd: list[str]) -> str:
    completed = subprocess.run(cmd, text=True, capture_output=True)
    text = (completed.stdout or "") + (completed.stderr or "")
    return text.strip()


def toolchain() -> dict[str, str]:
    os_release = {}
    release_path = Path("/etc/os-release")
    if release_path.exists():
        for line in release_path.read_text().splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            os_release[key] = value.strip().strip('"')
    chrome = command_text([CHROME, "--version"])
    code = command_text(["code", "--version"]).splitlines()
    dot = command_text(["dot", "-V"])
    terminal = command_text(["xfce4-terminal", "--version"]).splitlines()
    pretty = os_release.get("PRETTY_NAME", platform.platform())
    return {
        "python": platform.python_version(),
        "sqlite": sqlite3.sqlite_version,
        "os": pretty,
        "kernel": platform.release(),
        "chrome": chrome.removeprefix("Google Chrome ").strip(),
        "vscode": code[0].strip() if code else "VS Code",
        "graphviz": dot.removeprefix("dot - graphviz version ").strip(),
        "terminal": terminal[0].strip() if terminal else "xfce4-terminal",
        "machine": platform.machine(),
    }


def chrome(args: list[str], profile_name: str, timeout: int = 90) -> None:
    """Run Chrome with its own profile so it does not block on another instance."""
    profile = BUILD / profile_name
    if profile.exists():
        subprocess.run(["rm", "-rf", str(profile)], check=True)
    profile.mkdir(parents=True)
    subprocess.run(
        [
            CHROME,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-dev-shm-usage",
            f"--user-data-dir={profile}",
            *args,
        ],
        check=True,
        timeout=timeout,
        capture_output=True,
        text=True,
    )


def render_diagrams() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "dot",
            "-Tpng",
            "-Gdpi=180",
            str(DIAGRAMS / "architecture.dot"),
            "-o",
            str(SHOTS / "architecture.png"),
        ],
        check=True,
    )
    subprocess.run(
        [
            "dot",
            "-Tpng",
            "-Gdpi=120",
            str(DIAGRAMS / "er.dot"),
            "-o",
            str(SHOTS / "er.png"),
        ],
        check=True,
    )


def figure(number: int, path: Path, caption: str) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"""
<figure>
  <img src="data:image/png;base64,{encoded}" alt="Figure {number}">
  <figcaption><strong>Figure {number}.</strong> {caption}</figcaption>
</figure>
"""


def build_html(meta: dict, versions: dict[str, str]) -> str:
    members = meta["members"]
    by_lines = "\n".join(
        f"<p>{html.escape(m['name'])} ({html.escape(m['roll'])})</p>"
        for m in members
    )
    names = ", ".join(html.escape(m["name"]) for m in members)
    logo = base64.b64encode(LOGO_PATH.read_bytes()).decode("ascii")
    shots = SHOT_FILES
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DBMS TA-3 Persistent Memory Architecture</title>
<style>
  @page {{
    size: A4;
    margin: 14mm 13mm 16mm 13mm;
    @bottom-left {{
      content: "SGT University, DBMS TA-3";
      font-family: "Liberation Serif", "Times New Roman", Times, serif;
      font-size: 9pt;
      color: #444;
    }}
    @bottom-right {{
      content: counter(page);
      font-family: "Liberation Serif", "Times New Roman", Times, serif;
      font-size: 10pt;
      color: #222;
    }}
  }}
  @page :first {{
    margin: 12mm 16mm 11mm 16mm;
    @bottom-left {{ content: none; }}
    @bottom-right {{ content: none; }}
  }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; }}
  body {{
    font-family: "Liberation Serif", "Times New Roman", Times, serif;
    font-size: 11pt;
    line-height: 1.42;
    color: #1a1a1a;
  }}
  h2 {{
    font-size: 13.5pt;
    margin: 14px 0 6px;
    break-after: avoid;
    font-weight: 700;
  }}
  p {{ margin: 0 0 8px; }}
  .cover {{
    height: 268mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    text-align: center;
    break-after: page;
    page-break-after: always;
  }}
  .cover p {{ margin: 0; }}
  .cover-top p {{ font-size: 12pt; line-height: 1.35; }}
  .phase-label {{
    color: #14375E;
    font-weight: 700;
    font-size: 15pt;
    margin: 0 0 3px;
  }}
  .report-title {{
    color: #2E75B6;
    font-weight: 700;
    font-size: 12pt;
    margin: 0 0 2px;
  }}
  .report-sub {{
    font-style: italic;
    font-size: 11pt;
  }}
  .degree p {{ font-size: 11.5pt; line-height: 1.35; }}
  .logo {{ height: 32mm; width: auto; }}
  .who {{
    width: 100%;
    display: flex;
    justify-content: center;
    gap: 16mm;
    text-align: left;
    font-size: 11pt;
  }}
  .who p {{ margin: 0; line-height: 1.38; }}
  .url {{
    color: #6b6b6b;
    font-size: 9pt;
  }}
  .cover-foot p {{ font-size: 12pt; line-height: 1.35; }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0 10px;
    break-inside: avoid;
    font-size: 10.5pt;
  }}
  th, td {{
    border: 1px solid #222;
    padding: 4px 7px;
    text-align: left;
    vertical-align: top;
  }}
  th {{ font-weight: 700; }}
  figure {{ margin: 8px 0 10px; break-inside: avoid; }}
  figure img {{ width: 100%; height: auto; display: block; }}
  figcaption {{ font-size: 10pt; margin-top: 4px; line-height: 1.35; }}
  ol.refs {{ padding-left: 1.4em; margin: 0; }}
  ol.refs li {{ margin: 0 0 6px; padding-left: 0.2em; font-size: 10.5pt; }}
  code {{ font-family: "Liberation Mono", "Courier New", monospace; font-size: 0.9em; }}
</style>
</head>
<body>

<section class="cover">
  <div class="cover-top">
    <p>Teaching Assignment Report</p>
    <p>Phase 3</p>
  </div>
  <div>
    <p class="phase-label">TA REPORT PHASE 3</p>
    <p class="report-title">Persistent Memory Architecture in Agents Using DBMS</p>
    <p class="report-sub">Implementation (Python · SQLite · FTS5)</p>
  </div>
  <div>
    <p>Submitted in partial fulfilment of course requirements</p>
    <p>for Database Management Systems</p>
  </div>
  <div class="degree">
    <p><strong>Bachelor of Technology</strong></p>
    <p>Computer Science and Engineering</p>
    <p>School of Engineering and Technology</p>
  </div>
  <img class="logo" src="data:image/png;base64,{logo}" alt="SGT University">
  <div class="who">
    <div>
      <p><strong>Submitted to:</strong></p>
      <p>{html.escape(meta["faculty"])}</p>
      <p>Faculty, DBMS</p>
      <p>Department of CSE / SOET</p>
      <p>Date of submission: {html.escape(meta["date"])}</p>
    </div>
    <div>
      <p><strong>Submitted by:</strong></p>
      {by_lines}
      <p>B.Tech CSE (AI/ML), Section C · SGT University</p>
    </div>
  </div>
  <p class="url">https://github.com/HKTITAN/dbms-agent-memory</p>
  <div class="cover-foot">
    <p><strong>SGT University</strong></p>
    <p>School of Engineering and Technology</p>
  </div>
</section>

<p><strong>Declaration.</strong> We declare that this report and the program in
<code>ta3-implementation/</code> are our own work for DBMS TA-3. {names}.</p>

<h2>1. Introduction and objective</h2>
<p>
Phase 1 of this term paper reviewed persistent memory for AI agents. Phase 2
compared Notion's Lore with the same logical schema on SQLite and PostgreSQL,
and added Nemori, LightMem, and <em>Harness the Memory</em>. The recommendation
was a local relational store: episodic rows, semantic triples with a validity
interval, a normalised entity and alias table, provenance back to the episode
that supported a claim, and indexes for keyword and vector retrieval. Lore's
vault stays readable, but it cannot declare those constraints. This phase
implements that store.
</p>
<p>
The objective is a small program a reader can run. It has to support write,
retrieve (keyword and vector), consolidate, update, and forget, on a schema
with keys and checks, and print the result of one agent session.
</p>

<h2>2. Software and tools</h2>
<p>
The memory store imports only the Python standard library. The versions below
were read on the machine that produced the screenshots.
</p>
<table>
  <thead><tr><th>Software</th><th>Version</th><th>Role</th></tr></thead>
  <tbody>
    <tr><td>Python</td><td>{html.escape(versions["python"])}</td><td><code>sqlite3</code> is in the standard library, so <code>python3 demo.py</code> needs no extra packages.</td></tr>
    <tr><td>SQLite</td><td>{html.escape(versions["sqlite"])}</td><td>One file, with foreign keys, checks, a partial unique index, and FTS5. No server.</td></tr>
    <tr><td>sqlite3 CLI</td><td>{html.escape(versions["sqlite"])}</td><td>Runs <code>queries.sql</code> at the end of the demo.</td></tr>
    <tr><td>VS Code</td><td>{html.escape(versions["vscode"])}</td><td>Editor used for the code screenshots.</td></tr>
    <tr><td>xfce4-terminal</td><td>{html.escape(versions["terminal"])}</td><td>Terminal used to run <code>python3 demo.py</code>.</td></tr>
    <tr><td>Graphviz</td><td>{html.escape(versions["graphviz"])}</td><td><code>dot</code> drew the architecture and ER figures, default style.</td></tr>
    <tr><td>Google Chrome</td><td>{html.escape(versions["chrome"])}</td><td>Prints this PDF. Not used by the demo.</td></tr>
    <tr><td>Linux</td><td>{html.escape(versions["os"])}; kernel {html.escape(versions["kernel"])}</td><td>The machine the demo was run on ({html.escape(versions["machine"])}).</td></tr>
  </tbody>
</table>
<p>
PostgreSQL would add a temporal exclusion constraint, which SQLite cannot
express. That is noted under future work. SQLite is enough to show primary
keys, foreign keys, checks, and a partial unique index, and the program runs
from a clone with no extra install.
</p>

<h2>3. System architecture</h2>
<p>
An agent session does not talk to SQL itself. <code>demo.py</code> calls
<code>MemoryStore</code>. The class opens one SQLite connection, turns foreign
keys on (SQLite leaves them off unless asked), and applies <code>schema.sql</code>.
Each operation is a short transaction. Retrieval is three queries whose ranks
are fused in Python with reciprocal rank fusion, the same rule Phase 2 noted
in Lore, with the constant k = 60.
</p>
{figure(1, shots["architecture"], "How the pieces fit. <code>demo.py</code> calls <code>MemoryStore</code>, and that module is the only writer of <code>memory.db</code>.")}
<p>
The six memory operations from the Phase 2 survey map onto the schema as follows.
Write inserts an episode and indexes it. Assert inserts a semantic fact.
Supersede is the update: the old row's interval is closed and a new row is
inserted. Forget changes a status flag and keeps the row, so provenance still
joins. Retrieve reads. Consolidate inserts a summary row. That summary is the
active facts from the session, not a second copy of the episodes.
</p>

<h2>4. Database schema</h2>
<p>
Figure 2 is the entity-relationship diagram. <code>ENTITY_ALIAS.alias_key</code>
is the primary key, so an alias belongs to one entity. That replaces a
comma-joined alias cell and puts the table in first normal form.
<code>KEYWORD</code> and <code>EMBEDDING</code> each have a check that exactly
one parent foreign key is set, so a keyword or a vector belongs to one episode
or one fact.
</p>
{figure(2, shots["er"], "The tables and the main relationships. Edges are marked 1:N. Drawn with Graphviz, default boxes.")}
<p>
<code>FACT</code> is the semantic memory. <code>valid_from</code> and
<code>valid_until</code> are valid time. A check requires an active fact to
have an open interval, and a superseded or forgotten fact to have a closed one.
The partial unique index <code>ux_one_active_functional_fact</code> allows many
historical owners and at most one active <code>owned_by</code>, <code>is_a</code>,
or <code>created_by</code> per subject. <code>uses</code> is not in that index:
an application may use more than one system, and a wrong guess is forgotten
rather than blocked. Views <code>belief_history</code> and <code>current_belief</code>
are what the as-of query and the current-owner query read.
</p>
{figure(3, shots["code_schema"], "The fact table and the partial unique index in <code>schema.sql</code>, open in VS Code. An active fact must have an open interval. The index allows many past owners and only one current <code>owned_by</code>, <code>is_a</code>, or <code>created_by</code>.")}

<h2>5. Implementation</h2>
<p>
<code>memory_store.py</code> is the only module. Tokens are lower-cased, stopwords
are dropped, and a short suffix stem (owns and owned both become own) makes the
keyword table agree with the FTS5 porter tokenizer. Embeddings are a signed
feature hash into 512 buckets, using SHA-256 so the vector does not change
between processes. Cosine similarity is the dot product of two unit vectors.
There is no neural model and no network call. The <code>embedding</code> table
stores a JSON array of floats, which <code>sqlite3</code> can print.
</p>
<p>
<code>assert_fact</code> resolves names through <code>entity_alias</code>, so
the session can say "the app" and hit Campus Navigator. If a functional
predicate already has a different active object, the method raises
<code>FactConflict</code> and does not insert. <code>supersede_fact</code>
then closes the old interval and inserts the replacement in one transaction:
it marks the old row superseded, inserts the new row, and sets
<code>superseded_by</code>. The unique index is never asked to hold two active
owners. Figure 8 shows what a raw second insert does.
</p>
{figure(4, shots["code_retrieve"], "<code>retrieve</code> in <code>memory_store.py</code>. Three ranked lists are fused with reciprocal rank fusion, k = 60. The <code>lanes</code> field is what the transcript prints.")}
<p>
<code>forget_fact</code> sets <code>status</code> to <code>forgotten</code> and
writes <code>valid_until</code>. <code>forget_episode</code> sets
<code>forgotten</code> and deletes that episode's keyword rows. The episode
row stays, because a fact may still cite it. Deleting the episode outright is
refused by the foreign key, which the demo provokes and then rolls back.
<code>consolidate</code> inserts one <code>summary</code> row whose text is the
active facts sourced from the session, with their confidences. That is a stored
row, not a language-model summary.
</p>
<p>
<code>demo.py</code> is the session. The clock is a list of fixed timestamps,
so a second run prints the same transcript. Figure 5 is the part that registers
entities and the six turns.
</p>
{figure(5, shots["code_demo"], "The scripted session in <code>demo.py</code>. Aliases are registered with the entity, and each turn is one episode.")}

<h2>6. Output and results</h2>
<p>
<code>python3 demo.py</code> deletes any existing <code>memory.db</code>, applies
the schema, and runs the session. The figures in this section are screenshots
of that run in xfce4-terminal. The same transcript is saved in
<code>captures/demo-stdout.txt</code> when this PDF is rebuilt.
</p>
{figure(6, shots["term_write"], "The start of <code>python3 demo.py</code>. The partial unique index is printed from <code>sqlite_master</code>, then the six episodes. The alias <code>the app</code> resolves to entity 1, Campus Navigator. The <code>*_fts_*</code> names are FTS5's own tables.")}
{figure(7, shots["term_update"], "Facts, then the update. The API refuses a second active owner. Supersede closes fact 1 at 09:40 and inserts fact 5. Fact 4 and episode 5 (the MongoDB guess) are forgotten. The history shows fact 1 superseded and fact 5 active.")}
{figure(8, shots["term_retrieve"], "A raw INSERT of another active <code>owned_by</code> fails with <code>UNIQUE constraint failed</code>. The predicate query returns AI Lab, fact 5. Lexical fusion ranks the old ownership episode first and the current fact third. After the MongoDB rows are forgotten, the query <code>MongoDB</code> returns no hit.")}
{figure(9, shots["term_checks"], "Consolidation, the foreign-key refusal, and the nine checks. The summary names SQLite, Harshit Khemani, and AI Lab, and does not name MongoDB. Deleting episode 3, which fact 2 cites, is refused.")}
{figure(10, shots["term_queries"], "The sqlite3 section of the same run. Three facts are current. At 09:30 the owner was the DBMS project team. Aliases are one row each.")}

<h2>7. Testing and observations</h2>
<p>
The demo ends in nine checks, all passed on the run in the figures:
alias resolution, a single active owner, the 09:30 as-of result, the forgotten
MongoDB fact absent from <code>current_belief</code>, a SQLite hit for
"full-text search sqlite", an empty result for "MongoDB", a new fact id from
supersede, the summary naming AI Lab, and <code>PRAGMA integrity_check</code>.
The process exits 0 only if every check passes. Two consecutive runs printed
the same transcript.
</p>
<p>
Two results are easy to mix up. First, lexical retrieval of "who owns Campus
Navigator" ranks episode 2 (the DBMS project team) above fact 5 (AI Lab). The
old sentence is still in the episode table, and it shares the query's words.
The question "who owns it now" is the predicate query on
<code>current_belief</code>, which returns AI Lab only. The as-of query is
what returns the earlier owner. Keyword search and the validity interval answer
different questions, and the transcript shows both. Second, forgetting removes
the MongoDB rows from retrieval without deleting the entity. The entity and its
alias remain, which is what a registry is for.
</p>
<p>
The foreign-key refusal in Figure 9 happens on the Python connection, which
has executed <code>PRAGMA foreign_keys = ON</code>. A bare <code>sqlite3</code>
shell does not turn that pragma on by itself. The keys are declared either way.
Enforcement is per connection. <code>queries.sql</code> still prints
<code>PRAGMA foreign_key_list(fact)</code>, and that listing has the four
foreign keys on <code>fact</code>.
</p>

<h2>8. Limitations and future work</h2>
<p>
The feature hash measures token overlap. It is not a semantic embedding, and
similarity is a scan of a few dozen vectors rather than an approximate index.
A model can replace <code>embed</code> without a schema change: the column is
already a vector of floats. Consolidation does not implement Nemori's
predict-calibrate loop or LightMem's sleep-time update. It stores the active
facts of one session. The partial unique index is weaker than the PostgreSQL
exclusion constraint in Phase 2: it limits active rows, and it does not reject
two closed intervals that overlap. The demo is a single writer, so it does not
reproduce a lost update. The unique index is what would make that race fail
instead of silently keeping both rows. There is no authentication.
</p>
<p>
<em>Harness the Memory</em> found that no one substrate wins every task. This
program already runs a predicate query beside the fused lexical lanes. A later
version can route a question to one or the other instead of always printing both.
Moving the same schema to PostgreSQL would be the place to add the range
exclusion constraint SQLite does not have.
</p>

<h2>9. Conclusion</h2>
<p>
TA-3 is a runnable SQLite memory for one agent. Episodes, entities, aliases,
facts, keywords, embeddings, and a session summary are ordinary tables with
keys and checks. The session writes six turns, refuses a second current owner
until the old interval is closed, forgets a speculative fact without losing the
audit trail, and answers "who owns Campus Navigator" both as a predicate query
(AI Lab, from 09:40) and as a fused retrieval over the text. Nine checks pass
from a clean database file.
</p>

<h2>References</h2>
<ol class="refs">
  <li>Notion (makenotion). <em>lore: persistent, shared AI memory backed by Notion</em>. GitHub, MIT licence, commit 95c3558. https://github.com/makenotion/lore</li>
  <li>W. Ma, J. Nan, W. Wu, and Y. Chen. <em>Nemori: Self-Organizing Agent Memory Inspired by Cognitive Science</em>. arXiv:2508.03341, 2025. Revised as <em>What Deserves Memory: Adaptive Memory Distillation for LLM Agents</em>.</li>
  <li>J. Fang, X. Deng, H. Chen, N. Zhang, et al. <em>LightMem: Lightweight and Efficient Memory-Augmented Generation</em>. ICLR 2026. arXiv:2510.18866.</li>
  <li>W.-C. Huang, W. Zhang, Y. Wu, Y. Chen, et al. <em>Harness the Memory: A Holistic Evaluation of Memory Substrates in Memory Agents</em>. arXiv:2608.15008, 2026.</li>
  <li>Y. Du, W. Huang, D. Zheng, Z. Wang, S. Montella, M. Lapata, K.-F. Wong, and J. Z. Pan. <em>Rethinking Memory in AI: Taxonomy, Operations, Topics, and Future Directions</em>. arXiv:2505.00675, 2025.</li>
  <li>C. Packer, V. Fang, S. G. Patil, K. Lin, S. Wooders, and J. E. Gonzalez. <em>MemGPT: Towards LLMs as Operating Systems</em>. arXiv:2310.08560, 2023.</li>
  <li>P. Chhikara, D. Khant, S. Aryan, T. Singh, and D. Yadav. <em>Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory</em>. arXiv:2504.19413, 2025.</li>
  <li>P. Rasmussen, P. Paliychuk, T. Beauvais, J. Ryan, and D. Chalef. <em>Zep: A Temporal Knowledge Graph Architecture for Agent Memory</em>. arXiv:2501.13956, 2025.</li>
  <li>G. V. Cormack, C. L. A. Clarke, and S. Buettcher. <em>Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods</em>. SIGIR 2009.</li>
  <li>E. F. Codd. <em>A Relational Model of Data for Large Shared Data Banks</em>. Communications of the ACM 13(6):377-387, 1970.</li>
  <li>P. P.-S. Chen. <em>The Entity-Relationship Model - Toward a Unified View of Data</em>. ACM Transactions on Database Systems 1(1):9-36, 1976.</li>
  <li>K. Kulkarni and J.-E. Michels. <em>Temporal Features in SQL:2011</em>. ACM SIGMOD Record 41(3):34-43, 2012.</li>
  <li>K. Weinberger, A. Dasgupta, J. Langford, A. Smola, and J. Attenberg. <em>Feature Hashing for Large Scale Multitask Learning</em>. ICML 2009.</li>
  <li>C. Sciavolino, Z. Zhong, J. Lee, and D. Chen. <em>Simple Entity-Centric Questions Challenge Dense Retrievers</em>. EMNLP 2021. arXiv:2109.08535.</li>
</ol>
</body>
</html>
"""


def main() -> int:
    meta = load_members()
    if not LOGO_PATH.exists():
        raise SystemExit(f"missing logo: {LOGO_PATH}")
    CAPTURES.mkdir(parents=True, exist_ok=True)
    SHOTS.mkdir(parents=True, exist_ok=True)
    versions = toolchain()
    (CAPTURES / "versions.txt").write_text(
        "\n".join(f"{key}={value}" for key, value in versions.items()) + "\n"
    )

    demo = run([sys.executable, str(ROOT / "demo.py")])
    if "all checks passed" not in demo:
        raise SystemExit("demo did not pass its checks")
    (CAPTURES / "demo-stdout.txt").write_text(demo)

    schema_fact = run(["sqlite3", str(ROOT / "memory.db"), ".schema fact"])
    (CAPTURES / "schema-fact.txt").write_text(schema_fact)

    render_diagrams()
    missing = [name for name, path in SHOT_FILES.items() if not path.exists()]
    if missing:
        raise SystemExit(f"missing screenshots: {missing}")

    BUILD.mkdir(parents=True, exist_ok=True)
    report = BUILD / "report.html"
    report.write_text(build_html(meta, versions))
    if PDF_PATH.exists():
        PDF_PATH.unlink()
    chrome(
        [
            "--no-pdf-header-footer",
            f"--print-to-pdf={PDF_PATH}",
            report.resolve().as_uri(),
        ],
        "chrome-pdf",
        timeout=90,
    )
    if not PDF_PATH.exists() or PDF_PATH.stat().st_size < 10_000:
        raise SystemExit("PDF was not written")
    print(f"wrote {PDF_PATH} ({PDF_PATH.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
