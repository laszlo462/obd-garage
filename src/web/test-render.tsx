import { fireEvent, render, screen } from "@testing-library/preact";
import type { ComponentChildren } from "preact";
import { App } from "./App.tsx";
import { AppStateProvider } from "./AppState.tsx";
import { ApiProvider } from "./api.tsx";
import { type StubData, stubApi } from "./test-support.ts";
import { UploadFlowProvider } from "./use-upload-flow.tsx";

export const memoryStorage = (seed: Record<string, string> = {}): Storage => {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  } as Storage;
};

/** Render inside the providers, with a stubbed API client and in-memory storage. */
export function renderWithApp(
  ui: ComponentChildren,
  data: StubData = {},
  storage = memoryStorage(),
) {
  return render(
    <ApiProvider value={stubApi(data)}>
      <AppStateProvider storage={storage}>
        <UploadFlowProvider>{ui}</UploadFlowProvider>
      </AppStateProvider>
    </ApiProvider>,
  );
}

/** Render the whole app (router included) with a stubbed API client and in-memory storage. */
export function renderApp(data: StubData = {}, storage = memoryStorage()) {
  return render(
    <ApiProvider value={stubApi(data)}>
      <App storage={storage} />
    </ApiProvider>,
  );
}

/** Picks files on the hidden input the way the Files picker does. */
export function pickFiles(...files: File[]) {
  const input = screen.getByLabelText("Choose files") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
  return input;
}
