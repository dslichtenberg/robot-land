// audio.js
// All sounds are made with the Web Audio API. There are no sound files.
// Sound starts only after the first tap or key press, as browsers require.

const audio = { ac: null, hum: null, humGain: null, humLevel: -1, muted: false };

export function unlockAudio() {
  try {
    if (audio.ac) { if (audio.ac.state === 'suspended') audio.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = audio.ac = new AC();
    const osc = ac.createOscillator(), filter = ac.createBiquadFilter(), gain = ac.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 55;
    filter.type = 'lowpass'; filter.frequency.value = 300;
    gain.gain.value = 0;
    osc.connect(filter); filter.connect(gain); gain.connect(ac.destination);
    osc.start();
    audio.hum = osc; audio.humGain = gain;
  } catch (e) { audio.ac = null; }
}

// Engine hum. speed is 0 (stopped) to 1 (top speed).
export function engine(speed) {
  if (!audio.ac || !audio.humGain) return;
  const level = audio.muted ? 0 : Math.round(speed * 10) / 10;
  if (level === audio.humLevel) return;
  audio.humLevel = level;
  const now = audio.ac.currentTime;
  audio.humGain.gain.setTargetAtTime(level > 0 ? 0.02 + level * 0.04 : 0, now, 0.08);
  audio.hum.frequency.setTargetAtTime(55 + level * 45, now, 0.1);
}

function tone(freq, delay, dur, type, vol) {
  const ac = audio.ac, t0 = ac.currentTime + delay;
  const osc = ac.createOscillator(), gain = ac.createGain();
  osc.type = type; osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain); gain.connect(ac.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

export function sound(name) {
  if (!audio.ac || audio.muted) return;
  try {
    if (name === 'ding') { tone(880, 0, 0.2, 'sine', 0.25); tone(1320, 0.08, 0.25, 'sine', 0.2); }
    if (name === 'chime') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.4, 'triangle', 0.25));
    if (name === 'buzz') tone(140, 0, 0.3, 'square', 0.07);
    if (name === 'bonk') { tone(300, 0, 0.12, 'triangle', 0.25); tone(180, 0.1, 0.2, 'triangle', 0.25); }
    if (name === 'beep') { tone(660, 0, 0.08, 'square', 0.06); tone(990, 0.1, 0.1, 'square', 0.06); }
    if (name === 'tick') tone(1200, 0, 0.06, 'sine', 0.12);
    if (name === 'hop') tone(420, 0, 0.08, 'triangle', 0.12);
    if (name === 'clank') { tone(110, 0, 0.3, 'square', 0.1); tone(90, 0.15, 0.4, 'square', 0.1); }
  } catch (e) { /* sound is optional */ }
}

export function toggleMute() {
  audio.muted = !audio.muted;
  audio.humLevel = -1;
  engine(0);
  return audio.muted;
}
