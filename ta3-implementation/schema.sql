-- Relational memory store for an AI agent.
--
-- This is the schema Phase 2 recommended: episodic rows, semantic triples
-- with a validity interval, a normalised entity registry, provenance back to
-- the episode that supported a claim, and indexes for keyword search.
-- Constraints below are the ones a document store cannot declare.

PRAGMA foreign_keys = ON;

CREATE TABLE agent (
  agent_id   INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE session (
  session_id INTEGER PRIMARY KEY,
  agent_id   INTEGER NOT NULL REFERENCES agent(agent_id),
  title      TEXT NOT NULL,
  started_at TEXT NOT NULL
);

-- Episodic memory: one row per turn the agent wrote down.
-- forgotten = 1 keeps the row (provenance) but drops it from retrieval.
CREATE TABLE episode (
  episode_id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES session(session_id),
  turn_index INTEGER NOT NULL CHECK (turn_index >= 0),
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5
             CHECK (importance >= 0 AND importance <= 1),
  forgotten  INTEGER NOT NULL DEFAULT 0 CHECK (forgotten IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (session_id, turn_index)
);

-- Canonical names. name_key is the case-folded form, so "AI Lab" and
-- "ai lab" cannot become two entities.
CREATE TABLE entity (
  entity_id   INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  name_key    TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL
              CHECK (kind IN ('person', 'team', 'system', 'project', 'concept')),
  description TEXT,
  created_at  TEXT NOT NULL
);

-- 1NF: an alias is a row, not a comma-joined string.
-- PRIMARY KEY (alias_key) is the uniqueness Lore deliberately does not have.
CREATE TABLE entity_alias (
  alias_key TEXT PRIMARY KEY,
  alias     TEXT NOT NULL,
  entity_id INTEGER NOT NULL REFERENCES entity(entity_id)
);

-- Semantic memory. A fact is a triple plus when it was believed.
-- status = 'active' rows are the current belief. Superseding or forgetting
-- closes valid_until instead of deleting the row, so as-of queries still work.
CREATE TABLE fact (
  fact_id            INTEGER PRIMARY KEY,
  subject_entity_id  INTEGER NOT NULL REFERENCES entity(entity_id),
  predicate          TEXT NOT NULL
                     CHECK (predicate IN (
                       'is_a', 'uses', 'owned_by', 'created_by', 'depends_on'
                     )),
  object_text        TEXT,
  object_entity_id   INTEGER REFERENCES entity(entity_id),
  confidence         REAL NOT NULL CHECK (confidence > 0 AND confidence <= 1),
  stance             TEXT NOT NULL
                     CHECK (stance IN ('certain', 'likely', 'speculative')),
  valid_from         TEXT NOT NULL,
  valid_until        TEXT,
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'superseded', 'forgotten')),
  source_episode_id  INTEGER REFERENCES episode(episode_id),
  superseded_by      INTEGER REFERENCES fact(fact_id),
  statement          TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  CHECK (object_text IS NOT NULL OR object_entity_id IS NOT NULL),
  CHECK (valid_until IS NULL OR valid_from <= valid_until),
  CHECK (
    (status = 'active' AND valid_until IS NULL)
    OR (status IN ('superseded', 'forgotten') AND valid_until IS NOT NULL)
  )
);

-- At most one *current* object for predicates that are functions of the
-- subject. This is the constraint a conflict scan otherwise has to rediscover.
CREATE UNIQUE INDEX ux_one_active_functional_fact
  ON fact (subject_entity_id, predicate)
  WHERE status = 'active'
    AND predicate IN ('owned_by', 'is_a', 'created_by');

CREATE INDEX ix_fact_source ON fact (source_episode_id);
CREATE INDEX ix_fact_validity ON fact (valid_from, valid_until);
CREATE INDEX ix_fact_object ON fact (object_entity_id);

-- Keywords are atomic rows (1NF), attached to exactly one parent.
CREATE TABLE keyword (
  keyword_id INTEGER PRIMARY KEY,
  term       TEXT NOT NULL,
  episode_id INTEGER REFERENCES episode(episode_id),
  fact_id    INTEGER REFERENCES fact(fact_id),
  CHECK ((episode_id IS NOT NULL) + (fact_id IS NOT NULL) = 1)
);

