/**
 * Press-and-hold repeat for a stepper button. `press()` steps at once, then again after `delay` ms and every
 * `interval` ms after that; `release()` stops the repeat.
 */
export function createRepeater(step: () => void, timing: { delay: number; interval: number }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearTimeout(timer);
    clearInterval(ticker);
  };
  return {
    press() {
      stop();
      step();
      timer = setTimeout(() => {
        step();
        ticker = setInterval(step, timing.interval);
      }, timing.delay);
    },
    release: stop,
  };
}
