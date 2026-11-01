// game.js
// The main game: screens, driving, the phone, villains, haunted houses,
// the ending, saving and sound.
//
// Everything the game knows lives in one plain object called `state`.
// Type `state` in the browser console to look at it.
// The game runs a loop about 60 times a second: update(dt) moves things,
// then draw() paints the canvas. dt is the seconds since the last frame.

const SAVE_KEY = 'robotLandToGeckoLand.save';

const state = {
  screen: 'title',   // 'title', 'select', 'world', 'house' or 'ending'
  overlay: null,     // null, 'phone' or 'dialog' (the world pauses)
  time: 0,
  charId: null,
  stats: null,       // numbers for this character (see characters.js)
  housesDone: 0,
  hearts: 3,
  car: { x: 0, y: 0, fromX: 0, fromY: 0, prog: 1, dir: 'down', fast: false },
  frozen: 0,         // seconds left frozen by a snowball
  safe: 0,           // seconds left blinking and safe after a bump
  bumpWait: 0,       // seconds before another "locked gate" message
  camera: { x: 0, y: 0 },
  villains: [], shots: [], puffs: [],
  gateOpenedAt: {},  // gate letter -> time it opened (for the animation)
  cutscene: null,    // the camera trip to show a gate opening
  exitWalk: null,    // the friend walking from the car to a house door
  house: null,       // the haunted house scene
  ending: null,
  fade: 0,           // 0 is clear, 1 is a black screen
  muted: false,
  selectIndex: 0,    // which card is picked on the character screen
  selectReadyAt: 0,
};
window.state = state;

const $ = (id) => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
let puzzleControl = null;

// ---------- Screen size ----------

function resize() {
  const w = Math.min(window.innerWidth, window.innerHeight * 4 / 3), h = w * 3 / 4;
  const stage = $('stage');
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  stage.style.setProperty('--u', (w / VIEW_W).toFixed(3));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
}
window.addEventListener('resize', resize);

// ---------- Sound (made with the Web Audio API, no sound files) ----------

const audio = { ac: null, hum: null, humGain: null, humOn: false };
function unlockAudio() {
  try {
    if (audio.ac) { if (audio.ac.state === 'suspended') audio.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = audio.ac = new AC();
    const osc = ac.createOscillator(), filter = ac.createBiquadFilter(), gain = ac.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = 55;
    filter.type = 'lowpass'; filter.frequency.value = 280;
    gain.gain.value = 0;
    osc.connect(filter); filter.connect(gain); gain.connect(ac.destination);
    osc.start();
    audio.hum = osc; audio.humGain = gain;
  } catch (e) { audio.ac = null; }
}
function setHum(on) {
  if (!audio.ac || !audio.humGain || audio.humOn === on) return;
  audio.humOn = on;
  const now = audio.ac.currentTime;
  audio.humGain.gain.setTargetAtTime(on && !state.muted ? 0.05 : 0, now, 0.06);
  audio.hum.frequency.setTargetAtTime(on ? 75 : 55, now, 0.1);
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
function sound(name) {
  if (!audio.ac || state.muted) return;
  try {
    if (name === 'ding') { tone(880, 0, 0.2, 'sine', 0.25); tone(1320, 0.08, 0.25, 'sine', 0.2); }
    if (name === 'chime') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.4, 'triangle', 0.25));
    if (name === 'buzz') tone(140, 0, 0.3, 'square', 0.07);
    if (name === 'bonk') { tone(300, 0, 0.12, 'triangle', 0.25); tone(180, 0.1, 0.2, 'triangle', 0.25); }
    if (name === 'beep') { tone(660, 0, 0.08, 'square', 0.06); tone(990, 0.1, 0.1, 'square', 0.06); }
  } catch (e) { /* sound is optional */ }
}
function toggleMute() {
  state.muted = !state.muted;
  $('btn-mute').textContent = state.muted ? '🔇' : '🔊';
  audio.humOn = null;
  setHum(false);
}

// ---------- Saving ----------

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      charId: state.charId, housesDone: state.housesDone, carX: state.car.x, carY: state.car.y }));
  } catch (e) { /* saving is optional */ }
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && CHARACTERS.some(c => c.id === s.charId) && s.housesDone >= 0 && s.housesDone <= 6) return s;
  } catch (e) { /* no save */ }
  return null;
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* fine */ } }

