import { useState } from "preact/hooks";
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

/** The upload flow behind the Add button: `pick` runs a batch, `sheets` is what to render. */
export function useUploadFlow() {
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

  async function pick(files: File[]) {
    // Picked before the first Vehicles load finished: load first, so the question knows them.
    if (!state.loaded.value) await state.refresh();
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
            await api.api["drive-logs"].assign.$post({ json: { logIds, vehicleId } });
            state.invalidate();
            await state.refresh();
          }}
          onClose={() => setCreated((rest) => rest.slice(1))}
        />
      )}
    </>
  );
  return { pick, sheets };
}
