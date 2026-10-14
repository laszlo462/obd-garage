import { AlertTriangle, Check, Minus, X } from "lucide-preact";
import { useState } from "preact/hooks";
import { compactDateTime } from "./format.ts";
import { Sheet } from "./Sheet.tsx";
import {
  type FileResult,
  type LineIcon,
  resultLine,
  type UploadResult,
  type VehicleChoice,
} from "./upload-batch.ts";

export function UploadProgressSheet(props: {
  index: number;
  total: number;
  name: string;
  onClose: () => void;
}) {
  return (
    <Sheet title="Uploading" actionLabel="Hide" onClose={props.onClose}>
      <div class="sheet-body">
        <p class="sheet-note">
          {props.index} of {props.total} · {props.name}
        </p>
        <div
          class="upload-bar"
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuenow={props.index}
          aria-valuemax={props.total}
        >
          <span style={{ width: `${(props.index / props.total) * 100}%` }} />
        </div>
      </div>
    </Sheet>
  );
}

export function WhichVehicleSheet(props: {
  logCount: number;
  vehicles: { id: number; label: string }[];
  defaultId: number | null;
  newIds: number[];
  currentId: number | null;
  onChoose: (choice: VehicleChoice) => void;
}) {
  const [picked, setPicked] = useState<VehicleChoice>(props.defaultId ?? "unassigned");
  const noun = props.logCount === 1 ? "Drive Log" : "Drive Logs";
  return (
    // Cancel is the safe answer: the logs stay in Unassigned, where they can be assigned later.
    <Sheet
      title={`${props.logCount} ${noun}: which Vehicle?`}
      actionLabel="Cancel"
      onClose={() => props.onChoose("unassigned")}
    >
      <div class="sheet-body">
        {props.vehicles.map((v) => (
          <label key={v.id} class="radio-row">
            <input
              type="radio"
              name="which-vehicle"
              checked={picked === v.id}
              onChange={() => setPicked(v.id)}
            />
            <span class="main">
              <span>{v.label}</span>
              {props.newIds.includes(v.id) && <span class="sub">New</span>}
              {!props.newIds.includes(v.id) && v.id === props.currentId && (
                <span class="sub">Current</span>
              )}
            </span>
          </label>
        ))}
        <label class="radio-row">
          <input
            type="radio"
            name="which-vehicle"
            checked={picked === "unassigned"}
            onChange={() => setPicked("unassigned")}
          />
          <span class="main">
            <span>Unassigned</span>
            <span class="sub">Not one of my vehicles, or not sure</span>
          </span>
        </label>
      </div>
      <button type="button" class="btn-primary" onClick={() => props.onChoose(picked)}>
        Upload Drive Logs
      </button>
    </Sheet>
  );
}

const ICONS = { check: Check, alert: AlertTriangle, cross: X, dash: Minus } satisfies Record<
  LineIcon,
  unknown
>;

const batchTitle = (results: FileResult[]) => {
  const added = results.filter(
    (r) => r.result.outcome === "added" || r.result.outcome === "warned",
  );
  if (added.length === results.length)
    return `${results.length} ${results.length === 1 ? "file" : "files"} added`;
  return `${added.length} added, ${results.length - added.length} not`;
};

export function BatchResultSheet(props: { results: FileResult[]; onClose: () => void }) {
  return (
    <Sheet title={batchTitle(props.results)} actionLabel="Done" onClose={props.onClose}>
      <ul class="sheet-body result-list">
        {props.results.map(({ name, result }, i) => {
          const line = resultLine(result);
          const Icon = ICONS[line.icon];
          return (
            <li key={i} class={`result-line tone-${line.tone}`} aria-label={name}>
              <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
              <span class="main">
                <span class="filename">{name}</span>
                <span class="word">{line.word}</span>
                {line.reason && <span class="sub">{line.reason}</span>}
              </span>
              {line.link && (
                <a href={line.link.href} onClick={props.onClose}>
                  {line.link.label}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

type Created = NonNullable<UploadResult["vehicleCreated"]>;

export function NewVehicleSheet(props: {
  vehicle: Created;
  /** The ticks to start from: a sheet that was set aside and comes back keeps them. */
  initialTicked?: number[];
  onAssign: (uploadIds: number[]) => void;
  onClose: () => void;
  /**
   * Runs with the current ticks when Change is tapped on a sheet that offers logs. With it, Change
   * leaves the sheet to the caller to set aside; without it, Change closes the sheet.
   */
  onChange?: (ticked: number[]) => void;
}) {
  const { vehicle } = props;
  const logs = vehicle.sameDayUnassigned;
  const [ticked, setTicked] = useState(
    () => new Set(props.initialTicked ?? logs.map((l) => l.uploadId)),
  );
  const tickedIds = () => logs.map((l) => l.uploadId).filter((id) => ticked.has(id));
  const toggle = (id: number) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <Sheet
      title="New vehicle added"
      actionLabel={logs.length > 0 ? "Not now" : "Done"}
      onClose={props.onClose}
    >
      <div class="sheet-body">
        <dl class="vehicle-facts">
          <dt>Vehicle</dt>
          <dd>{vehicle.label}</dd>
          <dt>VIN</dt>
          <dd class="mono">{vehicle.vin}</dd>
          <dt>Profile</dt>
          <dd>{vehicle.profile}</dd>
          <dt>Rule Packs</dt>
          <dd>{vehicle.packs.length > 0 ? vehicle.packs.join(", ") : "None"}</dd>
        </dl>
        <a
          class="menu-row link-row"
          href={`/vehicles/${vehicle.id}/settings`}
          onClick={() =>
            props.onChange && logs.length > 0 ? props.onChange(tickedIds()) : props.onClose()
          }
        >
          Change
        </a>
        {logs.length > 0 && (
          <>
            <p class="sheet-note">Unassigned Drive Logs from the same day:</p>
            {logs.map((l) => (
              <label key={l.uploadId} class="radio-row">
                <input
                  type="checkbox"
                  checked={ticked.has(l.uploadId)}
                  onChange={() => toggle(l.uploadId)}
                />
                <span class="main">
                  <span>{l.filename}</span>
                  <span class="sub">{compactDateTime(l.recordedAt)}</span>
                </span>
              </label>
            ))}
          </>
        )}
      </div>
      {logs.length > 0 && (
        <button
          type="button"
          class="btn-primary"
          disabled={ticked.size === 0}
          onClick={() => props.onAssign(tickedIds())}
        >
          Assign to this vehicle
        </button>
      )}
    </Sheet>
  );
}