// ---------- Showing and hiding screens ----------

function show(id, on) { $(id).classList.toggle('hidden', !on); }
function isTouch() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; }

function setScreen(name) {
  state.screen = name;
  show('title-screen', name === 'title');
  show('select-screen', name === 'select');
  show('hud', name === 'world');
  show('dpad', name === 'world' && isTouch());
  show('ending-ui', false);
  show('puzzle', false); show('speech', false); show('banner', false);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

let toastTimer = null;
function toast(text, seconds) {
  $('toast').textContent = text;
  show('toast', true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => show('toast', false), (seconds || 3) * 1000);
}

function updateHearts() {
  $('hearts').textContent = '❤️'.repeat(Math.max(0, state.hearts)) + '🤍'.repeat(Math.max(0, state.stats.hearts - state.hearts));
}

function showTitle() {
  setScreen('title');
  const save = loadSave();
  show('title-hint', !save);
  show('title-buttons', !!save);
  if (save) {
    $('btn-continue').textContent = '▶ Continue as ' + getCharacter(save.charId).name;
    $('btn-continue').focus();
  }
}

function showSelect() {
  setScreen('select');
  state.selectReadyAt = state.time + 0.4;
  const cards = $('cards');
  if (!cards.children.length) {
    CHARACTERS.forEach((ch, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.innerHTML = '<canvas width="128" height="128"></canvas><div class="name"></div><div class="persona"></div><div class="perk"></div>';
      b.querySelector('.name').textContent = ch.name;
      b.querySelector('.persona').textContent = ch.species + '. ' + ch.persona;
      b.querySelector('.perk').textContent = '⭐ ' + ch.perkText;
      b.onclick = () => { if (state.time >= state.selectReadyAt) startGame(ch.id, null); };
      b.onfocus = () => { state.selectIndex = i; };
      b.onmouseenter = () => { state.selectIndex = i; };
      cards.append(b);
    });
  }
  cards.children[state.selectIndex].focus();
}

// ---------- Starting a game ----------

function respawnPoint() { return state.housesDone > 0 ? HOUSES[state.housesDone - 1].front : START; }

function placeCar(x, y) {
  Object.assign(state.car, { x, y, fromX: x, fromY: y, prog: 1, dir: 'down', fast: false });
  state.camera.x = clampCam(x * TILE + TILE / 2 - VIEW_W / 2, MAP_W * TILE - VIEW_W);
  state.camera.y = clampCam(y * TILE + TILE / 2 - VIEW_H / 2, MAP_H * TILE - VIEW_H);
}

function startGame(charId, save) {
  state.charId = charId;
  state.stats = statsFor(charId);
  state.housesDone = save ? save.housesDone : 0;
  state.hearts = state.stats.hearts;
  state.frozen = state.safe = 0;
  state.shots = []; state.puffs = []; state.gateOpenedAt = {};
  state.cutscene = state.exitWalk = state.house = state.ending = null;
  state.villains = makeVillains(state.housesDone);
  const pos = save && canDrive(save.carX, save.carY, state.housesDone) ? [save.carX, save.carY] : respawnPoint();
  placeCar(pos[0], pos[1]);
  if (!save) clearSave();
  setScreen('world');
  updateHearts();
  state.fade = 1;
  const ch = getCharacter(charId);
  setTimeout(() => toast(state.housesDone < 6
    ? ch.name + ': "Let\'s find haunted house ' + (state.housesDone + 1) + '!" 📱 Call a robot if you get lost.'
    : 'Drive home to Gecko Land! 🦎', 4.5), 400);
}

// ---------- Keyboard and touch ----------

const input = { keys: [], touchDir: null, waitRelease: false };
const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };

function heldDir() {
  if (input.waitRelease) return null;
  return input.touchDir || input.keys[input.keys.length - 1] || null;
}
function releaseCheck() { if (!input.keys.length && !input.touchDir) input.waitRelease = false; }

window.addEventListener('keydown', (e) => {
  unlockAudio();
  const dir = KEY_DIRS[e.key];
  if (dir) e.preventDefault();
  if (dir && !input.keys.includes(dir)) input.keys.push(dir);
  if (e.repeat) return;
  onKey(e.key, dir);
});
window.addEventListener('keyup', (e) => {
  const dir = KEY_DIRS[e.key];
  if (dir) input.keys = input.keys.filter(k => k !== dir);
  releaseCheck();
});
window.addEventListener('blur', () => { input.keys = []; input.touchDir = null; releaseCheck(); });
window.addEventListener('pointerdown', unlockAudio);

