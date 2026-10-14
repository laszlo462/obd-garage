import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./styles/tokens.css", import.meta.url), "utf8");

/** Custom properties declared in a block body. */
function declarations(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2]?.trim()]),
  );
}

/** A colour as [r, g, b, a], so `.10` and `0.1` compare equal. */
function colour(text: string | undefined): number[] {
  if (!text) return [];
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba\(([^)]+)\)$/.exec(text);
  return rgba?.[1] ? rgba[1].split(",").map(Number) : [];
}

const darkStart = css.indexOf("prefers-color-scheme: dark");
const light = declarations(css.slice(0, darkStart));
const dark = declarations(css.slice(darkStart));

describe("colour tokens", () => {
  it("light --bg is the DESIGN.md page canvas", () => {
    expect(colour(light["--bg"])).toEqual([0xf4, 0xf5, 0xf5, 1]);
  });

  it("dark --bg is the DESIGN.md page canvas", () => {
    expect(colour(dark["--bg"])).toEqual([0x11, 0x12, 0x17, 1]);
  });

  it("surface and text tokens match in both themes", () => {
    const expected: Record<string, [number[], number[]]> = {
      "--surface": [
        [255, 255, 255, 1],
        [0x18, 0x1b, 0x1f, 1],
      ],
      "--surface2": [
        [0xe6, 0xe8, 0xec, 1],
        [0x22, 0x25, 0x2b, 1],
      ],
      "--ink": [
        [0x24, 0x29, 0x2e, 1],
        [0xcc, 0xcc, 0xdc, 1],
      ],
      "--ink2": [
        [0x3d, 0x44, 0x4d, 1],
        [0xb4, 0xb4, 0xc6, 1],
      ],
      "--muted": [
        [36, 41, 46, 0.7],
        [204, 204, 220, 0.65],
      ],
      "--line": [
        [36, 41, 46, 0.14],
        [204, 204, 220, 0.14],
      ],
    };
    for (const [name, [l, d]] of Object.entries(expected)) {
      expect(colour(light[name]), `light ${name}`).toEqual(l);
      expect(colour(dark[name]), `dark ${name}`).toEqual(d);
    }
  });

  it("accent and status tokens match in both themes", () => {
    const expected: Record<string, [number[], number[]]> = {
      "--accent": [
        [0x2f, 0x63, 0xc8, 1],
        [0x6e, 0x9f, 0xff, 1],
      ],
      "--accent-ink": [
        [255, 255, 255, 1],
        [0x0b, 0x10, 0x20, 1],
      ],
      "--accent-t": [
        [56, 113, 220, 0.12],
        [61, 113, 217, 0.2],
      ],
      "--bad": [
        [0xc4, 0x13, 0x5b, 1],
        [0xff, 0x6b, 0x7d, 1],
      ],
      "--bad-t": [
        [224, 34, 110, 0.1],
        [242, 73, 92, 0.15],
      ],
      "--warn": [
        [0x8f, 0x56, 0x00, 1],
        [0xff, 0x98, 0x30, 1],
      ],
      "--warn-t": [
        [255, 153, 0, 0.15],
        [255, 152, 48, 0.15],
      ],
      "--ok": [
        [0x14, 0x70, 0x4f, 1],
        [0x73, 0xbf, 0x69, 1],
      ],
      "--ok-t": [
        [27, 133, 94, 0.12],
        [115, 191, 105, 0.14],
      ],
    };
    for (const [name, [l, d]] of Object.entries(expected)) {
      expect(colour(light[name]), `light ${name}`).toEqual(l);
      expect(colour(dark[name]), `dark ${name}`).toEqual(d);
    }
  });

  it("chart series and overlay tokens match in both themes", () => {
    const expected: Record<string, [number[], number[]]> = {
      "--c1": [
        [0x32, 0x74, 0xd9, 1],
        [0x57, 0x94, 0xf2, 1],
      ],
      "--c2": [
        [0xd6, 0x5f, 0x00, 1],
        [0xff, 0x98, 0x30, 1],
      ],
      "--c3": [
        [0x56, 0xa6, 0x4b, 1],
        [0x73, 0xbf, 0x69, 1],
      ],
      "--c4": [
        [0xa3, 0x52, 0xcc, 1],
        [0xb8, 0x77, 0xd9, 1],
      ],
      "--c5": [
        [0xa6, 0x84, 0x00, 1],
        [0xfa, 0xde, 0x2a, 1],
      ],
      "--c6": [
        [0xe0, 0x2f, 0x44, 1],
        [0xf2, 0x49, 0x5c, 1],
      ],
      "--ev-generic": [
        [56, 113, 220, 0.08],
        [87, 148, 242, 0.1],
      ],
      "--ev-pack": [
        [0xb8, 0x6e, 0x00, 1],
        [0xff, 0x98, 0x30, 1],
      ],
      "--ev-look": [
        [0xa3, 0x52, 0xcc, 1],
        [0xb8, 0x77, 0xd9, 1],
      ],
      "--note": [
        [0xa6, 0x84, 0x00, 1],
        [0xfa, 0xde, 0x2a, 1],
      ],
    };
    for (const [name, [l, d]] of Object.entries(expected)) {
      expect(colour(light[name]), `light ${name}`).toEqual(l);
      expect(colour(dark[name]), `dark ${name}`).toEqual(d);
    }
  });

  it("type, space and radius tokens are defined once, outside the dark block", () => {
    expect(light).toMatchObject({
      "--font-text": "Inter, system-ui, sans-serif",
      "--font-mono": '"Roboto Mono", ui-monospace, monospace',
      "--fs-11": "11px",
      "--fs-12": "12px",
      "--fs-13": "13px",
      "--fs-15": "15px",
      "--fs-17": "17px",
      "--fs-22": "22px",
      "--gutter": "12px",
      "--radius-panel": "6px",
      "--radius-control": "4px",
      "--touch": "44px",
    });
  });
});

describe("native controls", () => {
  it("declares color-scheme light dark on :root, so radios, selects and scrollbars follow the theme", () => {
    const base = css.slice(0, darkStart);
    expect(base).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark\s*;/);
  });
});
