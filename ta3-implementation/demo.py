"""One agent session against the memory store.

The clock is fixed so a second run prints the same transcript. Nothing here
calls a language model: the agent records what it was told, and the database
does retrieval, update, forgetting, and consolidation.
"""

from __future__ import annotations

import sqlite3
import subprocess
import sys
import textwrap
from pathlib import Path

from memory_store import FactConflict, MemoryStore

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "memory.db"


def section(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def emit(text: str) -> None:
    indent = text[: len(text) - len(text.lstrip(" "))]
    print(
        textwrap.fill(
            text.strip(),
            width=88,
            initial_indent=indent,
            subsequent_indent=indent,
        )
    )


def main() -> int:
    if DB_PATH.exists():
        DB_PATH.unlink()
    store = MemoryStore(DB_PATH)
    store.init_schema()

    section("1. Schema")
    tables = [
        row[0]
        for row in store.conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        )
    ]
    print(f"database file: {DB_PATH.name}")
    emit("tables: " + ", ".join(tables))
    index = store.conn.execute(
        "SELECT sql FROM sqlite_master WHERE name = 'ux_one_active_functional_fact'"
    ).fetchone()
    print("partial unique index ux_one_active_functional_fact:")
    emit(" ".join(index[0].split()))

    section("2. Write a session")
    agent_id = store.ensure_agent("Archivist", "2026-09-30T09:00:00")
    session_id = store.open_session(agent_id, "Campus Navigator design", "2026-09-30T09:00:00")
    print(f"agent {agent_id} Archivist, session {session_id}")

    t = "2026-09-30T09:00:00"
    store.ensure_entity(
        "Campus Navigator", "project", t, aliases=["the app", "navigator"]
    )
    store.ensure_entity(
        "DBMS project team", "team", t, aliases=["the team", "project team"]
    )
    store.ensure_entity("SQLite", "system", t, aliases=["sqlite3"])
    store.ensure_entity("MongoDB", "system", t, aliases=["mongo"])
    store.ensure_entity("AI Lab", "team", t, aliases=["the lab"])
    store.ensure_entity("Harshit Khemani", "person", t, aliases=["Harshit"])

    turns = [
        (
            "2026-09-30T09:05:00",
            "We are building Campus Navigator, a student app for SGT University.",
        ),
        (
            "2026-09-30T09:10:00",
            "Campus Navigator is owned by the DBMS project team.",
        ),
        (
            "2026-09-30T09:15:00",
            "The app uses SQLite for persistent memory, because we need "
            "foreign keys and full-text search.",
        ),
        (
            "2026-09-30T09:20:00",
            "Harshit Khemani created the memory schema.",
        ),
        (
            "2026-09-30T09:25:00",
            "A teammate guessed the app uses MongoDB. "
            "That guess is speculative and wrong.",
        ),
        (
            "2026-09-30T09:40:00",
            "Ownership moved. The AI Lab now owns Campus Navigator.",
        ),
    ]
    episode_ids: list[int] = []
    for when, content in turns:
        episode_id = store.write_episode(session_id, "user", content, when, importance=0.7)
        episode_ids.append(episode_id)
        emit(f"episode {episode_id}  {when}  {content}")

    resolved = store.resolve("the app")
    emit(
        f"alias 'the app' -> entity {resolved['entity_id']} "
        f"{resolved['name']} ({resolved['kind']})"
    )

    section("3. Assert semantic facts")
    facts = {
        "owned": store.assert_fact(
            "Campus Navigator",
            "owned_by",
            "the team",
            "2026-09-30T09:10:00",
            confidence=0.9,
            stance="certain",
            source_episode_id=episode_ids[1],
            object_is_entity=True,
        ),
        "uses": store.assert_fact(
            "the app",
            "uses",
            "SQLite",
            "2026-09-30T09:15:00",
            confidence=0.95,
            stance="certain",
            source_episode_id=episode_ids[2],
            object_is_entity=True,
        ),
        "author": store.assert_fact(
            "Campus Navigator",
            "created_by",
            "Harshit",
            "2026-09-30T09:20:00",
            confidence=0.9,
            stance="certain",
            source_episode_id=episode_ids[3],
            object_is_entity=True,
        ),
        "mongo": store.assert_fact(
            "the app",
            "uses",
            "mongo",
            "2026-09-30T09:25:00",
            confidence=0.3,
            stance="speculative",
            source_episode_id=episode_ids[4],
            object_is_entity=True,
        ),
    }
    for row in store.current_beliefs():
        emit(
            f"fact {row['fact_id']:>2}  {row['subject']} {row['predicate']} {row['object']}"
            f"  {row['stance']} {row['confidence']:.2f}  from {row['valid_from']}"
        )

    section("4. Update and forget")
    try:
        store.assert_fact(
            "navigator",
            "owned_by",
            "AI Lab",
            "2026-09-30T09:40:00",
            confidence=0.9,
            stance="certain",
            source_episode_id=episode_ids[5],
            object_is_entity=True,
        )
        print("ERROR: a second active owner was accepted")
    except FactConflict as conflict:
        print(f"API refused a second active owner (fact {conflict.fact_id} is still current)")
        print(f"  existing: {conflict.statement}")

    new_owner = store.supersede_fact(
        facts["owned"],
        "the lab",
        "2026-09-30T09:40:00",
        confidence=0.92,
        stance="certain",
        source_episode_id=episode_ids[5],
        object_is_entity=True,
    )
    print(f"supersede fact {facts['owned']} -> fact {new_owner} at 09:40")
    store.forget_fact(facts["mongo"], "2026-09-30T09:42:00")
    print(f"forget fact {facts['mongo']} (speculative MongoDB use) at 09:42")
    guess = episode_ids[4]
    store.forget_episode(guess)
    print(f"forget episode {guess} (the wrong guess is kept in the table, hidden from retrieval)")

    print("ownership history:")
    for row in store.conn.execute(
        """
        SELECT fact_id, object, status, valid_from, valid_until
        FROM belief_history
        WHERE subject = 'Campus Navigator' AND predicate = 'owned_by'
        ORDER BY valid_from
        """
    ):
        until = row["valid_until"] or "open"
        print(
            f"  fact {row['fact_id']}  {row['object']}  {row['status']}"
            f"  [{row['valid_from']} .. {until}]"
        )

    section("5. The index refuses what the API already refused")
    subject = store.resolve("Campus Navigator")
    other = store.resolve("DBMS project team")
    try:
        store.conn.execute(
            """
            INSERT INTO fact (
              subject_entity_id, predicate, object_entity_id, confidence, stance,
              valid_from, status, statement, created_at
            ) VALUES (?, 'owned_by', ?, 0.5, 'likely', ?, 'active', ?, ?)
            """,
            (
                subject["entity_id"],
                other["entity_id"],
                "2026-09-30T09:50:00",
                "Campus Navigator owned by DBMS project team",
                "2026-09-30T09:50:00",
            ),
        )
        store.conn.commit()
        print("ERROR: unique index did not fire")
    except sqlite3.IntegrityError as exc:
        store.conn.rollback()
        print(f"IntegrityError: {exc}")

    section("6. Retrieve")
    owner = store.conn.execute(
        """
        SELECT fact_id, object, valid_from
        FROM current_belief
        WHERE subject = 'Campus Navigator' AND predicate = 'owned_by'
        """
    ).fetchone()
    print(
        f"predicate lookup owned_by(Campus Navigator) = {owner['object']}"
        f"  (fact {owner['fact_id']}, from {owner['valid_from']})"
    )
    for query, limit in (
        ("full-text search sqlite", 3),
        ("who owns Campus Navigator", 5),
        ("MongoDB", 3),
    ):
        print()
        print(f"query: {query}")
        hits = store.retrieve(query, limit=limit)
        if not hits:
            print("  (no hit)")
            continue
        for rank, hit in enumerate(hits, start=1):
            print(
                f"  {rank}. {hit['kind']:<7} id={hit['id']:<2} "
                f"rrf={hit['score']:.4f}  lanes={hit['lanes']}"
            )
            emit(f"     {hit['text']}")

    section("7. Consolidate")
    summary_id = store.consolidate(session_id, "2026-09-30T09:45:00")
    summary = store.conn.execute(
        "SELECT body, episode_count FROM summary WHERE summary_id = ?",
        (summary_id,),
    ).fetchone()
    print(f"summary {summary_id} over {summary['episode_count']} live episodes")
    emit(summary["body"])

    section("8. Provenance delete is refused")
    source = facts["uses"]
    episode_id = store.conn.execute(
        "SELECT source_episode_id FROM fact WHERE fact_id = ?", (source,)
    ).fetchone()["source_episode_id"]
    try:
        store.conn.execute("SAVEPOINT delete_demo")
        store.conn.execute("DELETE FROM episode WHERE episode_id = ?", (episode_id,))
        store.conn.execute("RELEASE SAVEPOINT delete_demo")
        print("ERROR: episode delete was accepted")
    except sqlite3.IntegrityError as exc:
        store.conn.execute("ROLLBACK TO SAVEPOINT delete_demo")
        store.conn.execute("RELEASE SAVEPOINT delete_demo")
        print(f"DELETE episode {episode_id} refused: {exc}")

    section("9. Checks")
    failures = _checks(store, facts, new_owner, episode_ids)
    store.close()

    section("10. sqlite3 queries")
    completed = subprocess.run(
        ["sqlite3", "-header", str(DB_PATH)],
        input=(ROOT / "queries.sql").read_text(),
        text=True,
        check=True,
        capture_output=True,
    )
    sys.stdout.write(completed.stdout)
    if completed.stderr:
        sys.stderr.write(completed.stderr)

    print()
    if failures:
        print(f"{len(failures)} check(s) failed")
        return 1
    print("all checks passed")
    return 0


