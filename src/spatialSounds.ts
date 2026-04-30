/**
 * spatialSounds.ts — Web Audio API sound effects for XR scene interactions.
 * No external assets needed — all synthesized.
 */

function ctx() {
  try { return new AudioContext(); } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, delay = 0) {
  const c = ctx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain); gain.connect(c.destination);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, c.currentTime + delay);
  gain.gain.linearRampToValueAtTime(vol, c.currentTime + delay + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
  osc.start(c.currentTime + delay);
  osc.stop(c.currentTime + delay + dur);
}

export const spatialSounds = {
  /** Object placed into scene */
  place: () => {
    tone(440, 0.06, 'sine', 0.15);
    tone(660, 0.12, 'sine', 0.18, 0.06);
    tone(880, 0.18, 'sine', 0.14, 0.14);
  },

  /** Object selected / tapped */
  select: () => {
    tone(523, 0.08, 'sine', 0.14);
    tone(659, 0.12, 'sine', 0.12, 0.07);
  },

  /** Object deselected */
  deselect: () => {
    tone(440, 0.07, 'sine', 0.1);
  },

  /** Color changed */
  color: () => {
    tone(880, 0.05, 'sine', 0.1);
    tone(1047, 0.08, 'sine', 0.12, 0.05);
  },

  /** Object deleted */
  delete: () => {
    tone(330, 0.08, 'sawtooth', 0.12);
    tone(220, 0.18, 'sine', 0.1, 0.07);
  },

  /** Object duplicated */
  duplicate: () => {
    tone(523, 0.06, 'sine', 0.1);
    tone(523, 0.06, 'sine', 0.1, 0.08);
    tone(659, 0.12, 'sine', 0.14, 0.16);
  },

  /** Scale changed */
  scale: () => {
    tone(392, 0.05, 'triangle', 0.1);
    tone(523, 0.08, 'triangle', 0.12, 0.06);
  },

  /** AI tip appeared */
  tip: () => {
    tone(1047, 0.06, 'sine', 0.08);
    tone(1319, 0.1, 'sine', 0.1, 0.08);
    tone(1568, 0.14, 'sine', 0.08, 0.18);
  },

  /** Object moved (drag end) */
  move: () => {
    tone(392, 0.04, 'triangle', 0.08);
    tone(523, 0.08, 'triangle', 0.1, 0.04);
  },

  /** Session / participant joined */
  join: () => {
    tone(660, 0.1); setTimeout(() => tone(880, 0.15), 100);
  },
};