CREATE INDEX ix_keyword_term ON keyword (term);

-- A materialised summary of one session. Compression, in the database sense:
-- a stored query result, not a second copy of the episodes.
CREATE TABLE summary (
  summary_id       INTEGER PRIMARY KEY,
  session_id       INTEGER NOT NULL REFERENCES session(session_id),
  body             TEXT NOT NULL,
  episode_count    INTEGER NOT NULL CHECK (episode_count > 0),
  first_episode_id INTEGER NOT NULL REFERENCES episode(episode_id),
  last_episode_id  INTEGER NOT NULL REFERENCES episode(episode_id),
  created_at       TEXT NOT NULL
);

-- Feature-hash embedding. Exactly one parent, so the column can be a real
-- foreign key. vector is a JSON array of floats (inspectable in sqlite3).
CREATE TABLE embedding (
  embedding_id INTEGER PRIMARY KEY,
  episode_id   INTEGER REFERENCES episode(episode_id),
  fact_id      INTEGER REFERENCES fact(fact_id),
  summary_id   INTEGER REFERENCES summary(summary_id),
  dims         INTEGER NOT NULL CHECK (dims > 0),
  vector       TEXT NOT NULL,
  CHECK (
    (episode_id IS NOT NULL) + (fact_id IS NOT NULL) + (summary_id IS NOT NULL) = 1
  )
);

-- Full-text indexes over what an episode or a fact actually says.
-- External content: the text lives in the base table, not a second copy.
CREATE VIRTUAL TABLE episode_fts USING fts5(
  content,
  content = 'episode',
  content_rowid = 'episode_id',
  tokenize = 'porter unicode61'
);

CREATE VIRTUAL TABLE fact_fts USING fts5(
  statement,
  content = 'fact',
  content_rowid = 'fact_id',
  tokenize = 'porter unicode61'
);

CREATE TRIGGER episode_ai AFTER INSERT ON episode BEGIN
  INSERT INTO episode_fts (rowid, content) VALUES (new.episode_id, new.content);
END;

CREATE TRIGGER episode_ad AFTER DELETE ON episode BEGIN
  INSERT INTO episode_fts (episode_fts, rowid, content)
  VALUES ('delete', old.episode_id, old.content);
END;

CREATE TRIGGER episode_au AFTER UPDATE ON episode BEGIN
  INSERT INTO episode_fts (episode_fts, rowid, content)
  VALUES ('delete', old.episode_id, old.content);
  INSERT INTO episode_fts (rowid, content) VALUES (new.episode_id, new.content);
END;

CREATE TRIGGER fact_ai AFTER INSERT ON fact BEGIN
  INSERT INTO fact_fts (rowid, statement) VALUES (new.fact_id, new.statement);
END;

CREATE TRIGGER fact_ad AFTER DELETE ON fact BEGIN
  INSERT INTO fact_fts (fact_fts, rowid, statement)
  VALUES ('delete', old.fact_id, old.statement);
END;

CREATE TRIGGER fact_au AFTER UPDATE ON fact BEGIN
  INSERT INTO fact_fts (fact_fts, rowid, statement)
  VALUES ('delete', old.fact_id, old.statement);
  INSERT INTO fact_fts (rowid, statement) VALUES (new.fact_id, new.statement);
END;

-- Current beliefs, and the full history used by as-of queries.
CREATE VIEW belief_history AS
SELECT
  f.fact_id,
  s.name AS subject,
  f.predicate,
  COALESCE(o.name, f.object_text) AS object,
  f.confidence,
  f.stance,
  f.status,
  f.valid_from,
  f.valid_until,
  f.source_episode_id,
  f.superseded_by,
  f.statement
FROM fact f
JOIN entity s ON s.entity_id = f.subject_entity_id
LEFT JOIN entity o ON o.entity_id = f.object_entity_id;

CREATE VIEW current_belief AS
SELECT * FROM belief_history WHERE status = 'active';