function onKey(key, dir) {
  const s = state.screen;
  if (key === 'm' || key === 'M') { toggleMute(); return; }
  if (s === 'title') { if (!loadSave()) showSelect(); return; }
  if (s === 'select' && dir) {
    const cols = 3, n = CHARACTERS.length;
    let i = state.selectIndex;
    if (dir === 'left') i = (i + n - 1) % n;
    if (dir === 'right') i = (i + 1) % n;
    if (dir === 'up' || dir === 'down') i = (i + cols) % n;
    state.selectIndex = i;
    $('cards').children[i].focus();
    return;
  }
  if (s === 'world') {
    if (key === 'p' || key === 'P') { if (state.overlay === 'phone') closeOverlay(); else openPhone(); }
    if (key === 'Escape' && state.overlay) closeOverlay();
    return;
  }
  if (s === 'house' && state.house) {
    const h = state.house;
    if (h.phase === 'taunt' && (key === 'Enter' || key === ' ')) startHousePuzzle();
    else if (h.phase === 'puzzle' && puzzleControl) puzzleControl.key(key);
  }
}

// The on-screen arrows for touch screens. Hold one to keep driving.
document.querySelectorAll('#dpad button').forEach(b => {
  const down = (e) => { e.preventDefault(); unlockAudio(); input.touchDir = b.dataset.dir; b.classList.add('held'); };
  const up = (e) => {
    e.preventDefault(); b.classList.remove('held');
    if (input.touchDir === b.dataset.dir) input.touchDir = null;
    releaseCheck();
  };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
});

// ---------- Phone and robot talk ----------

function openPhone() {
  if (state.screen !== 'world' || state.overlay || state.cutscene || state.exitWalk) return;
  state.overlay = 'phone';
  show('toast', false);
  const done = state.housesDone;
  $('phone-status').textContent = done < 6 ? '🏚️ House ' + (done + 1) + ' of 6' : '🎉 All 6 houses beaten! Go home!';
  $('phone-items').textContent = done === 0 ? 'Items: none yet'
    : 'Items: ' + HOUSES.slice(0, done).map(h => h.icon + ' ' + h.item).join(', ');
  show('phone-answer', false);
  show('phone', true);
  $('btn-call').focus();
}
function callRobot() {
  sound('beep');
  $('phone-hint').textContent = makeHint(state.car.x, state.car.y, state.housesDone, state.stats.detailedHints);
  show('phone-answer', true);
  $('btn-close').focus();
}
function openDialog(text) {
  state.overlay = 'dialog';
  show('toast', false);
  $('dialog-text').textContent = text;
  show('dialog', true);
  $('dialog-ok').focus();
}
function closeOverlay() {
  state.overlay = null;
  show('phone', false); show('dialog', false);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  // Do not drive again until the arrow is let go, so we do not bump right back in.
  input.waitRelease = input.keys.length > 0 || !!input.touchDir;
}

// ---------- Driving ----------

function clampCam(v, max) { return Math.max(0, Math.min(max, v)); }
function carPos() {
  const c = state.car;
  return [c.fromX + (c.x - c.fromX) * c.prog, c.fromY + (c.y - c.fromY) * c.prog];
}

function bumpMessage(text) {
  if (state.bumpWait > 0) return;
  toast(text);
  state.bumpWait = 2.5;
}

function tryMove(dir, leftover) {
  const car = state.car, [dx, dy] = DIRS[dir];
  const nx = car.x + dx, ny = car.y + dy, c = tileAt(nx, ny);
  car.dir = dir;
  if (c === 'r') { sound('beep'); openDialog(makeHint(car.x, car.y, state.housesDone, state.stats.detailedHints)); return; }
  if (c >= '1' && c <= '6') { knockOnDoor(Number(c)); return; }
  if (c === 'G') {
    if (gateOpen('G', state.housesDone)) startEnding();
    else bumpMessage('🦎 The Gecko Land gate! Beat all 6 haunted houses to open it.');
    return;
  }
  if (c in GATE_NEEDS && !gateOpen(c, state.housesDone)) { bumpMessage('🔒 Beat haunted house ' + GATE_NEEDS[c] + ' to open this gate!'); return; }
  if (!canDrive(nx, ny, state.housesDone)) return;
  Object.assign(car, { fromX: car.x, fromY: car.y, x: nx, y: ny, prog: leftover || 0 });
}

