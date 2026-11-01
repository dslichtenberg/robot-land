// input.js
// Reads the keyboard and the on-screen joystick (for iPads).
//
// move() gives { x, y } between -1 and 1: x is right, y is up the screen.
// onKey(fn) calls fn(key) once for each key press (not for held repeats).

const held = new Set();
const keyFns = [];
const stick = { x: 0, y: 0, active: false };

const DIR_KEYS = {
  ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
};

window.addEventListener('keydown', (e) => {
  const dir = DIR_KEYS[e.key];
  if (dir) { e.preventDefault(); held.add(dir); }
  if (!e.repeat) keyFns.forEach(fn => fn(e.key, dir));
});
window.addEventListener('keyup', (e) => { const dir = DIR_KEYS[e.key]; if (dir) held.delete(dir); });
window.addEventListener('blur', () => { held.clear(); stick.x = stick.y = 0; stick.active = false; });

export function onKey(fn) { keyFns.push(fn); }

export function move() {
  let x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  let y = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
  if (stick.active) { x = stick.x; y = stick.y; }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}

// Forget anything being held, so the car does not keep driving after a pop-up.
export function clearHeld() { held.clear(); stick.x = stick.y = 0; stick.active = false; resetKnob(); }

// ---------- Touch joystick ----------
// Put a finger anywhere on the pad and slide. The knob follows your finger.

let pad, knob, padId = null;
function resetKnob() { if (knob) knob.style.transform = 'translate(-50%, -50%)'; }

export function setupJoystick(padEl, knobEl) {
  pad = padEl; knob = knobEl;
  const update = (e) => {
    const r = pad.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    const dead = 0.15;
    stick.x = Math.abs(dx / max) < dead ? 0 : dx / max;
    stick.y = Math.abs(dy / max) < dead ? 0 : -dy / max;
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    padId = e.pointerId; stick.active = true;
    pad.setPointerCapture(e.pointerId);
    update(e);
  });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) update(e); });
  const end = (e) => {
    if (e.pointerId !== padId) return;
    padId = null; stick.active = false; stick.x = stick.y = 0; resetKnob();
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}
