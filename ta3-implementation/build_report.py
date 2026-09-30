"""Build the TA-3 group report from a real demo run.

Names and roll numbers come from members.json. The cover, the declaration,
and the footer all read that list. Screenshots are rendered from the demo's
stdout and from the source files; they are not drawn by hand.
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

from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import PythonLexer, SqlLexer

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
SHOTS = ROOT / "screenshots"
CAPTURES = ROOT / "captures"
PDF_PATH = ROOT / "DBMS-TA3-Persistent-Memory.pdf"
# The google-chrome wrapper pins a shared profile and debugging port, and a
# second headless call then waits forever. The stable binary does not.
CHROME = "/usr/bin/google-chrome-stable"


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


def toolchain() -> dict[str, str]:
    os_release = {}
    release_path = Path("/etc/os-release")
    if release_path.exists():
        for line in release_path.read_text().splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            os_release[key] = value.strip().strip('"')
    chrome = run([CHROME, "--version"]).strip()
    import pygments

    pretty = os_release.get("PRETTY_NAME", platform.platform())
    return {
        "python": platform.python_version(),
        "sqlite": sqlite3.sqlite_version,
        "os": pretty,
        "kernel": platform.release(),
        "chrome": chrome.removeprefix("Google Chrome ").strip(),
        "pygments": pygments.__version__,
        "machine": platform.machine(),
    }


def chrome(args: list[str], profile_name: str, timeout: int = 60) -> None:
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


def chrome_png(html_path: Path, png_path: Path, width: int, height: int) -> None:
    png_path.parent.mkdir(parents=True, exist_ok=True)
    chrome(
        [
            "--hide-scrollbars",
            "--force-device-scale-factor=2",
            f"--window-size={width},{height}",
            f"--screenshot={png_path}",
            html_path.resolve().as_uri(),
        ],
        f"chrome-{png_path.stem}",
        timeout=45,
    )


def write_shot(name: str, body: str, width: int, height: int) -> Path:
    BUILD.mkdir(parents=True, exist_ok=True)
    html_path = BUILD / f"{name}.html"
    png_path = SHOTS / f"{name}.png"
    html_path.write_text(
        f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html, body {{ margin: 0; padding: 0; background: #fff; }}
  body {{ width: {width}px; height: {height}px; overflow: hidden; }}
</style></head><body>{body}</body></html>
"""
    )
    chrome_png(html_path, png_path, width, height)
    return png_path


def code_shot(name: str, source: str, lexer, start_line: int) -> Path:
    formatter = HtmlFormatter(
        style="friendly",
        linenos="inline",
        linenostart=start_line,
        noclasses=False,
    )
    highlighted = highlight(source, lexer, formatter)
    css = formatter.get_style_defs(".highlight")
    line_count = source.count("\n")
    if source.endswith("\n"):
        line_count = max(line_count, 1)
    else:
        line_count += 1
    width = 860
    line_box = 21
    height = 16 + line_count * line_box
    body = f"""
<style>
  {css}
  .highlight {{
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 14.5px;
    line-height: {line_box}px;
    background: #fbfaf6;
    margin: 0;
  }}
  .highlight pre {{ margin: 0; padding: 8px 12px 8px 8px; }}
</style>
<div class="highlight">{highlighted}</div>
"""
    return write_shot(name, body, width, height)


def terminal_shot(name: str, command: str, transcript: str) -> Path:
    safe = html.escape(transcript.rstrip("\n"))
    lines = transcript.rstrip("\n").splitlines()
    line_box = 20
    width = 900
    height = 36 + 14 + len(lines) * line_box + 12
    body = f"""
<style>
  .term {{
    font-family: "JetBrains Mono", ui-monospace, monospace;
    width: {width}px;
    background: #f7f4ee;
    color: #1c1917;
  }}
  .bar {{
    height: 36px;
    line-height: 36px;
    padding: 0 14px;
    background: #292524;
    color: #fafaf9;
    font-size: 14px;
  }}
  pre {{
    margin: 0;
    padding: 8px 14px 10px;
    font-size: 14px;
    line-height: {line_box}px;
    white-space: pre-wrap;
  }}
</style>
<div class="term">
  <div class="bar">{html.escape(command)}</div>
  <pre>{safe}</pre>
</div>
"""
    return write_shot(name, body, width, height)


