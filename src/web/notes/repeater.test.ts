import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepeater } from "./repeater.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const make = () => {
  const step = vi.fn();
  return { step, repeater: createRepeater(step, { delay: 420, interval: 70 }) };
};

describe("createRepeater", () => {
  it("steps once at once on a press and not again after a tap", () => {
    const { step, repeater } = make();
    repeater.press();
    expect(step).toHaveBeenCalledTimes(1);
    repeater.release();
    vi.advanceTimersByTime(2000);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("gives no second step before 420 ms of holding, then one every 70 ms", () => {
    const { step, repeater } = make();
    repeater.press();
    vi.advanceTimersByTime(419);
    expect(step).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(step).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(69);
    expect(step).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(step).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(140);
    expect(step).toHaveBeenCalledTimes(5);
  });

  it("stops stepping on release, in the repeat and in the delay", () => {
    const { step, repeater } = make();
    repeater.press();
    vi.advanceTimersByTime(560);
    repeater.release();
    const after = step.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(step).toHaveBeenCalledTimes(after);
  });

  it("starts clean on a second press after a release", () => {
    const { step, repeater } = make();
    repeater.press();
    vi.advanceTimersByTime(300);
    repeater.release();
    repeater.press();
    expect(step).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(419);
    expect(step).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    expect(step).toHaveBeenCalledTimes(3);
  });
});
