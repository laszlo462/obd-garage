import type { ComponentChildren } from "preact";
import { createContext } from "preact";
import { useContext, useRef, useState } from "preact/hooks";
import { useAppState } from "./AppState.tsx";
import { useApi } from "./api.tsx";
import {
  BatchResultSheet,
  NewVehicleSheet,
  UploadProgressSheet,
  WhichVehicleSheet,
} from "./UploadSheets.tsx";
import {
  type FileResult,
  runBatch,
  type UploadResult,
  type VehicleChoice,
} from "./upload-batch.ts";
import { uploadVia } from "./upload-client.ts";

type Created = NonNullable<UploadResult["vehicleCreated"]>;

type Question = {
  logCount: number;
  defaultId: number | null;
  newIds: number[];
  answer: (choice: VehicleChoice) => void;
};

type UploadFlow = {
  pick: (files: File[]) => Promise<void>;
  /** True while a batch runs: Add reopens the progress sheet instead of opening the picker. */
  running: boolean;
  showProgress: () => void;
};

const FlowContext = createContext<UploadFlow | null>(null);

/** The upload flow behind both Add buttons: `pick` runs a batch. It renders the flow's sheets itself. */
export function useUploadFlow(): UploadFlow {
  const flow = useContext(FlowContext);
  if (!flow) throw new Error("useUploadFlow needs an UploadFlowProvider");
  return flow;
}

/**
 * Owns the upload flow's state at app level, so it survives navigation: a queued New vehicle sheet
 * is still there on the next screen.
 */
export function UploadFlowProvider(props: { children: ComponentChildren }) {
  const api = useApi();
  const state = useAppState();
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number; name: string } | null>(
    null,
  );
  /** Set by Hide, and kept for the rest of the batch so later progress cannot reopen the sheet. */
  const [progressHidden, setProgressHidden] = useState(false);
  /** Vehicles the batch created, one New vehicle sheet each, after the result. */
  const [created, setCreated] = useState<Created[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [running, setRunning] = useState(false);
  /** A ref as well as state: a second pick in the same tick must see the batch. */
  const runningRef = useRef(false);

  async function pick(files: File[]) {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      await runPick(files);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  async function runPick(files: File[]) {
    // Picked before the first Vehicles load finished: load first, so the question knows them.
    if (!state.loaded.value) await state.refresh();
    if (!state.loaded.value) {
      state.toast("Couldn't load your vehicles.");
      return;
    }
    setProgressHidden(false);
    const out = await runBatch(files, {
      vehicleCount: state.vehicles.value.length,
      currentVehicleId: state.currentVehicle.value?.id ?? null,
      upload: uploadVia(api),
      askVehicle: async (defaultId, newIds, logCount) => {
        // A Vehicle this batch created must be in the list before the question offers it.
        if (newIds.length > 0) await state.refresh();
        return new Promise<VehicleChoice>((resolve) =>
          setQuestion({
            logCount,
            defaultId,
            newIds,
            answer: (choice) => {
              setQuestion(null);
              resolve(choice);
            },
          }),
        );
      },
      onProgress: (index, total, name) => setProgress({ index, total, name }),
    });
    setProgress(null);
    state.invalidate();
    await state.refresh();
    setResults(out.results);
    setCreated(out.newVehicles);
  }

  const sheets = (
    <>
      {question && (
        <WhichVehicleSheet
          logCount={question.logCount}
          vehicles={state.vehicles.value}
          defaultId={question.defaultId}
          newIds={question.newIds}
          currentId={state.currentVehicle.value?.id ?? null}
          onChoose={question.answer}
        />
      )}
      {progress && !progressHidden && !question && (
        <UploadProgressSheet {...progress} onClose={() => setProgressHidden(true)} />
      )}
      {results && <BatchResultSheet results={results} onClose={() => setResults(null)} />}
      {!results && created[0] && (
        <NewVehicleSheet
          key={created[0].id}
          vehicle={created[0]}
          onAssign={async (logIds) => {
            const vehicleId = created[0]?.id;
            setCreated((rest) => rest.slice(1));
            const assigned = await api.api["drive-logs"].assign
              .$post({ json: { logIds, vehicleId } })
              .then((res) => res.ok)
              .catch(() => false);
            if (!assigned) return state.toast("Couldn't assign the drive logs.");
            state.invalidate();
            await state.refresh();
          }}
          onClose={() => setCreated((rest) => rest.slice(1))}
        />
      )}
    </>
  );
  return (
    <FlowContext.Provider value={{ pick, running, showProgress: () => setProgressHidden(false) }}>
      {props.children}
      {sheets}
    </FlowContext.Provider>
  );
}
