"""Build the TA-3 group report in the Phase 2 ReportLab style.

Names and roll numbers come from members.json. Code and terminal figures are
screenshots already stored under screenshots/. This script runs the demo,
renders the diagrams, and writes the PDF. It does not redraw the screenshots.
"""

from __future__ import annotations

import io
import json
import platform
import sqlite3
import subprocess
import sys
from pathlib import Path

import reportlab
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
SHOTS = ROOT / "screenshots"
CAPTURES = ROOT / "captures"
DIAGRAMS = ROOT / "diagrams"
PDF_PATH = ROOT / "DBMS-TA3-Persistent-Memory.pdf"
LOGO_PATH = ROOT / "assets" / "sgt-logo.png"

REPO = "https://github.com/HKTITAN/dbms-agent-memory"
FOOTER = "DBMS TA Phase 3 · Persistent Memory Architecture · SGT University"

NAVY = colors.HexColor("#14375E")
ACCENT = colors.HexColor("#2E75B6")
LIGHT = colors.HexColor("#EAF1F8")
GREY = colors.HexColor("#5A6672")
RULE = colors.HexColor("#C6D3E2")

PAGE_W, PAGE_H = A4
MARGIN = 2 * cm
CONTENT_W = PAGE_W - 2 * MARGIN
COVER_TOP = 1.35 * cm
COVER_BOTTOM = 1.25 * cm
COVER_H = PAGE_H - COVER_TOP - COVER_BOTTOM

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

_base = getSampleStyleSheet()
S = {
    "body": ParagraphStyle(
        "body",
        parent=_base["Normal"],
        fontName="Times-Roman",
        fontSize=11,
        leading=15.2,
        alignment=TA_JUSTIFY,
        spaceAfter=7,
    ),
    "h1": ParagraphStyle(
        "h1",
        parent=_base["Heading1"],
        fontName="Times-Bold",
        fontSize=14,
        leading=18,
        textColor=NAVY,
        spaceBefore=4,
        spaceAfter=8,
    ),
    "center": ParagraphStyle(
        "center",
        parent=_base["Normal"],
        alignment=TA_CENTER,
        fontName="Times-Roman",
        fontSize=11,
        leading=15,
    ),
    "caption": ParagraphStyle(
        "caption",
        parent=_base["Normal"],
        fontName="Times-Italic",
        fontSize=9,
        leading=11.5,
        alignment=TA_CENTER,
        textColor=GREY,
        spaceBefore=2,
        spaceAfter=8,
    ),
    "ref": ParagraphStyle(
        "ref",
        parent=_base["Normal"],
        fontName="Times-Roman",
        fontSize=9.5,
        leading=13,
        alignment=TA_LEFT,
        leftIndent=1.05 * cm,
        firstLineIndent=-1.05 * cm,
        spaceAfter=5,
    ),
    "cell": ParagraphStyle(
        "cell",
        parent=_base["Normal"],
        fontName="Times-Roman",
        fontSize=8.5,
        leading=11,
    ),
    "cellb": ParagraphStyle(
        "cellb",
        parent=_base["Normal"],
        fontName="Times-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.white,
    ),
}


class Report(BaseDocTemplate):
    def __init__(self, buffer: io.BytesIO):
        super().__init__(
            buffer,
            pagesize=A4,
            leftMargin=MARGIN,
            rightMargin=MARGIN,
            topMargin=MARGIN,
            bottomMargin=MARGIN + 0.4 * cm,
            title="TA Report Phase 3: Persistent Memory Architecture in Agents Using DBMS",
            author="Harshit Khemani et al.",
        )
        body = Frame(
            MARGIN,
            MARGIN + 0.4 * cm,
            CONTENT_W,
            PAGE_H - 2 * MARGIN - 0.4 * cm,
            id="main",
        )
        cover = Frame(MARGIN, COVER_BOTTOM, CONTENT_W, COVER_H, id="cover", showBoundary=0)
        self.addPageTemplates(
            [
                PageTemplate(id="cover", frames=[cover]),
                PageTemplate(id="content", frames=[body], onPage=self._footer),
            ]
        )

    def _footer(self, canv, doc):
        canv.saveState()
        canv.setStrokeColor(RULE)
        canv.line(MARGIN, MARGIN + 0.15 * cm, PAGE_W - MARGIN, MARGIN + 0.15 * cm)
        canv.setFont("Times-Roman", 8)
        canv.setFillColor(GREY)
        canv.drawString(MARGIN, MARGIN - 0.15 * cm, FOOTER)
        canv.drawRightString(PAGE_W - MARGIN, MARGIN - 0.15 * cm, str(canv.getPageNumber()))
        canv.restoreState()


