/** How a shape is drawn, so the kinds differ by pattern and not only by hue. */
export type OverlayPattern = "fill" | "dashed-line" | "hatch";

export function overlayPattern(shape: { kind: string; category: string }): OverlayPattern {
  if (shape.kind === "point") return "dashed-line";
  return shape.category === "pack" ? "hatch" : "fill";
}