function updateCar(dt) {
  const car = state.car;
  let leftover = 0;
  if (car.prog < 1) {
    car.prog += dt / (car.fast ? 0.18 : state.stats.stepTime);
    if (car.prog >= 1) { leftover = car.fast ? 0 : car.prog - 1; car.prog = 1; car.fast = false; }
  }
  if (car.prog >= 1 && state.frozen <= 0) {
    const d = heldDir();
    if (d) tryMove(d, Math.min(0.5, leftover));
  }
  setHum(car.prog < 1 && !car.fast);
}

function updateCamera(dt) {
  let [tx, ty] = carPos();
  if (state.cutscene && state.cutscene.t < 2.8) [tx, ty] = state.cutscene.gate.pos;
  const goalX = clampCam(tx * TILE + TILE / 2 - VIEW_W / 2, MAP_W * TILE - VIEW_W);
  const goalY = clampCam(ty * TILE + TILE / 2 - VIEW_H / 2, MAP_H * TILE - VIEW_H);
  const k = Math.min(1, dt * (state.cutscene ? 3 : 10));
  state.camera.x += (goalX - state.camera.x) * k;
  state.camera.y += (goalY - state.camera.y) * k;
}

// ---------- Villains on the road ----------

// The helper object the villain code in map.js uses to talk to the game.
function villainHelper() {
  const [carX, carY] = carPos();
  return { carX, carY, housesDone: state.housesDone, shotSpeed: state.stats.shotSpeed, shots: state.shots,
    puff: addPuff, hurt, isSafe: () => state.safe > 0 };
}

function addPuff(x, y, color, count) {
  for (let i = 0; i < (count || 8); i++) {
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
    state.puffs.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, color });
  }
}

// A villain or a shot touched the car. It only costs a heart, never the game.
function hurt(kind, fromX, fromY) {
  if (state.safe > 0) return;
  state.hearts--;
  state.safe = state.stats.safeTime;
  sound('bonk');
  updateHearts();
  const [cx, cy] = carPos();
  addPuff(cx, cy, '#ffd23f', 10);
  if (state.hearts <= 0) { respawn(); return; }
  if (kind === 'freeze') state.frozen = state.stats.freezeTime;
  if (kind === 'bounce') bounceCar(fromX, fromY);
}

// Push the car up to two tiles away from whatever hit it.
function bounceCar(fromX, fromY) {
  const car = state.car, [cx, cy] = carPos();
  const tx = Math.round(cx), ty = Math.round(cy);
  let dx = Math.sign(Math.round(cx - fromX)), dy = Math.sign(Math.round(cy - fromY));
  if (Math.abs(cx - fromX) >= Math.abs(cy - fromY)) dy = 0; else dx = 0;
  if (!dx && !dy) [dx, dy] = DIRS[car.dir].map(n => -n);
  let ex = tx, ey = ty;
  for (let i = 0; i < 2 && canDrive(ex + dx, ey + dy, state.housesDone); i++) { ex += dx; ey += dy; }
  Object.assign(car, { fromX: cx, fromY: cy, x: ex, y: ey, prog: 0, fast: true });
}

function respawn() {
  const [x, y] = respawnPoint();
  placeCar(x, y);
  state.hearts = state.stats.hearts;
  state.frozen = 0; state.safe = 2; state.shots = [];
  state.fade = 1;
  updateHearts();
  toast('Whoops! Back to safety. Hearts are full again! ❤️');
}

function updateWorld(dt) {
  if (state.overlay) { setHum(false); return; }
  state.bumpWait = Math.max(0, state.bumpWait - dt);
  if (state.cutscene) { updateCutscene(dt); updateCamera(dt); return; }
  if (state.exitWalk) { updateExitWalk(dt); return; }
  state.frozen = Math.max(0, state.frozen - dt);
  state.safe = Math.max(0, state.safe - dt);
  updateCar(dt);
  const w = villainHelper();
  state.villains.forEach(v => updateVillain(v, dt, w));
  state.shots = updateShots(dt, w);
  updateCamera(dt);
}