def load_members() -> dict:
    data = json.loads((ROOT / "members.json").read_text())
    if not data["members"]:
        raise SystemExit("members.json has no students")
    return data


def run(cmd: list[str], *, cwd: Path = ROOT) -> str:
    completed = subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        check=True,
        capture_output=True,
    )
    return completed.stdout


def command_text(cmd: list[str]) -> str:
    completed = subprocess.run(cmd, text=True, capture_output=True)
    return ((completed.stdout or "") + (completed.stderr or "")).strip()


def toolchain() -> dict[str, str]:
    os_release = {}
    release_path = Path("/etc/os-release")
    if release_path.exists():
        for line in release_path.read_text().splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            os_release[key] = value.strip().strip('"')
    code = command_text(["code", "--version"]).splitlines()
    dot = command_text(["dot", "-V"])
    terminal = command_text(["xfce4-terminal", "--version"]).splitlines()
    return {
        "python": platform.python_version(),
        "sqlite": sqlite3.sqlite_version,
        "os": os_release.get("PRETTY_NAME", platform.platform()),
        "kernel": platform.release(),
        "reportlab": reportlab.Version,
        "vscode": code[0].strip() if code else "VS Code",
        "graphviz": dot.removeprefix("dot - graphviz version ").strip(),
        "terminal": terminal[0].strip() if terminal else "xfce4-terminal",
        "machine": platform.machine(),
    }


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
            "neato",
            "-n",
            "-Tpng",
            "-Gdpi=220",
            str(DIAGRAMS / "er.dot"),
            "-o",
            str(SHOTS / "er.png"),
        ],
        check=True,
    )


def P(text: str, style: str = "body") -> Paragraph:
    paragraph = Paragraph(text, S[style])
    paragraph.allowWidows = 0
    paragraph.allowOrphans = 0
    return paragraph


def code(text: str) -> str:
    return f'<font face="Courier">{text}</font>'


def navy_table(rows: list[list[str]], col_widths) -> Table:
    data = []
    for r, row in enumerate(rows):
        style = S["cellb"] if r == 0 else S["cell"]
        data.append([Paragraph(str(cell), style) for cell in row])
    table = Table(data, colWidths=col_widths, hAlign="CENTER", repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
                ("LINEBELOW", (0, -1), (-1, -1), 0.8, NAVY),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ]
        )
    )
    return table


def section_rule() -> HRFlowable:
    return HRFlowable(width="100%", thickness=0.8, color=NAVY, spaceBefore=2, spaceAfter=8)


def heading(text: str):
    block = KeepTogether([Paragraph(text, S["h1"]), section_rule()])
    block.keepWithNext = True
    return block


def figure(number: int, path: Path, caption: str):
    img = Image(str(path))
    max_h = (PAGE_H - 2 * MARGIN - 0.4 * cm) - 46
    scale = min(CONTENT_W / float(img.imageWidth), max_h / float(img.imageHeight))
    img.drawWidth = img.imageWidth * scale
    img.drawHeight = img.imageHeight * scale
    img.hAlign = "CENTER"
    return KeepTogether(
        [
            Spacer(1, 3),
            img,
            Paragraph(f"Figure {number}: {caption}", S["caption"]),
        ]
    )


def _height(flowables: list, width: float) -> float:
    total = 0.0
    for item in flowables:
        _, height = item.wrap(width, COVER_H)
        total += height
    return total


