-- Owner data: permanent, written only by the owner's actions. Nothing here may
-- reference a derived table (ADR 0003).

CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY,
  vin TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  pack_ids TEXT NOT NULL DEFAULT '[]' -- JSON array of enabled Rule Pack ids
);

CREATE TABLE uploads (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('report', 'drive-log')),
  stored_path TEXT NOT NULL UNIQUE, -- relative to the originals directory, never renamed
  uploaded_filename TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  uploaded_at TEXT NOT NULL,        -- real instant, ISO 8601 UTC
  recorded_at TEXT,                 -- naive local wall-clock time, ISO 8601 with no offset (ADR 0004)
  vehicle_id INTEGER REFERENCES vehicles (id) -- NULL is Unassigned
);

CREATE INDEX uploads_vehicle ON uploads (vehicle_id);

-- Only Reference Reports set or cleared by hand are stored. A row with a NULL
-- report_id means the owner cleared it; no row means the closest-in-time default.
CREATE TABLE reference_reports (
  drive_log_id INTEGER PRIMARY KEY REFERENCES uploads (id) ON DELETE CASCADE,
  report_id INTEGER REFERENCES uploads (id) ON DELETE CASCADE
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  upload_id INTEGER NOT NULL REFERENCES uploads (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  pinned_time_sec REAL, -- the Original's raw `Time (sec)`; NULL is a whole-upload Note
  created_at TEXT NOT NULL
);

CREATE INDEX notes_upload ON notes (upload_id);

-- Derived data: dropped and rebuilt from the Originals plus the owner data.
-- Derived rows may point at owner rows, never the other way round.

CREATE TABLE derived_uploads (
  upload_id INTEGER PRIMARY KEY REFERENCES uploads (id) ON DELETE CASCADE,
  app_version TEXT NOT NULL,
  derived_at TEXT NOT NULL,
  failed_error TEXT,              -- set when this is a Failed Upload
  metadata TEXT,                  -- JSON
  channels BLOB,                  -- column-oriented Channels blob
  parsed_report TEXT,             -- ParsedReport JSON
  rule_outcomes TEXT NOT NULL DEFAULT '[]',   -- JSON
  decode_notices TEXT NOT NULL DEFAULT '[]',  -- JSON
  warnings TEXT NOT NULL DEFAULT '[]',        -- JSON
  warning_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  upload_id INTEGER NOT NULL REFERENCES uploads (id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  start_sec REAL,
  end_sec REAL,
  data TEXT NOT NULL DEFAULT '{}' -- JSON
);

CREATE INDEX events_upload ON events (upload_id);
