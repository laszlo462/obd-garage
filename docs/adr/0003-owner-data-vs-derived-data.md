# SQLite keeps owner data apart from derived data

Every upload is kept as an untouched Original and re-parsed whenever parsers, Vehicle Profiles or rules change, but some state exists in no file: Vehicles and their Profile and Rule Pack choices, Drive Log assignments, Reference Reports set or cleared by hand, and Notes. So SQLite holds two kinds of data. **Owner data** is permanent and is only written by the owner's actions. **Derived data** (parsed metadata, Channels, Events) can be dropped at any time and rebuilt from the Originals plus the owner data. A re-parse never writes owner data, and no owner data may point at a derived row.

## Consequences

- A pinned Note is anchored by the Original's raw `Time (sec)` value, never by a collapsed row index or an Event id, and snaps to the nearest displayed row on view.
- Only Reference Reports set or cleared by hand are stored. The closest-in-time default is worked out during each derive.
- A test wipes the derived data, rebuilds it and compares, so a stray reference from owner data into derived data fails CI.
- Backup is all of `/data` (Originals plus SQLite). Originals alone cannot restore assignments or Notes.

Decided in the "Ingest and re-parse pipeline" ticket (#21).