// ---------- Going into a haunted house ----------

function knockOnDoor(n) {
  if (n <= state.housesDone) { bumpMessage('✅ You already beat haunted house ' + n + '!'); return; }
  if (n !== state.housesDone + 1) { bumpMessage('Beat haunted house ' + (state.housesDone + 1) + ' first!'); return; }
  setHum(false);
  show('dpad', false); show('hud', false);
  state.exitWalk = { n, t: 0 };
}

// The friend hops out of the car and walks up to the door, then the screen fades.
function updateExitWalk(dt) {
  const w = state.exitWalk;
  w.t += dt;
  if (w.t > 0.9) state.fade = Math.min(1, (w.t - 0.9) / 0.4);
  if (w.t >= 1.4) { state.exitWalk = null; enterHouse(w.n); }
}

function enterHouse(n) {
  const h = HOUSES[n - 1];
  setScreen('house');
  state.house = { n, villain: h.villain, phase: 'enter', t: 0, charX: 40, hurt: 0, total: 5, done: 0, spin: 0 };
  state.fade = 1;
}

function sayInHouse(text) { $('speech').textContent = text; show('speech', !!text); }

function startHousePuzzle() {
  const h = state.house;
  if (h.phase !== 'taunt') return;
  h.phase = 'puzzle';
  sayInHouse('');
  show('puzzle', true);
  puzzleControl = startPuzzle(h.n, $('puzzle'), {
    sound,
    onRight: (done, total) => { h.done = done; h.total = total; h.hurt = 1; },
    onWrong: () => { sayInHouse('Hee hee! Try again!'); setTimeout(() => { if (h.phase === 'puzzle') sayInHouse(''); }, 1200); },
    onSolved: () => { h.phase = 'defeat'; h.t = 0; show('puzzle', false); sayInHouse('Nooo!'); puzzleControl = null; },
  });
  const pz = puzzleControl.puzzle;
  h.total = pz.rounds ? pz.rounds.length + (pz.kind === 'riddle' ? 1 : 0) : 3;
}

function updateHouse(dt) {
  const h = state.house;
  h.t += dt;
  h.hurt = Math.max(0, h.hurt - dt * 2);
  if (h.phase === 'enter') {
    state.fade = Math.max(0, 1 - h.t / 0.4);
    h.charX = Math.min(170, 40 + h.t * 140);
    if (h.t >= 1.1) { h.phase = 'taunt'; h.t = 0; sayInHouse(HOUSES[h.n - 1].taunt + '  ▶'); }
  } else if (h.phase === 'taunt') {
    if (h.t >= 4.5) startHousePuzzle();
  } else if (h.phase === 'defeat') {
    h.spin += dt * 14;
    if (h.t >= 1.6) { h.phase = 'walk'; h.t = 0; sayInHouse(''); }
  } else if (h.phase === 'walk') {
    h.charX = Math.min(520, 170 + h.t * 300);
    if (h.t >= 1.3) {
      h.phase = 'got'; h.t = 0; sound('chime');
      const item = HOUSES[h.n - 1];
      $('banner-text').textContent = 'You got the ' + item.item + '! ' + item.icon;
      show('banner', true);
      $('btn-banner').focus();
    }
  } else if (h.phase === 'leave') {
    state.fade = Math.min(1, h.t / 0.5);
    if (h.t >= 0.6) finishHouse(h.n);
  }
}

function leaveHouse() {
  if (!state.house || state.house.phase !== 'got') return;
  show('banner', false);
  state.house.phase = 'leave'; state.house.t = 0;
}

// Back outside: save, refill hearts, then show the next gate opening.
function finishHouse(n) {
  state.house = null;
  state.housesDone = n;
  state.hearts = state.stats.hearts;
  state.villains = state.villains.filter(v => v.house !== n);
  state.shots = [];
  const [x, y] = HOUSES[n - 1].front;
  placeCar(x, y);
  saveGame();
  setScreen('world');
  updateHearts();
  state.fade = 1;
  const gate = GATES.find(g => g.needs === n);
  state.gateOpenedAt[gate.letter] = state.time + 99;
  state.cutscene = { gate, t: 0, opened: false };
  input.waitRelease = input.keys.length > 0 || !!input.touchDir;
}