def cover(meta: dict) -> list:
    title = [
        Paragraph("Thematic Assessment Report", S["center"]),
        Paragraph("Phase 3", S["center"]),
    ]
    names = [
        Paragraph(
            '<font size="15" color="#14375E"><b>TA REPORT PHASE 3</b></font>',
            S["center"],
        ),
        Spacer(1, 0.18 * cm),
        Paragraph(
            '<font size="12" color="#2E75B6"><b>Persistent Memory Architecture in Agents Using DBMS</b></font>',
            S["center"],
        ),
        Spacer(1, 0.12 * cm),
        Paragraph("<i>Implementation (Python · SQLite · FTS5)</i>", S["center"]),
    ]
    submitted_for = [
        Paragraph(
            "Submitted in partial fulfilment of course requirements<br/>for Database Management Systems",
            S["center"],
        )
    ]
    degree = [
        Paragraph("<b>Bachelor of Technology</b>", S["center"]),
        Paragraph("Computer Science and Engineering", S["center"]),
        Paragraph("School of Engineering and Technology", S["center"]),
    ]
    logo_h = 5.0 * cm
    logo_w = logo_h * (595 / 700)
    logo = Image(str(LOGO_PATH), width=logo_w, height=logo_h)
    logo.hAlign = "CENTER"
    logo_block = [logo]

    left = [
        Paragraph("<b>Submitted to:</b>", S["cell"]),
        Paragraph(meta["faculty"], S["cell"]),
        Paragraph("Faculty, DBMS", S["cell"]),
        Paragraph("Department of CSE / SOET", S["cell"]),
        Paragraph(f"Date of submission: {meta['date']}", S["cell"]),
    ]
    right = [Paragraph("<b>Submitted by:</b>", S["cell"])]
    for member in meta["members"]:
        right.append(Paragraph(f"{member['name']} ({member['roll']})", S["cell"]))
    right.append(Paragraph("B.Tech CSE (AI/ML), Section C", S["cell"]))
    submitted = Table(
        [[left, right]],
        colWidths=[CONTENT_W * 0.48, CONTENT_W * 0.52],
        hAlign="LEFT",
    )
    submitted.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    url = [Paragraph(f'<font size="9" color="#5A6672">{REPO}</font>', S["center"])]
    foot = [
        Paragraph("<b>SGT University</b>", S["center"]),
        Paragraph("School of Engineering and Technology", S["center"]),
    ]
    blocks = [title, names, submitted_for, degree, logo_block, [submitted], url, foot]
    used = sum(_height(block, CONTENT_W) for block in blocks)
    # Leave a few points of slack. wrap() underestimates the last line.
    gap = (COVER_H - used - 18) / (len(blocks) - 1)
    if gap < 6:
        raise SystemExit(f"cover does not fit on one page (gap {gap:.1f})")
    story: list = []
    for index, block in enumerate(blocks):
        if index:
            story.append(Spacer(1, gap))
        story.extend(block)
    story.append(NextPageTemplate("content"))
    story.append(PageBreak())
    return story


