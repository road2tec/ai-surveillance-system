// Alert tone synthesised with Web Audio, so no audio asset is needed.
let ctx;

function context() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Call from a click handler so later alerts can play without a gesture. */
export function unlockAudio() {
  try {
    context();
  } catch {
    /* no Web Audio support */
  }
}

export function playAlert(level) {
  try {
    context();
    const high = level === 'High Danger';
    const pattern = high ? [880, 660, 880, 660] : [660, 520];
    pattern.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  } catch {
    /* audio blocked until the user interacts with the page */
  }
}
