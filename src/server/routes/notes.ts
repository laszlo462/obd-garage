import { Hono } from "hono";
import type { Db, Note } from "../db.ts";

const parseId = (text: string) => (/^\d+$/.test(text) ? Number(text) : Number.NaN);

/** A Note as the API returns it. */
export type NoteView = Note & {
  /** For a pinned Note, the `Time (sec)` of the nearest displayed (collapsed) row; else `null`. */
  snappedTimeSec: number | null;
};

/** Time axis of a Drive Log's current derived data: displayed rows, and the span of the Original. */
type TimeAxis = { rows: number[]; first: number; last: number };

function timeAxis(db: Db, uploadId: number): TimeAxis | undefined {
  const derived = db.getDerived(uploadId);
  if (!derived?.channels || !derived.metadata) return undefined;
  const { t } = JSON.parse(new TextDecoder().decode(derived.channels)) as { t: number[] };
  const first = t[0];
  if (first === undefined) return undefined;
  const { duration } = derived.metadata as { duration: number };
  return { rows: t, first, last: first + duration };
}

/** The displayed row nearest `sec`; the earlier row wins a tie. Read from current data, so it follows collapse changes. */
export function snap(rows: readonly number[], sec: number): number | null {
  let best: number | null = null;
  for (const t of rows) if (best === null || Math.abs(t - sec) < Math.abs(best - sec)) best = t;
  return best;
}

const textOf = (body: { text?: unknown } | null) =>
  typeof body?.text === "string" && body.text.trim() !== "" ? body.text : undefined;

/** Notes: owner data, never touched by a re-derive (ADR 0003). */
export function notesRoute(deps: { db: Db; now?: () => Date }) {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  /** `axisOf` is called only for a pinned Note, so a request can share one decode across its Notes. */
  const view = (
    note: Note,
    axisOf: () => TimeAxis | undefined = () => timeAxis(db, note.uploadId),
  ): NoteView => {
    const axis = note.pinnedTimeSec === null ? undefined : axisOf();
    return {
      ...note,
      snappedTimeSec:
        note.pinnedTimeSec === null || !axis ? null : snap(axis.rows, note.pinnedTimeSec),
    };
  };

  return new Hono()
    .get("/uploads/:id/notes", (c) => {
      const upload = db.getUpload(parseId(c.req.param("id")));
      if (!upload) return c.json({ error: "Unknown upload." }, 404);
      let axis: { value: TimeAxis | undefined } | undefined;
      const axisOnce = () => {
        axis ??= { value: timeAxis(db, upload.id) };
        return axis.value;
      };
      return c.json(db.listNotes(upload.id).map((n) => view(n, axisOnce)));
    })
    .post("/uploads/:id/notes", async (c) => {
      const upload = db.getUpload(parseId(c.req.param("id")));
      if (!upload) return c.json({ error: "Unknown upload." }, 404);
      const body = (await c.req.json().catch(() => null)) as {
        text?: unknown;
        pinnedAt?: unknown;
      } | null;
      const text = textOf(body);
      if (text === undefined) return c.json({ error: "Expected { text: string } with text." }, 400);
      const pinnedAt = body?.pinnedAt ?? null;
      if (pinnedAt !== null && (typeof pinnedAt !== "number" || !Number.isFinite(pinnedAt)))
        return c.json({ error: "pinnedAt must be a number (the log's Time (sec))." }, 400);
      if (pinnedAt !== null) {
        if (upload.kind !== "drive-log")
          return c.json({ error: "Only a Drive Log Note can be pinned to a moment." }, 400);
        const axis = timeAxis(db, upload.id);
        if (!axis) return c.json({ error: "This Drive Log has no readable time range." }, 400);
        if ((pinnedAt as number) < axis.first || (pinnedAt as number) > axis.last)
          return c.json({ error: "pinnedAt is outside the Drive Log's time range." }, 400);
      }
      const note = db.addNote({
        uploadId: upload.id,
        text,
        pinnedTimeSec: pinnedAt as number | null,
        createdAt: now().toISOString(),
      });
      return c.json(view(note), 201);
    })
    .patch("/notes/:id", async (c) => {
      const note = db.getNote(parseId(c.req.param("id")));
      if (!note) return c.json({ error: "Unknown Note." }, 404);
      const text = textOf((await c.req.json().catch(() => null)) as { text?: unknown } | null);
      if (text === undefined) return c.json({ error: "Expected { text: string } with text." }, 400);
      db.setNoteText(note.id, text);
      return c.json(view({ ...note, text }));
    })
    .delete("/notes/:id", (c) => {
      const note = db.getNote(parseId(c.req.param("id")));
      if (!note) return c.json({ error: "Unknown Note." }, 404);
      db.deleteNote(note.id);
      return c.json({ deleted: note.id });
    });
}
