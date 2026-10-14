// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it } from "vitest";
import { AppStateProvider, useAppState } from "./AppState.tsx";
import { ApiProvider } from "./api.tsx";
import { LoadBanner } from "./LoadBanner.tsx";
import { memoryStorage } from "./test-render.tsx";
import { stubApi } from "./test-support.ts";
import { useCatalogue } from "./use-catalogue.ts";

afterEach(cleanup);

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Shows the loaded Profile names and a button that bumps the revision the way Retry does. */
function Host() {
  const state = useAppState();
  const catalogue = useCatalogue();
  return (
    <>
      <LoadBanner />
      <p data-testid="profiles">{catalogue?.profiles.map((p) => p.name).join(",") ?? "none"}</p>
      <button type="button" onClick={() => state.invalidate()}>
        Reload
      </button>
    </>
  );
}

/** The first `profiles` call waits for the returned promise; later calls answer from the stub. */
function renderWithSlowFirstLoad() {
  const api = stubApi({
    profiles: [{ id: "second", name: "Second" }],
    rulePacks: [],
  });
  const answer = api.api.profiles.$get;
  const first = deferred<Response>();
  let calls = 0;
  api.api.profiles.$get = ((...args: Parameters<typeof answer>) =>
    ++calls === 1 ? first.promise : answer(...args)) as typeof answer;
  render(
    <ApiProvider value={api}>
      <AppStateProvider storage={memoryStorage()}>
        <Host />
      </AppStateProvider>
    </ApiProvider>,
  );
  return first;
}

describe("useCatalogue: a load that finishes late", () => {
  it("does not overwrite the catalogue of the newer load", async () => {
    const first = renderWithSlowFirstLoad();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.getByTestId("profiles").textContent).toBe("Second"));
    first.resolve(Response.json([{ id: "first", name: "First" }]));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("profiles").textContent).toBe("Second");
  });

  it("does not bring the load banner back when it fails", async () => {
    const first = renderWithSlowFirstLoad();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.getByTestId("profiles").textContent).toBe("Second"));
    first.reject(new TypeError("Failed to fetch"));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