def body(versions: dict[str, str]) -> list:
    story: list = []
    story.append(
        P(
            "<b>Declaration.</b> We declare that this report and the program in "
            f"{code('ta3-implementation/')} are our own work for DBMS TA-3."
        )
    )
    story.append(heading("1. Introduction and objective"))
    story.append(
        P(
            "Phase 1 of this term paper reviewed persistent memory for AI agents. Phase 2 "
            "compared Notion's Lore with the same logical schema on SQLite and PostgreSQL, "
            "and added Nemori, LightMem, and <i>Harness the Memory</i>. The recommendation "
            "was a local relational store: episodic rows, semantic triples with a validity "
            "interval, a normalised entity and alias table, provenance back to the episode "
            "that supported a claim, and indexes for keyword and vector retrieval. Lore's "
            "vault stays readable, but it cannot declare those constraints. This phase "
            "implements that store."
        )
    )
    story.append(
        P(
            "The objective is a small program a reader can run. It has to support write, "
            "retrieve (keyword and vector), consolidate, update, and forget, on a schema "
            "with keys and checks, and print the result of one agent session."
        )
    )

    story.append(heading("2. Software and tools"))
    story.append(
        P(
            "The memory store imports only the Python standard library. The versions below "
            "were read on the machine that produced the screenshots."
        )
    )
    story.append(
        navy_table(
            [
                ["Software", "Version", "Role"],
                ["Python", versions["python"], f"{code('sqlite3')} is in the standard library, so {code('python3 demo.py')} needs no extra packages."],
                ["SQLite", versions["sqlite"], "One file, with foreign keys, checks, a partial unique index, and FTS5. No server."],
                ["sqlite3 CLI", versions["sqlite"], f"Runs {code('queries.sql')} at the end of the demo."],
                ["VS Code", versions["vscode"], "Editor used for the code screenshots."],
                ["xfce4-terminal", versions["terminal"], f"Terminal used to run {code('python3 demo.py')}."],
                ["Graphviz", versions["graphviz"], f"{code('dot')} and {code('neato')} drew the diagrams."],
                ["ReportLab", versions["reportlab"], "Prints this PDF. Not used by the demo."],
                ["Linux", f"{versions['os']}; kernel {versions['kernel']}", f"The machine the demo was run on ({versions['machine']})."],
            ],
            [CONTENT_W * 0.20, CONTENT_W * 0.28, CONTENT_W * 0.52],
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        P(
            "PostgreSQL would add a temporal exclusion constraint, which SQLite cannot "
            "express. That is noted under future work. SQLite is enough to show primary "
            "keys, foreign keys, checks, and a partial unique index, and the program runs "
            "from a clone with no extra install."
        )
    )

    story.append(heading("3. System architecture"))
    story.append(
        P(
            f"An agent session does not talk to SQL itself. {code('demo.py')} calls "
            f"{code('MemoryStore')}. The class opens one SQLite connection, turns foreign "
            f"keys on (SQLite leaves them off unless asked), and applies {code('schema.sql')}. "
            "Each operation is a short transaction. Retrieval is three queries whose ranks "
            "are fused in Python with reciprocal rank fusion, the same rule Phase 2 noted "
            "in Lore, with the constant k = 60."
        )
    )
    story.append(
        figure(
            1,
            SHOT_FILES["architecture"],
            f"How the pieces fit. {code('demo.py')} calls {code('MemoryStore')}, and that module is the only writer of {code('memory.db')}.",
        )
    )
    story.append(
        P(
            "The six memory operations from the Phase 2 survey map onto the schema as follows. "
            "Write inserts an episode and indexes it. Assert inserts a semantic fact. "
            "Supersede is the update: the old row's interval is closed and a new row is "
            "inserted. Forget changes a status flag and keeps the row, so provenance still "
            "joins. Retrieve reads. Consolidate inserts a summary row. That summary is the "
            "active facts from the session, not a second copy of the episodes."
        )
    )

    story.append(heading("4. Database schema"))
    story.append(
        P(
            "Figure 2 is the ER diagram of the memory store, drawn in Chen notation. "
            "An entity is a rectangle, an attribute is an ellipse, and a relationship is a "
            "diamond. Primary keys are underlined. Cardinality (1 or N) is written on the "
            f"lines. {code('alias')} and {code('keyword')} are multi-valued, so they are "
            "double ellipses. Embedding depends on the episode, fact, or summary it describes, "
            "so it is a weak entity (double rectangle) and {code('embeds')} is a double diamond. "
            "A later fact that replaces an earlier one is the {code('succeeds')} relationship. "
            "In the tables, a multi-valued attribute is its own rows: "
            f"{code('alias_key')} is a primary key, and {code('keyword')} has a check that "
            "exactly one parent is set."
        )
    )
    story.append(
        figure(2, SHOT_FILES["er"], "ER diagram of the memory store.")
    )
    story.append(
        P(
            f"{code('FACT')} is the semantic memory. {code('valid_from')} and "
            f"{code('valid_until')} are valid time. A check requires an active fact to "
            "have an open interval, and a superseded or forgotten fact to have a closed one. "
            f"The partial unique index {code('ux_one_active_functional_fact')} allows many "
            f"historical owners and at most one active {code('owned_by')}, {code('is_a')}, "
            f"or {code('created_by')} per subject. {code('uses')} is not in that index: "
            "an application may use more than one system, and a wrong guess is forgotten "
            f"rather than blocked. Views {code('belief_history')} and {code('current_belief')} "
            "are what the as-of query and the current-owner query read."
        )
    )
    story.append(
        figure(
            3,
            SHOT_FILES["code_schema"],
            f"The fact table and the partial unique index in {code('schema.sql')}, open in VS Code. An active fact must have an open interval. The index allows many past owners and only one current {code('owned_by')}, {code('is_a')}, or {code('created_by')}.",
        )
    )

    story.append(heading("5. Implementation"))
    story.append(
        P(
            f"{code('memory_store.py')} is the only module. Tokens are lower-cased, stopwords "
            "are dropped, and a short suffix stem (owns and owned both become own) makes the "
            "keyword table agree with the FTS5 porter tokenizer. Embeddings are a signed "
            "feature hash into 512 buckets, using SHA-256 so the vector does not change "
            "between processes. Cosine similarity is the dot product of two unit vectors. "
            "There is no neural model and no network call. The embedding table stores a JSON "
            f"array of floats, which {code('sqlite3')} can print."
        )
    )
    story.append(
        P(
            f"{code('assert_fact')} resolves names through {code('entity_alias')}, so "
            "the session can say \"the app\" and hit Campus Navigator. If a functional "
            "predicate already has a different active object, the method raises "
            f"{code('FactConflict')} and does not insert. {code('supersede_fact')} "
            "then closes the old interval and inserts the replacement in one transaction: "
            "it marks the old row superseded, inserts the new row, and sets "
            f"{code('superseded_by')}. The unique index is never asked to hold two active "
            "owners. Figure 8 shows what a raw second insert does."
        )
    )
    story.append(
        figure(
            4,
            SHOT_FILES["code_retrieve"],
            f"{code('retrieve')} in {code('memory_store.py')}. Three ranked lists are fused with reciprocal rank fusion, k = 60. The lanes field is what the transcript prints.",
        )
    )
    story.append(
        P(
            f"{code('forget_fact')} sets status to forgotten and writes {code('valid_until')}. "
            f"{code('forget_episode')} sets forgotten and deletes that episode's keyword rows. "
            "The episode row stays, because a fact may still cite it. Deleting the episode "
            "outright is refused by the foreign key, which the demo provokes and then rolls back. "
            f"{code('consolidate')} inserts one summary row whose text is the active facts "
            "sourced from the session, with their confidences. That is a stored row, not a "
            "language-model summary."
        )
    )
    story.append(
        P(
            f"{code('demo.py')} is the session. The clock is a list of fixed timestamps, "
            "so a second run prints the same transcript. Figure 5 is the part that registers "
            "entities and the six turns."
        )
    )
    story.append(
        figure(
            5,
            SHOT_FILES["code_demo"],
            f"The scripted session in {code('demo.py')}. Aliases are registered with the entity, and each turn is one episode.",
        )
    )

    story.append(heading("6. Output and results"))
    story.append(
        P(
            f"{code('python3 demo.py')} deletes any existing {code('memory.db')}, applies "
            "the schema, and runs the session. The figures in this section are screenshots "
            "of that run in xfce4-terminal. The same transcript is saved in "
            f"{code('captures/demo-stdout.txt')} when this PDF is rebuilt."
        )
    )
    story.append(
        figure(
            6,
            SHOT_FILES["term_write"],
            f"The start of {code('python3 demo.py')}. The partial unique index is printed from {code('sqlite_master')}, then the six episodes. The alias {code('the app')} resolves to entity 1, Campus Navigator.",
        )
    )
    story.append(
        figure(
            7,
            SHOT_FILES["term_update"],
            "Facts, then the update. The API refuses a second active owner. Supersede closes fact 1 at 09:40 and inserts fact 5. Fact 4 and episode 5 (the MongoDB guess) are forgotten. The history shows fact 1 superseded and fact 5 active.",
        )
    )
    story.append(
        figure(
            8,
            SHOT_FILES["term_retrieve"],
            f"A raw INSERT of another active {code('owned_by')} fails with UNIQUE constraint failed. The predicate query returns AI Lab, fact 5. Lexical fusion ranks the old ownership episode first and the current fact third. After the MongoDB rows are forgotten, the query MongoDB returns no hit.",
        )
    )
    story.append(
        figure(
            9,
            SHOT_FILES["term_checks"],
            "Consolidation, the foreign-key refusal, and the nine checks. The summary names SQLite, Harshit Khemani, and AI Lab, and does not name MongoDB. Deleting episode 3, which fact 2 cites, is refused.",
        )
    )
    story.append(
        figure(
            10,
            SHOT_FILES["term_queries"],
            "The sqlite3 section of the same run. Three facts are current. At 09:30 the owner was the DBMS project team. Aliases are one row each.",
        )
    )

    story.append(heading("7. Testing and observations"))
    story.append(
        P(
            "The demo ends in nine checks, all passed on the run in the figures: "
            f"alias resolution, a single active owner, the 09:30 as-of result, the forgotten "
            f"MongoDB fact absent from {code('current_belief')}, a SQLite hit for "
            "\"full-text search sqlite\", an empty result for \"MongoDB\", a new fact id from "
            f"supersede, the summary naming AI Lab, and {code('PRAGMA integrity_check')}. "
            "The process exits 0 only if every check passes. Two consecutive runs printed "
            "the same transcript."
        )
    )
    story.append(
        P(
            "Two results are easy to mix up. First, lexical retrieval of \"who owns Campus "
            "Navigator\" ranks episode 2 (the DBMS project team) above fact 5 (AI Lab). The "
            "old sentence is still in the episode table, and it shares the query's words. "
            f"The question \"who owns it now\" is the predicate query on {code('current_belief')}, "
            "which returns AI Lab only. The as-of query is what returns the earlier owner. "
            "Keyword search and the validity interval answer different questions, and the "
            "transcript shows both. Second, forgetting removes the MongoDB rows from retrieval "
            "without deleting the entity. The entity and its alias remain, which is what a "
            "registry is for."
        )
    )
    story.append(
        P(
            "The foreign-key refusal in Figure 9 happens on the Python connection, which "
            f"has executed {code('PRAGMA foreign_keys = ON')}. A bare {code('sqlite3')} "
            "shell does not turn that pragma on by itself. The keys are declared either way. "
            f"Enforcement is per connection. {code('queries.sql')} still prints "
            f"{code('PRAGMA foreign_key_list(fact)')}, and that listing has the four "
            f"foreign keys on {code('fact')}."
        )
    )

    story.append(heading("8. Limitations and future work"))
    story.append(
        P(
            "The feature hash measures token overlap. It is not a semantic embedding, and "
            "similarity is a scan of a few dozen vectors rather than an approximate index. "
            "A model can replace embed without a schema change: the column is already a "
            "vector of floats. Consolidation does not implement Nemori's predict-calibrate "
            "loop or LightMem's sleep-time update. It stores the active facts of one session. "
            "The partial unique index is weaker than the PostgreSQL exclusion constraint in "
            "Phase 2: it limits active rows, and it does not reject two closed intervals that "
            "overlap. The demo is a single writer, so it does not reproduce a lost update. "
            "The unique index is what would make that race fail instead of silently keeping "
            "both rows. There is no authentication."
        )
    )
    story.append(
        P(
            "<i>Harness the Memory</i> found that no one substrate wins every task. This "
            "program already runs a predicate query beside the fused lexical lanes. A later "
            "version can route a question to one or the other instead of always printing both. "
            "Moving the same schema to PostgreSQL would be the place to add the range "
            "exclusion constraint SQLite does not have."
        )
    )

    story.append(heading("9. Conclusion"))
    story.append(
        P(
            "TA-3 is a runnable SQLite memory for one agent. Episodes, entities, aliases, "
            "facts, keywords, embeddings, and a session summary are ordinary tables with "
            "keys and checks. The session writes six turns, refuses a second current owner "
            "until the old interval is closed, forgets a speculative fact without losing the "
            "audit trail, and answers \"who owns Campus Navigator\" both as a predicate query "
            "(AI Lab, from 09:40) and as a fused retrieval over the text. Nine checks pass "
            "from a clean database file."
        )
    )

    story.append(heading("References"))
    refs = [
        "[1] Notion (makenotion). <i>lore: persistent, shared AI memory backed by Notion</i>. GitHub, MIT licence, commit 95c3558. https://github.com/makenotion/lore",
        "[2] W. Ma, J. Nan, W. Wu, and Y. Chen. <i>Nemori: Self-Organizing Agent Memory Inspired by Cognitive Science</i>. arXiv:2508.03341, 2025. Revised as <i>What Deserves Memory: Adaptive Memory Distillation for LLM Agents</i>.",
        "[3] J. Fang, X. Deng, H. Chen, N. Zhang, et al. <i>LightMem: Lightweight and Efficient Memory-Augmented Generation</i>. ICLR 2026. arXiv:2510.18866.",
        "[4] W.-C. Huang, W. Zhang, Y. Wu, Y. Chen, et al. <i>Harness the Memory: A Holistic Evaluation of Memory Substrates in Memory Agents</i>. arXiv:2608.15008, 2026.",
        "[5] Y. Du, W. Huang, D. Zheng, Z. Wang, S. Montella, M. Lapata, K.-F. Wong, and J. Z. Pan. <i>Rethinking Memory in AI: Taxonomy, Operations, Topics, and Future Directions</i>. arXiv:2505.00675, 2025.",
        "[6] C. Packer, V. Fang, S. G. Patil, K. Lin, S. Wooders, and J. E. Gonzalez. <i>MemGPT: Towards LLMs as Operating Systems</i>. arXiv:2310.08560, 2023.",
        "[7] P. Chhikara, D. Khant, S. Aryan, T. Singh, and D. Yadav. <i>Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory</i>. arXiv:2504.19413, 2025.",
        "[8] P. Rasmussen, P. Paliychuk, T. Beauvais, J. Ryan, and D. Chalef. <i>Zep: A Temporal Knowledge Graph Architecture for Agent Memory</i>. arXiv:2501.13956, 2025.",
        "[9] G. V. Cormack, C. L. A. Clarke, and S. Buettcher. <i>Reciprocal Rank Fusion Outperforms Condorcet and Individual Rank Learning Methods</i>. SIGIR 2009.",
        "[10] E. F. Codd. <i>A Relational Model of Data for Large Shared Data Banks</i>. Communications of the ACM 13(6):377-387, 1970.",
        "[11] P. P.-S. Chen. <i>The Entity-Relationship Model: Toward a Unified View of Data</i>. ACM Transactions on Database Systems 1(1):9-36, 1976.",
        "[12] K. Kulkarni and J.-E. Michels. <i>Temporal Features in SQL:2011</i>. ACM SIGMOD Record 41(3):34-43, 2012.",
        "[13] K. Weinberger, A. Dasgupta, J. Langford, A. Smola, and J. Attenberg. <i>Feature Hashing for Large Scale Multitask Learning</i>. ICML 2009.",
        "[14] C. Sciavolino, Z. Zhong, J. Lee, and D. Chen. <i>Simple Entity-Centric Questions Challenge Dense Retrievers</i>. EMNLP 2021. arXiv:2109.08535.",
    ]
    for ref in refs:
        story.append(P(ref, "ref"))
    return story


def main() -> int:
    meta = load_members()
    if not LOGO_PATH.exists():
        raise SystemExit(f"missing logo: {LOGO_PATH}")
    CAPTURES.mkdir(parents=True, exist_ok=True)
    versions = toolchain()
    (CAPTURES / "versions.txt").write_text(
        "\n".join(f"{key}={value}" for key, value in versions.items()) + "\n"
    )
    demo = run([sys.executable, str(ROOT / "demo.py")])
    if "all checks passed" not in demo:
        raise SystemExit("demo did not pass its checks")
    (CAPTURES / "demo-stdout.txt").write_text(demo)
    (CAPTURES / "schema-fact.txt").write_text(
        run(["sqlite3", str(ROOT / "memory.db"), ".schema fact"])
    )
    render_diagrams()
    missing = [name for name, path in SHOT_FILES.items() if not path.exists()]
    if missing:
        raise SystemExit(f"missing screenshots: {missing}")

    buf = io.BytesIO()
    doc = Report(buf)
    doc.build(cover(meta) + body(versions))
    PDF_PATH.write_bytes(buf.getvalue())
    print(f"wrote {PDF_PATH} ({PDF_PATH.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
