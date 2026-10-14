import { vi } from "vitest";

/**
 * happy-dom has no canvas, and uPlot draws on one. This gives every canvas a 2D context that accepts any call
 * and draws nothing, so uPlot itself runs for real (its DOM, scales and hooks) and only the pixels are skipped.
 */
export function stubCanvas() {
  const context = new Proxy(
    { measureText: () => ({ width: 10 }), canvas: null },
    {
      get: (target, key) => (key in target ? target[key as keyof typeof target] : () => {}),
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal(
    "Path2D",
    // A constructor function (not a class) so it can hand back the do-nothing path.
    function Path2D() {
      return new Proxy({}, { get: () => () => {} });
    },
  );
}