def span(text: str, start: str, end: str) -> tuple[int, str]:
    lines = text.splitlines(keepends=True)
    start_at = next(i for i, line in enumerate(lines) if start in line)
    end_at = next(i for i, line in enumerate(lines) if end in line and i > start_at)
    return start_at + 1, "".join(lines[start_at:end_at])


def between_markers(text: str, start: str, end: str | None) -> str:
    start_at = text.index(start)
    if end is None:
        return text[start_at:]
    end_at = text.index(end, start_at + len(start))
    return text[start_at:end_at].rstrip() + "\n"


def architecture_svg() -> str:
    return """
<svg viewBox="0 0 760 250" xmlns="http://www.w3.org/2000/svg" role="img">
  <style>
    .b { fill: #f7f4ee; stroke: #1c1917; stroke-width: 1.4; }
    .t { font: 600 15px "Noto Serif", serif; fill: #1c1917; }
    .s { font: 13px "Noto Serif", serif; fill: #292524; }
    .a { stroke: #1c1917; stroke-width: 1.4; fill: none; }
  </style>
  <rect class="b" x="230" y="8" width="300" height="52" rx="2"/>
  <text class="t" x="380" y="30" text-anchor="middle">demo.py</text>
  <text class="s" x="380" y="48" text-anchor="middle">one scripted agent session</text>
  <line class="a" x1="380" y1="60" x2="380" y2="84"/>
  <polygon points="374,84 386,84 380,92" fill="#1c1917"/>
  <rect class="b" x="145" y="94" width="470" height="58" rx="2"/>
  <text class="t" x="380" y="116" text-anchor="middle">MemoryStore</text>
  <text class="s" x="380" y="136" text-anchor="middle">write · assert · supersede · forget · retrieve · consolidate</text>
  <line class="a" x1="380" y1="152" x2="380" y2="176"/>
  <polygon points="374,176 386,176 380,184" fill="#1c1917"/>
  <rect class="b" x="40" y="186" width="680" height="54" rx="2"/>
  <text class="t" x="380" y="208" text-anchor="middle">SQLite file, memory.db</text>
  <text class="s" x="380" y="226" text-anchor="middle">episodes, entities, aliases, facts, keywords, embeddings, summaries, FTS5</text>
</svg>
"""


def er_svg() -> str:
    boxes = [
        (16, 16, 168, 108, "AGENT", ["agent_id  PK", "name  UNIQUE"]),
        (214, 16, 176, 108, "SESSION", ["session_id  PK", "agent_id  FK"]),
        (420, 16, 200, 128, "EPISODE", ["episode_id  PK", "session_id  FK", "content, forgotten"]),
        (16, 176, 176, 128, "ENTITY", ["entity_id  PK", "name_key  UNIQUE", "kind"]),
        (214, 188, 176, 104, "ENTITY_ALIAS", ["alias_key  PK", "entity_id  FK"]),
        (420, 168, 320, 168, "FACT", [
            "fact_id  PK",
            "subject_entity_id  FK",
            "predicate, object",
            "valid_from, valid_until",
            "status, source_episode_id FK",
        ]),
        (16, 360, 250, 112, "KEYWORD", ["term", "episode_id or fact_id", "exactly one parent"]),
        (290, 360, 220, 112, "SUMMARY", ["summary_id  PK", "session_id  FK", "body"]),
        (534, 360, 206, 112, "EMBEDDING", ["vector  JSON", "one parent FK", "512-d feature hash"]),
    ]
    parts = [
        '<svg viewBox="0 0 760 490" xmlns="http://www.w3.org/2000/svg" role="img">',
        "<style>",
        '.b { fill:#f7f4ee; stroke:#1c1917; stroke-width:1.3; }',
        '.h { font: 600 13px "Noto Serif", serif; fill:#1c1917; }',
        '.a { font: 12px "JetBrains Mono", monospace; fill:#292524; }',
        '.e { stroke:#1c1917; stroke-width:1.2; fill:none; }',
        '.l { font: 12px "Noto Serif", serif; fill:#1c1917; }',
        "</style>",
    ]
    for x, y, w, h, title, attrs in boxes:
        parts.append(f'<rect class="b" x="{x}" y="{y}" width="{w}" height="{h}"/>')
        parts.append(f'<text class="h" x="{x + 10}" y="{y + 20}">{title}</text>')
        for i, attr in enumerate(attrs):
            parts.append(
                f'<text class="a" x="{x + 10}" y="{y + 42 + i * 16}">{html.escape(attr)}</text>'
            )
    edges = [
        (184, 60, 214, 60, "1", "N"),
        (390, 70, 420, 70, "1", "N"),
        (192, 230, 214, 230, "1", "N"),
        (390, 250, 420, 230, "1", "N"),
        (520, 144, 520, 168, "1", "N"),
        (300, 292, 300, 360, "1", "N"),
        (140, 304, 140, 360, "1", "N"),
    ]
    for x1, y1, x2, y2, left, right in edges:
        parts.append(f'<line class="e" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')
        parts.append(f'<text class="l" x="{x1 + 4}" y="{y1 - 4}">{left}</text>')
        parts.append(f'<text class="l" x="{x2 - 14}" y="{y2 - 4}">{right}</text>')
    parts.append("</svg>")
    return "\n".join(parts)


