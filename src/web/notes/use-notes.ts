import { useEffect, useRef, useState } from "preact/hooks";
import { useAppState } from "../AppState.tsx";
import { useApi } from "../api.tsx";
import type { NoteView } from "../api-types.ts";

/**
 * The Notes of one upload, shared by both viewers. It loads the list on mount and whenever app state is
 * invalidated. A change (`add`, `edit`, `remove`) invalidates app state, which reloads this list and the Note
 * counts on the upload rows; each change answers whether the server took it, and a failure toasts.
 */
export function useNotes(uploadId: number) {
  const api = useApi();
  const state = useAppState();
  const revision = state.revision.value;
  const [notes, setNotes] = useState<NoteView[]>([]);
  const owner = useRef({});
  useEffect(() => () => state.reportLoad(owner.current, false), [state]);
  useEffect(() => {
    let stale = false;
    api.api.uploads[":id"].notes
      .$get({ param: { id: String(uploadId) } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Request failed.");
        const list = await res.json();
        if (stale) return;
        setNotes(list);
        state.reportLoad(owner.current, false);
      })
      .catch(() => {
        if (!stale) state.reportLoad(owner.current, true);
      });
    return () => {
      stale = true;
    };
  }, [uploadId, revision]);

  /** Runs one change, then invalidates app state. Answers `false` (after a toast) when it failed. */
  async function change(run: () => Promise<Response>, failure: string): Promise<boolean> {
    const ok = await run().then(
      (res) => res.ok,
      () => false,
    );
    if (!ok) state.toast(failure);
    else state.invalidate();
    return ok;
  }

  return {
    notes,
    /** `pinnedAt` is the raw `Time (sec)` of the cursor row, or `null` for a Note on the whole upload. */
    add: (text: string, pinnedAt: number | null) =>
      change(
        () =>
          api.api.uploads[":id"].notes.$post({
            param: { id: String(uploadId) },
            json: { text, pinnedAt },
          }),
        "Couldn't save the Note.",
      ),
    edit: (id: number, text: string) =>
      change(
        () => api.api.notes[":id"].$patch({ param: { id: String(id) }, json: { text } }),
        "Couldn't save the Note.",
      ),
    remove: (id: number) =>
      change(
        () => api.api.notes[":id"].$delete({ param: { id: String(id) } }),
        "Couldn't delete the Note.",
      ),
  };
}
