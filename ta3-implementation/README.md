# TA-3: Persistent memory store

A small relational memory store for an AI agent. It is the implementation half
of the DBMS term paper: episodic memories, semantic facts with validity
intervals, entities and aliases, keywords, and embeddings, in SQLite.

The store uses only the Python standard library. No database server and no API
key.

## Run the demo

```bash
cd ta3-implementation
python3 demo.py
```

`demo.py` deletes `memory.db` if it is already there, applies `schema.sql`,
walks through one design session (write, retrieve, update, forget,
consolidate), and prints checks. The last section is `queries.sql` executed by
the `sqlite3` shell. Exit status is 0 when every check passes.

Run the queries again on your own:

```bash
sqlite3 -header memory.db < queries.sql
sqlite3 memory.db ".schema"
```

## Layout

| File | Role |
|---|---|
| `schema.sql` | Tables, keys, checks, the partial unique index, FTS5, views |
| `memory_store.py` | Write, retrieve, supersede, forget, consolidate |
| `demo.py` | One scripted agent session and the checks |
| `queries.sql` | The SQL shown at the end of the demo |
| `members.json` | Names and roll numbers printed on the report cover |
| `diagrams/` | Graphviz sources for the architecture and ER figures |
| `screenshots/` | VS Code and terminal screenshots used in the report |
| `assets/sgt-logo.png` | University seal on the cover |
| `build_report.py` | Runs the demo, renders the diagrams, and prints the PDF |

## Group report

`members.json` is the only place names are written. The cover reads that list.
To add a student, append one object and rebuild:

```json
{"name": "Example Name", "roll": "241302000"}
```

```bash
python3 build_report.py
```

The PDF is written to `DBMS-TA3-Persistent-Memory.pdf`. Printing it needs
ReportLab (`pip install -r requirements.txt`). The code figures and the
terminal figures are screenshots already saved under `screenshots/`.
The script redraws the diagrams from `diagrams/` and does not redraw
the screenshots. Running the demo does not need ReportLab.
