"""Persistent memory store for one AI agent.

The public operations are the six memory atoms from the survey cited in the
term paper, under their database names:

  write          indexing a new episode, and the entities it mentions
  assert_fact    a semantic insert
  supersede_fact updating (close the old validity interval, insert the new row)
  forget_*       a retention change that does not destroy provenance
  retrieve       query processing: keyword, FTS5, and vector, fused
  consolidate    compression: store the summary as a materialised row

Embeddings are a feature hash, not a neural model, so the demo needs no
network and no API key. The schema does not care: it stores a vector of floats.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
from pathlib import Path

DIMS = 512
RRF_K = 60
SCHEMA_PATH = Path(__file__).with_name("schema.sql")

STOPWORDS = frozenset(
    """
    a an the is are was were be been being of to for and or but we it its by
    on in that this with because from as at our their they them you your
    """.split()
)

FUNCTIONAL = frozenset({"owned_by", "is_a", "created_by"})

_TOKEN = re.compile(r"[a-z0-9]+")


def stem(token: str) -> str:
    """A small suffix stem so the keyword table agrees with FTS5 porter.

    Porter already matches ``owns`` to ``owned``. The keyword rows are exact,
    so without this step a query for ``owns`` misses a fact stored as ``owned``.
    """
    if len(token) > 5 and token.endswith("ing"):
        return token[:-3]
    if len(token) > 4 and token.endswith("ed"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


class FactConflict(Exception):
    """A functional predicate already has a different active object."""

    def __init__(self, fact_id: int, statement: str) -> None:
        super().__init__(statement)
        self.fact_id = fact_id
        self.statement = statement


def tokenize(text: str) -> list[str]:
    seen: list[str] = []
    for raw in _TOKEN.findall(text.lower()):
        if raw in STOPWORDS or len(raw) < 2:
            continue
        token = stem(raw)
        if token not in seen:
            seen.append(token)
    return seen


def embed(text: str) -> list[float]:
    """Signed feature hash. Stable across processes (sha256, not hash())."""
    vector = [0.0] * DIMS
    tokens = tokenize(text)
    if not tokens:
        return vector
    for token in tokens:
        digest = hashlib.sha256(token.encode()).digest()
        bucket = int.from_bytes(digest[:4], "big") % DIMS
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[bucket] += sign
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right))


def _key_name(name: str) -> str:
    return " ".join(name.lower().split())


def _statement(subject: str, predicate: str, obj: str) -> str:
    spoken = predicate.replace("_", " ")
    return f"{subject} {spoken} {obj}"


class MemoryStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    def close(self) -> None:
        self.conn.close()

    def init_schema(self) -> None:
        self.conn.executescript(SCHEMA_PATH.read_text())

    def ensure_agent(self, name: str, when: str) -> int:
        row = self.conn.execute(
            "SELECT agent_id FROM agent WHERE name = ?", (name,)
        ).fetchone()
        if row is not None:
            return int(row["agent_id"])
        cursor = self.conn.execute(
            "INSERT INTO agent (name, created_at) VALUES (?, ?)", (name, when)
        )
        self.conn.commit()
        return int(cursor.lastrowid)

    def open_session(self, agent_id: int, title: str, when: str) -> int:
        cursor = self.conn.execute(
            "INSERT INTO session (agent_id, title, started_at) VALUES (?, ?, ?)",
            (agent_id, title, when),
        )
        self.conn.commit()
        return int(cursor.lastrowid)

    def write_episode(
        self,
        session_id: int,
        role: str,
        content: str,
        when: str,
        importance: float = 0.5,
    ) -> int:
        turn = self.conn.execute(
            "SELECT COALESCE(MAX(turn_index), -1) + 1 AS n FROM episode WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        cursor = self.conn.execute(
            """
            INSERT INTO episode (session_id, turn_index, role, content, importance, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session_id, int(turn["n"]), role, content, importance, when),
        )
        episode_id = int(cursor.lastrowid)
        self._index_keywords(tokenize(content), episode_id=episode_id)
        self._store_embedding(embed(content), episode_id=episode_id)
        self.conn.commit()
        return episode_id

    def ensure_entity(
        self,
        name: str,
        kind: str,
        when: str,
        aliases: list[str] | None = None,
        description: str | None = None,
    ) -> int:
        key = _key_name(name)
        row = self.conn.execute(
            "SELECT entity_id FROM entity WHERE name_key = ?", (key,)
        ).fetchone()
        if row is None:
            cursor = self.conn.execute(
                """
                INSERT INTO entity (name, name_key, kind, description, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (name, key, kind, description, when),
            )
            entity_id = int(cursor.lastrowid)
        else:
            entity_id = int(row["entity_id"])
        names = [name, *(aliases or [])]
        for alias in names:
            alias_key = _key_name(alias)
            if not alias_key:
                continue
            existing = self.conn.execute(
                "SELECT entity_id FROM entity_alias WHERE alias_key = ?",
                (alias_key,),
            ).fetchone()
            if existing is None:
                self.conn.execute(
                    "INSERT INTO entity_alias (alias_key, alias, entity_id) VALUES (?, ?, ?)",
                    (alias_key, alias, entity_id),
                )
            elif int(existing["entity_id"]) != entity_id:
                raise sqlite3.IntegrityError(
                    f"alias {alias!r} already belongs to entity {existing['entity_id']}"
                )
        self.conn.commit()
        return entity_id

    def resolve(self, name_or_alias: str) -> sqlite3.Row | None:
        key = _key_name(name_or_alias)
        return self.conn.execute(
            """
            SELECT e.entity_id, e.name, e.kind, a.alias
            FROM entity_alias a
            JOIN entity e ON e.entity_id = a.entity_id
            WHERE a.alias_key = ?
            """,
            (key,),
        ).fetchone()

    def assert_fact(
        self,
        subject: str,
        predicate: str,
        obj: str,
        when: str,
        *,
        confidence: float,
        stance: str,
        source_episode_id: int | None,
        object_is_entity: bool,
    ) -> int:
        subject_row = self.resolve(subject)
        if subject_row is None:
            raise KeyError(f"unknown subject {subject!r}")
        object_entity_id = None
        object_text = None
        object_label = obj
        if object_is_entity:
            object_row = self.resolve(obj)
            if object_row is None:
                raise KeyError(f"unknown object {obj!r}")
            object_entity_id = int(object_row["entity_id"])
            object_label = str(object_row["name"])
        else:
            object_text = obj
        statement = _statement(str(subject_row["name"]), predicate, object_label)
        if predicate in FUNCTIONAL:
            current = self._active_functional(int(subject_row["entity_id"]), predicate)
            if current is not None:
                same_entity = (
                    object_entity_id is not None
                    and current["object_entity_id"] == object_entity_id
                )
                same_text = object_text is not None and current["object_text"] == object_text
                if same_entity or same_text:
                    return int(current["fact_id"])
                raise FactConflict(int(current["fact_id"]), str(current["statement"]))
        return self._insert_fact(
            subject_entity_id=int(subject_row["entity_id"]),
            predicate=predicate,
            object_text=object_text,
            object_entity_id=object_entity_id,
            confidence=confidence,
            stance=stance,
            valid_from=when,
            source_episode_id=source_episode_id,
            statement=statement,
            when=when,
        )

    def supersede_fact(
        self,
        fact_id: int,
        obj: str,
        when: str,
        *,
        confidence: float,
        stance: str,
        source_episode_id: int | None,
        object_is_entity: bool,
    ) -> int:
        old = self.conn.execute("SELECT * FROM fact WHERE fact_id = ?", (fact_id,)).fetchone()
        if old is None:
            raise KeyError(f"no fact {fact_id}")
        if old["status"] != "active":
            raise ValueError(f"fact {fact_id} is {old['status']}, not active")
        if when < old["valid_from"]:
            raise ValueError("new validity starts before the fact it replaces")
        object_entity_id = None
        object_text = None
        object_label = obj
        if object_is_entity:
            object_row = self.resolve(obj)
            if object_row is None:
                raise KeyError(f"unknown object {obj!r}")
            object_entity_id = int(object_row["entity_id"])
            object_label = str(object_row["name"])
        else:
            object_text = obj
        subject = self.conn.execute(
            "SELECT name FROM entity WHERE entity_id = ?", (old["subject_entity_id"],)
        ).fetchone()
        statement = _statement(str(subject["name"]), str(old["predicate"]), object_label)
        try:
            self.conn.execute("BEGIN")
            self.conn.execute(
                """
                UPDATE fact
                SET status = 'superseded', valid_until = ?
                WHERE fact_id = ? AND status = 'active'
                """,
                (when, fact_id),
            )
            new_id = self._insert_fact(
                subject_entity_id=int(old["subject_entity_id"]),
                predicate=str(old["predicate"]),
                object_text=object_text,
                object_entity_id=object_entity_id,
                confidence=confidence,
                stance=stance,
                valid_from=when,
                source_episode_id=source_episode_id,
                statement=statement,
                when=when,
                commit=False,
            )
            self.conn.execute(
                "UPDATE fact SET superseded_by = ? WHERE fact_id = ?",
                (new_id, fact_id),
            )
            self.conn.commit()
        except Exception:
            self.conn.rollback()
            raise
        return new_id

    def forget_fact(self, fact_id: int, when: str) -> None:
        updated = self.conn.execute(
            """
            UPDATE fact
            SET status = 'forgotten', valid_until = ?
            WHERE fact_id = ? AND status = 'active'
            """,
            (when, fact_id),
        )
        if updated.rowcount != 1:
            raise KeyError(f"no active fact {fact_id}")
        self.conn.commit()

    def forget_episode(self, episode_id: int) -> None:
        updated = self.conn.execute(
            "UPDATE episode SET forgotten = 1 WHERE episode_id = ? AND forgotten = 0",
            (episode_id,),
        )
        if updated.rowcount != 1:
            raise KeyError(f"no live episode {episode_id}")
        self.conn.execute("DELETE FROM keyword WHERE episode_id = ?", (episode_id,))
        self.conn.commit()

    def consolidate(self, session_id: int, when: str) -> int:
        episodes = self.conn.execute(
            """
            SELECT episode_id, role, content
            FROM episode
            WHERE session_id = ? AND forgotten = 0
            ORDER BY turn_index
            """,
            (session_id,),
        ).fetchall()
        if not episodes:
            raise ValueError(f"session {session_id} has no live episodes")
        beliefs = self.conn.execute(
            """
            SELECT statement, confidence
            FROM current_belief
            WHERE source_episode_id IN (
              SELECT episode_id FROM episode WHERE session_id = ? AND forgotten = 0
            )
            ORDER BY fact_id
            """,
            (session_id,),
        ).fetchall()
        lines = [f"{row['statement']} (confidence {row['confidence']:.2f})" for row in beliefs]
        if lines:
            body = "Consolidated beliefs from this session: " + "; ".join(lines) + "."
        else:
            body = "This session produced no active facts."
        cursor = self.conn.execute(
            """
            INSERT INTO summary (
              session_id, body, episode_count, first_episode_id, last_episode_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                body,
                len(episodes),
                int(episodes[0]["episode_id"]),
                int(episodes[-1]["episode_id"]),
                when,
            ),
        )
        summary_id = int(cursor.lastrowid)
        self._store_embedding(embed(body), summary_id=summary_id)
        self.conn.commit()
        return summary_id

    def retrieve(self, query: str, limit: int = 5) -> list[dict[str, object]]:
        tokens = tokenize(query)
        lanes = {
            "fts": self._fts_keys(tokens),
            "keyword": self._keyword_keys(tokens),
            "vector": self._vector_keys(query),
        }
        scores: dict[str, float] = {}
        used: dict[str, list[str]] = {}
        for lane, keys in lanes.items():
            for rank, key in enumerate(keys, start=1):
                scores[key] = scores.get(key, 0.0) + 1.0 / (RRF_K + rank)
                used.setdefault(key, []).append(lane)
        ordered = sorted(scores, key=lambda key: (-scores[key], key))
        hits: list[dict[str, object]] = []
        for key in ordered[:limit]:
            kind, raw_id = key.split(":", 1)
            hits.append(
                {
                    "kind": kind,
                    "id": int(raw_id),
                    "score": scores[key],
                    "lanes": "+".join(used[key]),
                    "text": self._label(kind, int(raw_id)),
                }
            )
        return hits

    def current_beliefs(self) -> list[sqlite3.Row]:
        return list(
            self.conn.execute(
                """
                SELECT fact_id, subject, predicate, object, confidence, stance,
                       valid_from, valid_until
                FROM current_belief
                ORDER BY fact_id
                """
            )
        )

    def _active_functional(self, subject_entity_id: int, predicate: str) -> sqlite3.Row | None:
        return self.conn.execute(
            """
            SELECT fact_id, object_text, object_entity_id, statement
            FROM fact
            WHERE subject_entity_id = ? AND predicate = ? AND status = 'active'
            """,
            (subject_entity_id, predicate),
        ).fetchone()

    def _insert_fact(
        self,
        *,
        subject_entity_id: int,
        predicate: str,
        object_text: str | None,
        object_entity_id: int | None,
        confidence: float,
        stance: str,
        valid_from: str,
        source_episode_id: int | None,
        statement: str,
        when: str,
        commit: bool = True,
    ) -> int:
        cursor = self.conn.execute(
            """
            INSERT INTO fact (
              subject_entity_id, predicate, object_text, object_entity_id,
              confidence, stance, valid_from, status, source_episode_id,
              statement, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
            """,
            (
                subject_entity_id,
                predicate,
                object_text,
                object_entity_id,
                confidence,
                stance,
                valid_from,
                source_episode_id,
                statement,
                when,
            ),
        )
        fact_id = int(cursor.lastrowid)
        self._index_keywords(tokenize(statement), fact_id=fact_id)
        self._store_embedding(embed(statement), fact_id=fact_id)
        if commit:
            self.conn.commit()
        return fact_id

    def _index_keywords(
        self,
        terms: list[str],
        *,
        episode_id: int | None = None,
        fact_id: int | None = None,
    ) -> None:
        for term in terms[:12]:
            self.conn.execute(
                "INSERT INTO keyword (term, episode_id, fact_id) VALUES (?, ?, ?)",
                (term, episode_id, fact_id),
            )

    def _store_embedding(
        self,
        vector: list[float],
        *,
        episode_id: int | None = None,
        fact_id: int | None = None,
        summary_id: int | None = None,
    ) -> None:
        payload = json.dumps([round(value, 6) for value in vector])
        self.conn.execute(
            """
            INSERT INTO embedding (episode_id, fact_id, summary_id, dims, vector)
            VALUES (?, ?, ?, ?, ?)
            """,
            (episode_id, fact_id, summary_id, DIMS, payload),
        )

    def _fts_query(self, tokens: list[str]) -> str | None:
        if not tokens:
            return None
        return " OR ".join(f'"{token}"' for token in tokens)

    def _fts_keys(self, tokens: list[str]) -> list[str]:
        match = self._fts_query(tokens)
        if match is None:
            return []
        keys: list[str] = []
        episode_rows = self.conn.execute(
            """
            SELECT episode_fts.rowid AS id
            FROM episode_fts
            JOIN episode e ON e.episode_id = episode_fts.rowid
            WHERE episode_fts MATCH ? AND e.forgotten = 0
            ORDER BY bm25(episode_fts)
            LIMIT 10
            """,
            (match,),
        ).fetchall()
        keys.extend(f"episode:{row['id']}" for row in episode_rows)
        fact_rows = self.conn.execute(
            """
            SELECT fact_fts.rowid AS id
            FROM fact_fts
            JOIN fact f ON f.fact_id = fact_fts.rowid
            WHERE fact_fts MATCH ? AND f.status = 'active'
            ORDER BY bm25(fact_fts)
            LIMIT 10
            """,
            (match,),
        ).fetchall()
        keys.extend(f"fact:{row['id']}" for row in fact_rows)
        return keys

    def _keyword_keys(self, tokens: list[str]) -> list[str]:
        if not tokens:
            return []
        placeholders = ",".join("?" for _ in tokens)
        rows = self.conn.execute(
            f"""
            SELECT kind, id, hits FROM (
              SELECT 'episode' AS kind, k.episode_id AS id, COUNT(*) AS hits
              FROM keyword k
              JOIN episode e ON e.episode_id = k.episode_id
              WHERE k.term IN ({placeholders}) AND e.forgotten = 0
              GROUP BY k.episode_id
              UNION ALL
              SELECT 'fact', k.fact_id, COUNT(*)
              FROM keyword k
              JOIN fact f ON f.fact_id = k.fact_id
              WHERE k.term IN ({placeholders}) AND f.status = 'active'
              GROUP BY k.fact_id
            )
            ORDER BY hits DESC, kind, id
            LIMIT 10
            """,
            (*tokens, *tokens),
        ).fetchall()
        return [f"{row['kind']}:{row['id']}" for row in rows]

    def _vector_keys(self, query: str) -> list[str]:
        query_vector = embed(query)
        if not any(query_vector):
            return []
        rows = self.conn.execute(
            """
            SELECT emb.vector, emb.episode_id, emb.fact_id, emb.summary_id
            FROM embedding emb
            LEFT JOIN episode e ON e.episode_id = emb.episode_id
            LEFT JOIN fact f ON f.fact_id = emb.fact_id
            LEFT JOIN summary s ON s.summary_id = emb.summary_id
            WHERE (emb.episode_id IS NULL OR e.forgotten = 0)
              AND (emb.fact_id IS NULL OR f.status = 'active')
              AND (emb.summary_id IS NULL OR s.summary_id IS NOT NULL)
            """
        ).fetchall()
        scored: list[tuple[float, str]] = []
        for row in rows:
            vector = json.loads(row["vector"])
            score = cosine(query_vector, vector)
            if row["episode_id"] is not None:
                key = f"episode:{row['episode_id']}"
            elif row["fact_id"] is not None:
                key = f"fact:{row['fact_id']}"
            else:
                key = f"summary:{row['summary_id']}"
            scored.append((score, key))
        scored.sort(key=lambda item: (-item[0], item[1]))
        return [key for score, key in scored[:10] if score > 0]

    def _label(self, kind: str, row_id: int) -> str:
        if kind == "episode":
            row = self.conn.execute(
                "SELECT role, content FROM episode WHERE episode_id = ?", (row_id,)
            ).fetchone()
            return f"{row['role']}: {row['content']}"
        if kind == "fact":
            row = self.conn.execute(
                "SELECT statement FROM fact WHERE fact_id = ?", (row_id,)
            ).fetchone()
            return str(row["statement"])
        row = self.conn.execute(
            "SELECT body FROM summary WHERE summary_id = ?", (row_id,)
        ).fetchone()
        return str(row["body"])