function updateCutscene(dt) {
  const c = state.cutscene;
  c.t += dt;
  if (c.t >= 1.4 && !c.opened) {
    c.opened = true;
    state.gateOpenedAt[c.gate.letter] = state.time;
    sound('chime');
    toast(c.gate.letter === 'G' ? 'The Gecko Land gate is open! Drive home! 🦎' : 'The gate is open! 🎉 On to house ' + (c.gate.needs + 1) + '!');
  }
  if (c.t >= 3.6) state.cutscene = null;
}

// ---------- Ending ----------

function startEnding() {
  clearSave();
  setHum(false);
  setScreen('ending');
  state.ending = { t: 0, confetti: [], shown: false };
  state.fade = 1;
  sound('chime');
}

function updateEnding(dt) {
  const e = state.ending;
  e.t += dt;
  if (e.confetti.length < 140) {
    e.confetti.push({ x: Math.random() * VIEW_W, y: -10, vy: 60 + Math.random() * 80, vx: -20 + Math.random() * 40,
      rot: Math.random() * 6, color: ['#ff5fa2', '#ffd23f', '#5ab8f5', '#9be22d', '#b583ff', '#ff8a1f'][Math.floor(Math.random() * 6)] });
  }
  e.confetti.forEach(p => { p.y += p.vy * dt; p.x += p.vx * dt; p.rot += dt * 4; if (p.y > VIEW_H + 10) { p.y = -10; p.x = Math.random() * VIEW_W; } });
  if (e.t > 2.4 && !e.shown) {
    e.shown = true;
    $('ending-text').textContent = 'Welcome home, ' + getCharacter(state.charId).name + '!';
    show('ending-ui', true);
    $('btn-again').focus();
  }
}

// ---------- Drawing ----------

function drawSelectBackground() {
  drawTitleScene(ctx, state.time);
  const cards = $('cards').children;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i].querySelector('canvas'), cx = c.getContext('2d');
    cx.clearRect(0, 0, 128, 128);
    const sel = i === state.selectIndex;
    cards[i].classList.toggle('selected', sel);
    drawCharacter(cx, CHARACTERS[i], 64, 70, 96, state.time + i, sel ? (CHARACTERS[i].look === 'chameleon' ? 'excited' : 'happy') : null);
  }
}

function draw() {
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
  const s = state.screen;
  if (s === 'title') drawTitleScene(ctx, state.time);
  else if (s === 'select') drawSelectBackground();
  else if (s === 'world') drawWorld(ctx, state);
  else if (s === 'house') drawHouseRoom(ctx, state.house, getCharacter(state.charId), state.time);
  else if (s === 'ending') drawEndingScene(ctx, state.ending, getCharacter(state.charId), state.time);
  if (state.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + state.fade + ')'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
}

// ---------- Main loop ----------

let lastTime = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - lastTime) / 1000));
  lastTime = now;
  state.time += dt;
  state.puffs = state.puffs.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0; });
  const fading = (state.screen === 'world' && !state.exitWalk) || state.screen === 'ending';
  if (fading) state.fade = Math.max(0, state.fade - dt * 2);
  if (state.screen === 'world') updateWorld(dt);
  else if (state.screen === 'house') updateHouse(dt);
  else if (state.screen === 'ending') updateEnding(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- Buttons ----------

$('title-screen').addEventListener('click', () => { if (state.screen === 'title' && !loadSave()) showSelect(); });
$('btn-continue').onclick = (e) => { e.stopPropagation(); const s = loadSave(); if (s) startGame(s.charId, s); };
$('btn-new').onclick = (e) => { e.stopPropagation(); clearSave(); showSelect(); };
$('btn-phone').onclick = () => openPhone();
$('btn-mute').onclick = () => toggleMute();
$('btn-call').onclick = () => callRobot();
$('btn-close').onclick = () => closeOverlay();
$('dialog-ok').onclick = () => closeOverlay();
$('btn-banner').onclick = () => leaveHouse();
$('btn-again').onclick = () => { state.selectIndex = 0; showSelect(); };
$('speech').addEventListener('click', () => startHousePuzzle());
canvas.addEventListener('click', () => { if (state.screen === 'house') startHousePuzzle(); });

resize();
showTitle();
requestAnimationFrame(frame);