def _checks(
    store: MemoryStore,
    facts: dict[str, int],
    new_owner: int,
    episode_ids: list[int],
) -> list[str]:
    failures: list[str] = []

    def expect(name: str, ok: bool) -> None:
        print(f"{'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            failures.append(name)

    alias = store.resolve("the app")
    expect("alias 'the app' is Campus Navigator", alias is not None and alias["name"] == "Campus Navigator")

    owners = list(
        store.conn.execute(
            """
            SELECT object, status FROM belief_history
            WHERE subject = 'Campus Navigator' AND predicate = 'owned_by' AND status = 'active'
            """
        )
    )
    expect("exactly one active owner", len(owners) == 1 and owners[0]["object"] == "AI Lab")

    as_of = store.conn.execute(
        """
        SELECT object FROM belief_history
        WHERE subject = 'Campus Navigator' AND predicate = 'owned_by'
          AND valid_from <= '2026-09-30T09:30:00'
          AND (valid_until IS NULL OR valid_until > '2026-09-30T09:30:00')
        """
    ).fetchone()
    expect("as-of 09:30 the owner is the DBMS project team", as_of["object"] == "DBMS project team")

    hidden = store.conn.execute(
        "SELECT status FROM fact WHERE fact_id = ?", (facts["mongo"],)
    ).fetchone()
    still_current = store.conn.execute(
        "SELECT 1 FROM current_belief WHERE fact_id = ?", (facts["mongo"],)
    ).fetchone()
    expect("MongoDB fact is forgotten and not a current belief", hidden["status"] == "forgotten" and still_current is None)

    hits = store.retrieve("full-text search sqlite", limit=3)
    expect(
        "retrieval of 'full-text search sqlite' hits a SQLite memory",
        any("SQLite" in str(hit["text"]) for hit in hits),
    )
    mongo_hits = store.retrieve("MongoDB", limit=5)
    expect("forgotten MongoDB memory is not retrieved", mongo_hits == [])
    expect("supersede wrote a new fact id", new_owner != facts["owned"])
    summary = store.conn.execute("SELECT body FROM summary").fetchone()
    expect("summary names the AI Lab", summary is not None and "AI Lab" in summary["body"])
    integrity = store.conn.execute("PRAGMA integrity_check").fetchone()[0]
    expect("PRAGMA integrity_check is ok", integrity == "ok")
    return failures


if __name__ == "__main__":
    sys.exit(main())