def figure(number: int, path: Path, caption: str) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"""
<figure>
  <img src="data:image/png;base64,{encoded}" alt="Figure {number}">
  <figcaption><strong>Figure {number}.</strong> {caption}</figcaption>
</figure>
"""


def build_html(meta: dict, versions: dict[str, str], shots: dict[str, Path]) -> str:
    members = meta["members"]
    rows = "\n".join(
        f"<tr><td>{i}</td><td>{html.escape(m['name'])}</td><td>{html.escape(m['roll'])}</td></tr>"
        for i, m in enumerate(members, start=1)
    )
    names = ", ".join(html.escape(m["name"]) for m in members)
    rolls = " · ".join(
        f"{html.escape(m['name'])} ({html.escape(m['roll'])})" for m in members
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DBMS TA-3 — Persistent Memory Architecture for AI Agents</title>
<style>
  @page {{
    size: A4;
    margin: 15mm 13mm 16mm 13mm;
    @bottom-left {{
      content: "DBMS TA-3  ·  {html.escape(meta['university'])}";
      font-family: "Noto Serif", serif;
      font-size: 9pt;
      color: #44403c;
    }}
    @bottom-right {{
      content: counter(page);
      font-family: "Noto Serif", serif;
      font-size: 10pt;
      color: #1c1917;
    }}
  }}
  @page :first {{
    margin: 14mm 14mm 14mm 14mm;
    @bottom-left {{ content: none; }}
    @bottom-right {{ content: none; }}
  }}
  * {{ box-sizing: border-box; }}
  html, body {{ margin: 0; padding: 0; }}
  body {{
    font-family: "Noto Serif", "Liberation Serif", serif;
    font-size: 11.2pt;
    line-height: 1.42;
    color: #1c1917;
  }}
  h1 {{ font-size: 18pt; line-height: 1.2; font-weight: 650; margin: 0 0 6px; }}
  h2 {{
    font-size: 13.5pt;
    margin: 11px 0 4px;
    break-after: avoid;
    font-weight: 650;
  }}
  h3 {{ font-size: 12pt; margin: 12px 0 4px; break-after: avoid; }}
  p {{ margin: 0 0 6px; }}
  .cover {{
    break-after: page;
    min-height: 262mm;
    border: 1.5px solid #1c1917;
    padding: 16mm 12mm 10mm;
  }}
  .uni {{ font-size: 12.5pt; letter-spacing: 0.08em; text-align: center; font-weight: 650; }}
  .uni-full, .dept, .meta {{ text-align: center; margin: 2px 0; }}
  .uni-full {{ font-size: 10.5pt; }}
  .rule {{ border: none; border-top: 1px solid #1c1917; margin: 10px 0; }}
  .kicker {{ text-align: center; letter-spacing: 0.12em; font-size: 11pt; margin: 8px 0 0; }}
  .subtitle {{ text-align: center; font-size: 11.5pt; margin: 4px 0 12px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 6px 0 10px; break-inside: avoid; }}
  th, td {{ border: 1px solid #1c1917; padding: 4px 8px; text-align: left; vertical-align: top; }}
  th {{ background: #f5f5f4; font-weight: 650; }}
  .members td:first-child, .members td:last-child {{ text-align: center; }}
  .declare {{ margin-top: 12px; font-size: 10.5pt; }}
  figure {{ margin: 6px 0 8px; break-inside: avoid; }}
  figure img {{ width: 100%; height: auto; display: block; }}
  figcaption {{ font-size: 10pt; margin-top: 4px; line-height: 1.35; }}
  .svgfig svg {{ width: 100%; height: auto; }}
  ol.refs {{ padding-left: 1.4em; margin: 0; }}
  ol.refs li {{ margin: 0 0 6px; padding-left: 0.3em; font-size: 10.4pt; }}
  code {{ font-family: "JetBrains Mono", monospace; font-size: 0.88em; }}
</style>
</head>
<body>

<section class="cover">
  <p class="uni">SGT UNIVERSITY, GURUGRAM</p>
  <p class="uni-full">{html.escape(meta["university_full"])}</p>
  <p class="dept">{html.escape(meta["department"])}</p>
  <p class="dept">{html.escape(meta["programme"])}</p>
  <hr class="rule">
  <p class="kicker">{html.escape(meta["subject"].upper())}</p>
  <p class="kicker">{html.escape(meta["assignment"])} &nbsp;·&nbsp; IMPLEMENTATION</p>
  <hr class="rule">
  <h1 style="text-align:center">{html.escape(meta["title"])}</h1>
  <p class="subtitle">{html.escape(meta["subtitle"])}</p>
  <p style="text-align:center; margin-bottom:4px"><strong>Submitted by</strong></p>
  <table class="members">
    <thead><tr><th>S. No.</th><th>Name</th><th>Roll number</th></tr></thead>
    <tbody>
      {rows}
    </tbody>
  </table>
  <p class="meta"><strong>Submitted to</strong> &nbsp; {html.escape(meta["faculty"])}</p>
  <p class="meta">{html.escape(meta["date"])}</p>
  <div class="declare">
    <p><strong>Declaration.</strong> We declare that this report and the program in
    <code>ta3-implementation/</code> are our own work for DBMS TA-3.</p>
    <p>{rolls}</p>
  </div>
</section>

<h2>1. Introduction and objective</h2>
<p>
Phase 1 of this term paper reviewed persistent memory for AI agents. Phase 2
compared Notion’s Lore with the same logical schema on SQLite and PostgreSQL,
and added Nemori, LightMem, and <em>Harness the Memory</em>. The recommendation
was a local relational store: episodic rows, semantic triples with a validity
interval, a normalised entity and alias table, provenance back to the episode
that supported a claim, and indexes for keyword and vector retrieval. Lore’s
vault stays legible, but it cannot declare those constraints. This phase
implements the store.
</p>
<p>
The objective is a small program a reader can run, not a second copy of the
measurement harness. It has to support write, retrieve (keyword and vector),
consolidate, update, and forget, on a schema with keys and checks, and print
the result of one agent session.
</p>

<h2>2. Software and tools</h2>
<p>
The memory store imports only the Python standard library. Pygments and Chrome
are used to render this report. They are not imported by <code>demo.py</code>.
Versions below were read on the machine that produced the transcript.
</p>
<table>
  <thead><tr><th>Software</th><th>Version</th><th>Role</th></tr></thead>
  <tbody>
    <tr><td>Python</td><td>{html.escape(versions["python"])}</td><td>The language. <code>sqlite3</code> is in the standard library, so <code>python3 demo.py</code> needs no extra packages.</td></tr>
    <tr><td>SQLite</td><td>{html.escape(versions["sqlite"])}</td><td>One file, with foreign keys, <code>CHECK</code>, partial unique indexes, and FTS5. No server. Phase 2 is why: a relational engine can declare the constraints Lore only scans for.</td></tr>
    <tr><td>sqlite3 CLI</td><td>{html.escape(versions["sqlite"])}</td><td>Runs <code>queries.sql</code>, so the query figure is shell output.</td></tr>
    <tr><td>Pygments</td><td>{html.escape(versions["pygments"])}</td><td>Syntax highlighting for the code figures. Not used by the demo.</td></tr>
    <tr><td>Google Chrome</td><td>{html.escape(versions["chrome"])}</td><td>Renders the figures and prints this PDF. Not used by the demo.</td></tr>
    <tr><td>Linux</td><td>{html.escape(versions["os"])}; kernel {html.escape(versions["kernel"])}</td><td>The machine the demo was run on.</td></tr>
    <tr><td>Cursor</td><td>editor</td><td>Where the code was written. The demo does not depend on it.</td></tr>
  </tbody>
</table>
<p>
PostgreSQL would add a temporal exclusion constraint, which SQLite cannot
express. That is recorded under future work. SQLite is enough to show primary
keys, foreign keys, checks, and a partial unique index, and it keeps the
submission runnable from a clone.
</p>

<h2>3. System architecture</h2>
<p>
An agent session does not talk to SQL itself. <code>demo.py</code> calls
<code>MemoryStore</code>. The class opens one SQLite connection, turns foreign
keys on (SQLite leaves them off unless asked), and applies <code>schema.sql</code>.
Each operation is a short transaction. Retrieval is three queries whose ranks
are fused in Python with reciprocal rank fusion, the same rule Phase 2 noted
in Lore, with the constant <em>k</em> = 60.
</p>
<figure class="svgfig">
  {architecture_svg()}
  <figcaption><strong>Figure 1.</strong> The session calls one module. The module is the only writer of <code>memory.db</code>.</figcaption>
</figure>
<p>
The six memory operations from the survey in Phase 2 map onto the schema as follows.
Write inserts an episode and indexes it. Assert inserts a semantic fact.
Supersede is the update: the old row’s interval is closed and a new row is
inserted. Forget changes a status flag and keeps the row, so provenance still
joins. Retrieve reads. Consolidate inserts a summary row, which is a stored
result of the active facts from that session rather than a second copy of the
episodes.
</p>

<h2>4. Database schema</h2>
<p>
Figure 2 is the entity-relationship diagram. <code>ENTITY_ALIAS.alias_key</code>
is the primary key, so an alias belongs to one entity. That is the first-normal-form
repair for a comma-joined alias cell. <code>KEYWORD</code> and <code>EMBEDDING</code>
each have a check that exactly one parent foreign key is set, so those
associations are real foreign keys rather than a type tag plus an integer.
</p>
<figure class="svgfig">
  {er_svg()}
  <figcaption><strong>Figure 2.</strong> Crow’s-foot sketch of the store. Keyword, summary, and embedding are dependent on the row they describe.</figcaption>
</figure>
<p>
<code>FACT</code> is the semantic memory. <code>valid_from</code> and
<code>valid_until</code> are valid time. A check requires an active fact to
have an open interval, and a superseded or forgotten fact to have a closed one.
The partial unique index <code>ux_one_active_functional_fact</code> allows many
historical owners and at most one active <code>owned_by</code>, <code>is_a</code>,
or <code>created_by</code> per subject. <code>uses</code> is not in that index:
an application may use more than one system, and a wrong guess is forgotten
rather than blocked. Views <code>belief_history</code> and <code>current_belief</code>
are what the as-of query and the “who owns this now” query read.
</p>
{figure(3, shots["schema_fact"], "The fact table and the partial unique index in <code>schema.sql</code>. An active fact must have an open interval. The index allows many past owners and only one current <code>owned_by</code>, <code>is_a</code>, or <code>created_by</code>.")}

<h2>5. Implementation</h2>
<p>
<code>memory_store.py</code> is the only module. Tokens are lower-cased, stopwords
are dropped, and a short suffix stem (<em>owns</em> and <em>owned</em> both become
<em>own</em>) makes the keyword table agree with the FTS5 porter tokenizer.
Embeddings are a signed feature hash into 512 buckets, using SHA-256 so the
vector does not change between processes. Cosine similarity is the dot product
of two unit vectors. There is no neural model and no network call. The
<code>embedding</code> table stores a JSON array of floats, which <code>sqlite3</code>
can print.
</p>
<p>
<code>assert_fact</code> resolves names through <code>entity_alias</code>, so
the session can say “the app” and hit Campus Navigator. If a functional
predicate already has a different active object, the method raises
<code>FactConflict</code> and does not insert. <code>supersede_fact</code>
then closes the old interval and inserts the replacement in one transaction:
it marks the old row superseded, inserts the new row, and sets
<code>superseded_by</code>. The unique index is never asked to hold two active
owners. Figure 7 is that refusal, from the run.
</p>
{figure(4, shots["code_retrieve"], "<code>retrieve</code> in <code>memory_store.py</code>. Three ranked lists are fused with reciprocal rank fusion, <em>k</em> = 60. The <code>lanes</code> field is what the transcript prints.")}
<p>
<code>forget_fact</code> sets <code>status</code> to <code>forgotten</code> and
writes <code>valid_until</code>. <code>forget_episode</code> sets
<code>forgotten</code> and deletes that episode’s keyword rows. The episode
row stays, because a fact may still cite it. Deleting the episode outright is
refused by the foreign key, which the demo provokes and then rolls back.
<code>consolidate</code> inserts one <code>summary</code> row whose text is the
active facts sourced from the session, with their confidences. That is
compression as a materialised row. It is not a language-model summary.
</p>
<p>
<code>demo.py</code> is the session. The clock is a list of fixed timestamps,
so a second run prints the same transcript. Figure 5 is the part that registers
entities and the six turns.
</p>
{figure(5, shots["code_demo"], "The scripted session in <code>demo.py</code>. Aliases are registered with the entity, and each turn becomes one episode.")}

<h2>6. Output and results</h2>
<p>
<code>python3 demo.py</code> deletes any existing <code>memory.db</code>, applies
the schema, and runs the session. The figures in this section are consecutive
pieces of that one transcript. Nothing in them was typed in by hand.
</p>
{figure(6, shots["term_write"], "Schema creation and the six episodes. The partial unique index is printed from <code>sqlite_master</code>. The alias <code>the app</code> resolves to entity 1, Campus Navigator. The <code>*_fts_*</code> names are FTS5’s own tables.")}
{figure(7, shots["term_update"], "Update and the index. The API refuses a second active owner. Supersede closes fact 1 at 09:40 and inserts fact 5. A raw <code>INSERT</code> of another active <code>owned_by</code> then fails with <code>UNIQUE constraint failed</code>.")}
{figure(8, shots["term_retrieve"], "Retrieval. The predicate query returns AI Lab, fact 5. Lexical fusion ranks the old ownership episode first and the current fact third. After the MongoDB rows are forgotten, the query <code>MongoDB</code> returns no hit.")}
{figure(9, shots["term_checks"], "Consolidation, the foreign-key refusal, and the nine checks. The summary names AI Lab and does not name MongoDB. Deleting episode 3, which fact 2 cites, is rolled back.")}
{figure(10, shots["term_queries"], "Shell queries from the same run. Three facts are current. At 09:30 the owner was the DBMS project team. Aliases are one row each. Each active fact joins to its source episode. <code>PRAGMA integrity_check</code> is <code>ok</code>.")}

<h2>7. Testing and observations</h2>
<p>
The demo ends in nine checks, all passed on the run that produced the figures:
alias resolution, a single active owner, the 09:30 as-of result, the forgotten
MongoDB fact absent from <code>current_belief</code>, a SQLite hit for
“full-text search sqlite”, an empty result for “MongoDB”, a new fact id from
supersede, the summary naming AI Lab, and <code>PRAGMA integrity_check</code>.
The process exits 0 only if every check passes. Two consecutive runs printed
the same transcript.
</p>
<p>
Two results are worth stating because they are easy to misread. First, lexical
retrieval of “who owns Campus Navigator” ranks episode 2 (the DBMS project team)
above fact 5 (AI Lab). The old sentence is still in the episode table, and it
shares the query’s words. The question “who owns it now” is the predicate query
on <code>current_belief</code>, which returns AI Lab only. The as-of query is
what returns the earlier owner. Keyword search and the validity interval answer
different questions, and the transcript shows both. Second, forgetting removes
the MongoDB rows from retrieval without deleting the entity. The entity and its
alias remain, which is what a registry is for.
</p>
<p>
The foreign-key refusal in Figure 9 happens on the Python connection, which
has executed <code>PRAGMA foreign_keys = ON</code>. A bare <code>sqlite3</code>
shell does not turn that pragma on by itself. The keys are declared either way;
enforcement is per connection. <code>PRAGMA foreign_key_list(fact)</code> in
Figure 10 lists the four foreign keys whether or not the shell is enforcing them.
</p>

<h2>8. Limitations and future work</h2>
<p>
The feature hash measures token overlap. It is not a semantic embedding, and
similarity is a scan of a few dozen vectors rather than an approximate index.
A model can replace <code>embed</code> without a schema change: the column is
already a vector of floats. Consolidation does not implement Nemori’s
predict-calibrate loop or LightMem’s sleep-time update. It stores the active
facts of one session. The partial unique index is weaker than the PostgreSQL
exclusion constraint in Phase 2: it limits active rows, and it does not reject
two closed intervals that overlap. The demo is a single writer, so it does not
reproduce the lost-update race; the unique index is what would make that race
fail instead of silently keeping both rows. There is no authentication.
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
audit trail, and answers “who owns Campus Navigator” both as a predicate query
(AI Lab, from 09:40) and as a fused retrieval over the text. Nine checks pass
from a clean database file.
</p>

<h2>References</h2>
<ol class="refs">
  <li>Notion (makenotion). <em>lore — persistent, shared AI memory backed by Notion</em>. GitHub, MIT licence, commit 95c3558. https://github.com/makenotion/lore</li>
  <li>W. Ma, J. Nan, W. Wu, and Y. Chen. <em>Nemori: Self-Organizing Agent Memory Inspired by Cognitive Science</em>. arXiv:2508.03341, 2025. Revised as <em>What Deserves Memory: Adaptive Memory Distillation for LLM Agents</em>.</li>
  <li>J. Fang, X. Deng, H. Chen, N. Zhang, et al. <em>LightMem: Lightweight and Efficient Memory-Augmented Generation</em>. ICLR 2026. arXiv:2510.18866.</li>
  <li>W.-C. Huang, W. Zhang, Y. Wu, Y. Chen, et al. <em>Harness the Memory: A Holistic Evaluation of Memory Substrates in Memory Agents</em>. arXiv:2608.15008, 2026.</li>
  <li>Y. Du, W. Huang, D. Zheng, Z. Wang, S. Montella, M. Lapata, K.-F. Wong, and J. Z. Pan. <em>Rethinking Memory in AI: Taxonomy, Operations, Topics, and Future Directions</em>. arXiv:2505.00675, 2025.</li>
  <li>C. Packer, V. Fang, S. G. Patil, K. Lin, S. Wooders, and J. E. Gonzalez. <em>MemGPT: Towards LLMs as Operating Systems</em>. arXiv:2310.08560, 2023.</li>
  <li>P. Chhikara, D. Khant, S. Aryan, T. Singh, and D. Yadav. <em>Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory</em>. arXiv:2504.19413, 2025.</li>
  <li>P. Rasmussen, P. Paliychuk, T. Beauvais, J. Ryan, and D. Chalef. <em>Zep: A Temporal Knowledge Graph Architecture for Agent Memory</em>. arXiv:2501.13956, 2025.</li>
  <li>G. V. Cormack, C. L. A. Clarke, and S. Büttcher. <em>Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods</em>. SIGIR 2009.</li>
  <li>E. F. Codd. <em>A Relational Model of Data for Large Shared Data Banks</em>. Communications of the ACM 13(6):377–387, 1970.</li>
  <li>P. P.-S. Chen. <em>The Entity-Relationship Model — Toward a Unified View of Data</em>. ACM Transactions on Database Systems 1(1):9–36, 1976.</li>
  <li>K. Kulkarni and J.-E. Michels. <em>Temporal Features in SQL:2011</em>. ACM SIGMOD Record 41(3):34–43, 2012.</li>
  <li>K. Weinberger, A. Dasgupta, J. Langford, A. Smola, and J. Attenberg. <em>Feature Hashing for Large Scale Multitask Learning</em>. ICML 2009.</li>
  <li>C. Sciavolino, Z. Zhong, J. Lee, and D. Chen. <em>Simple Entity-Centric Questions Challenge Dense Retrievers</em>. EMNLP 2021. arXiv:2109.08535.</li>
</ol>
<p style="margin-top:10px;font-size:10pt">{names}. Submitted to {html.escape(meta["faculty"])}, {html.escape(meta["date"])}.</p>
</body>
</html>
"""


def main() -> int:
    meta = load_members()
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

    schema = (ROOT / "schema.sql").read_text()
    store = (ROOT / "memory_store.py").read_text()
    demo_src = (ROOT / "demo.py").read_text()

    start, fact_src = span(schema, "-- Semantic memory", "-- Keywords are atomic")
    code_shot("schema-fact", fact_src, SqlLexer(), start)
    start, retrieve_src = span(store, "def retrieve", "def current_beliefs")
    code_shot("code-retrieve", retrieve_src, PythonLexer(), start)
    start, demo_block = span(demo_src, "store.ensure_entity(", "episode_ids: list[int]")
    code_shot("code-demo", demo_block, PythonLexer(), start)

    terminal_shot(
        "term-write",
        "python3 demo.py",
        between_markers(demo, "1. Schema", "4. Update and forget"),
    )
    terminal_shot(
        "term-update",
        "python3 demo.py",
        between_markers(demo, "4. Update and forget", "6. Retrieve"),
    )
    terminal_shot(
        "term-retrieve",
        "python3 demo.py",
        between_markers(demo, "6. Retrieve", "7. Consolidate"),
    )
    terminal_shot(
        "term-checks",
        "python3 demo.py",
        between_markers(demo, "7. Consolidate", "10. sqlite3 queries"),
    )
    terminal_shot(
        "term-queries",
        "sqlite3 -header memory.db < queries.sql",
        between_markers(demo, "== current beliefs ==", "all checks passed"),
    )

    shots = {
        "schema_fact": SHOTS / "schema-fact.png",
        "code_retrieve": SHOTS / "code-retrieve.png",
        "code_demo": SHOTS / "code-demo.png",
        "term_write": SHOTS / "term-write.png",
        "term_update": SHOTS / "term-update.png",
        "term_retrieve": SHOTS / "term-retrieve.png",
        "term_checks": SHOTS / "term-checks.png",
        "term_queries": SHOTS / "term-queries.png",
    }
    missing = [name for name, path in shots.items() if not path.exists()]
    if missing:
        raise SystemExit(f"missing screenshots: {missing}")

    BUILD.mkdir(parents=True, exist_ok=True)
    report = BUILD / "report.html"
    report.write_text(build_html(meta, versions, shots))
    if PDF_PATH.exists():
        PDF_PATH.unlink()
    chrome(
        [
            "--no-pdf-header-footer",
            f"--print-to-pdf={PDF_PATH}",
            report.resolve().as_uri(),
        ],
        "chrome-pdf",
        timeout=60,
    )
    if not PDF_PATH.exists() or PDF_PATH.stat().st_size < 10_000:
        raise SystemExit("PDF was not written")
    print(f"wrote {PDF_PATH} ({PDF_PATH.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
