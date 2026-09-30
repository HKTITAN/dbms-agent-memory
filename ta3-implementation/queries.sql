-- Example queries against a database built by demo.py.
-- Run after the demo: sqlite3 -header memory.db < queries.sql

.mode list
.separator " | "

.print
.print == tables ==
.tables

.print
.print == current beliefs ==
SELECT fact_id, subject, predicate, object, stance,
       printf('%.2f', confidence) AS confidence, valid_from
FROM current_belief
ORDER BY fact_id;

.print
.print == who owned Campus Navigator at 09:30, before the hand-off ==
SELECT subject, object, status, valid_from, valid_until
FROM belief_history
WHERE subject = 'Campus Navigator'
  AND predicate = 'owned_by'
  AND valid_from <= '2026-09-30T09:30:00'
  AND (valid_until IS NULL OR valid_until > '2026-09-30T09:30:00');

.print
.print == aliases (one row per alias, unique) ==
SELECT e.name AS entity, a.alias
FROM entity e
JOIN entity_alias a ON a.entity_id = e.entity_id
ORDER BY e.entity_id, a.alias;

.print
.print == provenance: each active fact and the episode that supports it ==
SELECT f.fact_id, f.statement, e.episode_id, substr(e.content, 1, 48) AS episode
FROM fact f
JOIN episode e ON e.episode_id = f.source_episode_id
WHERE f.status = 'active'
ORDER BY f.fact_id;

.print
.print == foreign keys on fact ==
PRAGMA foreign_key_list(fact);

.print
.print == integrity ==
PRAGMA integrity_check;
