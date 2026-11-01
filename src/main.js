// main.js
// The game itself: screens, driving the car, robots and the phone, going into
// the haunted house, saving, and the camera.
//
// Everything the game knows lives in one object called `state`.
// Type `state` in the browser console to look at it.

import * as THREE from 'three';
import { preloadModels, makeModel, makeCar } from './models.js';
import { WORLDS, gearCityHint } from './worlds.js';
import { buildWorld, resolve, inBox } from './world.js';
import { createLavaRoom } from './rooms/lava.js';
import { move, onKey, clearHeld, setupJoystick } from './input.js';
import { unlockAudio, sound, engine, toggleMute } from './audio.js';

const SAVE_KEY = 'robotLandToGeckoLand.v2';
const CAR_R = 1.1;

const state = {
  screen: 'loading',   // 'loading', 'title', 'select', 'world', 'house' or 'end'
  overlay: null,       // null, 'phone' or 'dialog' (the world pauses)
  time: 0,
  charId: null, stats: null,
  worldIndex: 0,
  flags: { gateOpen: false, houseDone: false },
  hearts: 3, safe: 0,
  car: { x: 0, z: 0, vx: 0, vz: 0, heading: Math.PI },
  checkpoint: null,
  cutscene: null,      // { x, z, until } the camera looks somewhere else for a bit
  selectIndex: 0, selectReadyAt: 0,
  robotNear: -1,
};
window.state = state;

const $ = (id) => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle('hidden', !on);
const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ---------- Renderer and screen size ----------

const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
let view = null;    // what is being drawn: { scene, camera }

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  document.documentElement.style.setProperty('--u', Math.min(w / 1024, h / 768).toFixed(3));
  [camera, room && room.camera].forEach(c => { if (c) { c.aspect = w / h; c.updateProjectionMatrix(); } });
}
window.addEventListener('resize', resize);

// ---------- Small pop-ups ----------

let toastTimer = null;
function toast(text, seconds) {
  $('toast').textContent = text; show('toast', true);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => show('toast', false), (seconds || 3.5) * 1000);
}
function fade(on) { $('fade').classList.toggle('on', on); return new Promise(r => setTimeout(r, 450)); }
function blurAll() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
function updateHearts() {
  $('hearts').textContent = '❤️'.repeat(Math.max(0, state.hearts)) + '🤍'.repeat(Math.max(0, state.stats.hearts - state.hearts));
}

function setScreen(name) {
  state.screen = name;
  ['loading', 'title-screen', 'select-screen', 'end-screen', 'hud', 'joystick', 'room-status', 'speech', 'banner'].forEach(id => show(id, false));
  if (name === 'title') show('title-screen', true);
  if (name === 'select') show('select-screen', true);
  if (name === 'world') { show('hud', true); show('joystick', isTouch()); }
  if (name === 'house') { show('room-status', true); show('joystick', isTouch()); }
  if (name === 'end') show('end-screen', true);
  blurAll(); clearHeld();
}

// ---------- Saving ----------

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ charId: state.charId, worldIndex: state.worldIndex, flags: state.flags }));
  } catch (e) { /* saving is optional */ }
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && CHARACTERS.some(c => c.id === s.charId) && WORLDS[s.worldIndex]) return s;
  } catch (e) { /* no save */ }
  return null;
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* fine */ } }

// ---------- Title screen (the cast spins slowly behind the words) ----------

let titleScene = null;
function makeTitleScene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color('#8fb3d9');
  s.add(new THREE.HemisphereLight('#ffffff', '#556644', 1.4));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5); sun.position.set(5, 10, 6); s.add(sun);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: '#6acb5c' }));
  disc.rotation.x = -Math.PI / 2; s.add(disc);
  const cast = [['robot', -4.2, 2.2], ['dragon', 4.2, 2.6], ['ghost', 0, 1.6]].map(([n, x, h]) => {
    const m = makeModel(n, h); m.position.set(x, n === 'ghost' ? 0.6 : 0, n === 'ghost' ? -2 : 0); s.add(m); return m;
  });
  CHARACTERS.forEach((ch, i) => { const m = makeModel(ch.id, 1); m.position.set(-3.75 + i * 1.5, 0, 3); s.add(m); cast.push(m); });
  s.userData.cast = cast;
  return s;
}

function showTitle() {
  setScreen('title');
  if (!titleScene) titleScene = makeTitleScene();
  view = { scene: titleScene, camera };
  const saved = loadSave();
  show('title-hint', !saved);
  show('title-buttons', !!saved);
  if (saved) {
    $('btn-continue').textContent = '▶ Continue as ' + CHARACTERS.find(c => c.id === saved.charId).name;
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
      b.onfocus = b.onmouseenter = () => { state.selectIndex = i; };
      cards.append(b);
    });
  }
  cards.children[state.selectIndex].focus();
}

function drawCards() {
  const cards = $('cards').children;
  for (let i = 0; i < cards.length; i++) {
    const g = cards[i].querySelector('canvas').getContext('2d'), sel = i === state.selectIndex;
    g.clearRect(0, 0, 128, 128);
    cards[i].classList.toggle('selected', sel);
    drawCharacter(g, CHARACTERS[i], 64, 70, 96, state.time + i, sel ? (CHARACTERS[i].look === 'chameleon' ? 'excited' : 'happy') : null);
  }
}

// ---------- Starting a world ----------

let world = null, worldScene = null, car = null, driver = null, sunLight = null, room = null;

function startGame(charId, saved) {
  state.charId = charId;
  state.stats = statsFor(charId);
  state.worldIndex = saved ? saved.worldIndex : 0;
  state.flags = saved ? Object.assign({}, saved.flags) : { gateOpen: false, houseDone: false };
  if (!saved) clearSave();
  buildCurrentWorld();
  const w = world.data;
  const spot = state.flags.houseDone ? w.checkpoints[1].at : state.flags.gateOpen ? w.checkpoints[0].at : w.start;
  placeCar(spot[0], spot[1]);
  state.checkpoint = spot;
  state.hearts = state.stats.hearts;
  setScreen('world');
  updateHearts();
  view = { scene: worldScene, camera };
  const ch = CHARACTERS.find(c => c.id === charId);
  setTimeout(() => toast(ch.name + ': "Let\'s find the haunted house!" 📱 Call a robot if you get lost.', 5), 600);
}

function buildCurrentWorld() {
  const w = WORLDS[state.worldIndex];
  worldScene = new THREE.Scene();
  worldScene.background = new THREE.Color(w.fog);
  worldScene.fog = new THREE.Fog(w.fog, 32, 85);
  worldScene.add(new THREE.HemisphereLight('#ffffff', '#4d5a6e', 1.3));
  sunLight = new THREE.DirectionalLight('#ffffff', 1.7);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunLight.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
  worldScene.add(sunLight, sunLight.target);
  world = buildWorld(worldScene, w, state.flags);
  const ch = CHARACTERS.find(c => c.id === state.charId);
  car = makeCar(ch);
  driver = makeModel(state.charId, 1.25);
  car.userData.seat.add(driver);
  worldScene.add(car);
}

function placeCar(x, z) {
  Object.assign(state.car, { x, z, vx: 0, vz: 0 });
  snapCamera = true;
}

// ---------- Driving ----------

function updateDriving(dt) {
  const c = state.car, m = move(), top = state.stats.carSpeed;
  const k = 1 - Math.exp(-dt * (Math.hypot(m.x, m.y) > 0.1 ? 3.2 : 4.5));
  c.vx += (m.x * top - c.vx) * k;
  c.vz += (-m.y * top - c.vz) * k;
  const pos = { x: c.x + c.vx * dt, z: c.z + c.vz * dt };
  const push = world.pushAt(pos.x, pos.z);
  if (push) { pos.x += push[0] * dt; pos.z += push[1] * dt; }
  resolve(world, pos, CAR_R);
  c.x = pos.x; c.z = pos.z;
  const speed = Math.hypot(c.vx, c.vz);
  if (speed > 0.6) {
    const want = Math.atan2(c.vx, c.vz);
    let d = want - c.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    c.heading += d * Math.min(1, dt * 10);
  }
  engine(speed / top);
}

function hurt(fromX, fromZ) {
  if (state.safe > 0) return;
  state.hearts--;
  state.safe = state.stats.safeTime;
  sound('bonk');
  updateHearts();
  if (state.hearts <= 0) {
    placeCar(state.checkpoint[0], state.checkpoint[1]);
    state.hearts = state.stats.hearts; state.safe = 2;
    updateHearts();
    toast('Whoops! Back to safety. Hearts are full again! ❤️');
    return;
  }
  const c = state.car, dx = c.x - fromX, dz = c.z - fromZ, d = Math.hypot(dx, dz) || 1;
  c.vx = dx / d * 22; c.vz = dz / d * 22;
}

function checkWorldThings() {
  const c = state.car, w = world.data;
  // Bumping villains and rolling gears
  world.hazards.forEach(h => { if (Math.hypot(c.x - h.x, c.z - h.z) < h.r + CAR_R) hurt(h.x, h.z); });
  // Robots talk when you drive up to them
  let near = -1;
  world.robots.forEach((r, i) => { if (Math.hypot(c.x - r.x, c.z - r.z) < 2.6) near = i; });
  if (near >= 0 && near !== state.robotNear) {
    sound('beep');
    openDialog(world.robots[near].data.line + ' ' + hintText());
  }
  state.robotNear = near;
  // The red button opens the yard gate
  if (!world.gateOpen && Math.hypot(c.x - w.button[0], c.z - w.button[1]) < 2.4) {
    world.openGate();
    state.flags.gateOpen = true;
    save();
    sound('clank');
    state.cutscene = { x: world.gateSpot.x, z: world.gateSpot.z, until: state.time + 3 };
    toast('CLANK! You pressed the button. A gate opened far away!', 4.5);
  }
  // Checkpoints: where you come back if you run out of hearts
  w.checkpoints.forEach(cp => { if (inBox(c.x, c.z, cp.box)) state.checkpoint = cp.at; });
  if (world.slid) { world.slid = false; toast('Whoa! The bridge went up! Wait for it to come down.'); }
  // The haunted house door and the portal
  if (!world.houseDone && c.x < world.doorSpot.x + 0.5 && Math.hypot(c.x - world.doorSpot.x, c.z - world.doorSpot.z) < 2.2) enterHouse();
  if (world.houseDone && Math.hypot(c.x - world.portalSpot.x, c.z - world.portalSpot.z) < 2.8) finishWorld();
}

// ---------- Phone and robots ----------

function hintText() {
  return gearCityHint(world.data, { x: state.car.x, z: state.car.z, gateOpen: world.gateOpen, houseDone: world.houseDone }, state.stats.detailedHints);
}
function openPhone() {
  if (state.screen !== 'world' || state.overlay) return;
  state.overlay = 'phone';
  show('toast', false);
  $('phone-status').textContent = '🌍 World ' + (state.worldIndex + 1) + ' of 6: ' + world.data.name;
  $('phone-items').textContent = 'Items: ' + (world.houseDone ? world.data.item.icon + ' ' + world.data.item.name : 'none yet');
  show('phone-answer', false); show('phone', true);
  $('btn-call').focus();
}
function callRobot() {
  sound('beep');
  $('phone-hint').textContent = 'Beep boop! ' + hintText();
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
  blurAll(); clearHeld();
}

// ---------- The haunted house ----------

async function enterHouse() {
  if (state.screen !== 'world') return;
  state.screen = 'entering';
  engine(0);
  await fade(true);
  setScreen('house');
  room = createLavaRoom({
    player: makeModel(state.charId, 1.1),
    stats: state.stats,
    sound,
    say: (text) => { $('speech').textContent = text; show('speech', !!text); },
    status: (text) => { $('room-status').textContent = text; },
    onSolved: () => {
      const item = world.data.item;
      $('banner-text').textContent = 'You got the ' + item.name + '! ' + item.icon;
      show('banner', true);
      $('btn-banner').focus();
    },
  });
  resize();
  view = { scene: room.scene, camera: room.camera };
  await fade(false);
}

async function leaveHouse() {
  if (state.screen !== 'house' || !room || room.room.phase !== 'done') return;
  show('banner', false);
  await fade(true);
  room = null;
  world.houseDone = state.flags.houseDone = true;
  world.removeDragon();
  world.portal.visible = true;
  state.hearts = state.stats.hearts;
  placeCar(world.doorSpot.x - 1.5, world.doorSpot.z);
  state.checkpoint = world.data.checkpoints[1].at;
  save();
  setScreen('world');
  updateHearts();
  view = { scene: worldScene, camera };
  state.cutscene = { x: world.portalSpot.x, z: world.portalSpot.z, until: state.time + 2.6 };
  await fade(false);
  sound('chime');
  toast('A magic portal opened! Drive into it! ✨', 4);
}

async function finishWorld() {
  state.screen = 'leaving';
  engine(0);
  sound('chime');
  await fade(true);
  clearSave();
  setScreen('end');
  const next = WORLDS[state.worldIndex + 1];
  $('end-text').textContent = 'World 1 cleared!';
  $('end-sub').textContent = 'Great driving, ' + CHARACTERS.find(c => c.id === state.charId).name + '! Next stop: ' + next.name + '. Coming soon!';
  view = { scene: titleScene, camera };
  await fade(false);
  $('btn-again').focus();
}

// ---------- Keys and buttons ----------

onKey((key, dir) => {
  unlockAudio();
  const s = state.screen;
  if (key === 'm' || key === 'M') { $('btn-mute').textContent = toggleMute() ? '🔇' : '🔊'; return; }
  if (s === 'title') { if (!loadSave()) showSelect(); return; }
  if (s === 'select' && dir) {
    const n = CHARACTERS.length;
    let i = state.selectIndex;
    if (dir === 'left') i = (i + n - 1) % n;
    if (dir === 'right') i = (i + 1) % n;
    if (dir === 'up' || dir === 'down') i = (i + 3) % n;
    state.selectIndex = i;
    $('cards').children[i].focus();
    return;
  }
  if (s === 'world') {
    if (key === 'p' || key === 'P') { if (state.overlay === 'phone') closeOverlay(); else openPhone(); }
    if (key === 'Escape' && state.overlay) closeOverlay();
  }
});
window.addEventListener('pointerdown', unlockAudio);
setupJoystick($('joystick'), $('knob'));

$('title-screen').addEventListener('click', () => { if (state.screen === 'title' && !loadSave()) showSelect(); });
$('btn-continue').onclick = (e) => { e.stopPropagation(); const s = loadSave(); if (s) startGame(s.charId, s); };
$('btn-new').onclick = (e) => { e.stopPropagation(); clearSave(); showSelect(); };
$('btn-phone').onclick = () => openPhone();
$('btn-mute').onclick = () => { $('btn-mute').textContent = toggleMute() ? '🔇' : '🔊'; };
$('btn-call').onclick = () => callRobot();
$('btn-close').onclick = () => closeOverlay();
$('dialog-ok').onclick = () => closeOverlay();
$('btn-banner').onclick = () => leaveHouse();
$('btn-again').onclick = () => { state.selectIndex = 0; showSelect(); view = { scene: titleScene, camera }; };

// ---------- Camera and main loop ----------

let snapCamera = true;
const camTarget = new THREE.Vector3();
function updateWorldCamera(dt) {
  const c = state.car;
  let tx = c.x, tz = c.z;
  if (state.cutscene) {
    if (state.time < state.cutscene.until) { tx = state.cutscene.x; tz = state.cutscene.z; } else state.cutscene = null;
  }
  const goal = new THREE.Vector3(tx, 0, tz);
  if (snapCamera) { camTarget.copy(goal); snapCamera = false; } else camTarget.lerp(goal, Math.min(1, dt * (state.cutscene ? 2.5 : 6)));
  camera.position.set(camTarget.x, 20, camTarget.z + 12);
  camera.lookAt(camTarget.x, 0, camTarget.z - 2);
  sunLight.position.set(camTarget.x + 18, 34, camTarget.z + 12);
  sunLight.target.position.copy(camTarget);
}

let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  state.time += dt;
  const t = state.time;
  if (state.screen === 'title' || state.screen === 'select' || state.screen === 'end') {
    const a = t * 0.15;
    camera.position.set(Math.sin(a) * 12, 5, Math.cos(a) * 12);
    camera.lookAt(0, 1, 0);
    if (titleScene) titleScene.userData.cast.forEach((m, i) => m.userData.animate(t + i, state.screen === 'end' ? 'happy' : null));
    if (state.screen === 'select') drawCards();
  }
  if (world && worldScene && (state.screen === 'world' || state.screen === 'entering' || state.screen === 'leaving')) {
    const paused = state.overlay || state.screen !== 'world' || state.cutscene;
    if (!paused) {
      state.safe = Math.max(0, state.safe - dt);
      updateDriving(dt);
      checkWorldThings();
    } else engine(0);
    if (!state.overlay) world.update(dt, t, state.car, state.stats.villainSpeed);
    car.position.set(state.car.x, 0, state.car.z);
    car.rotation.y = state.car.heading;
    car.visible = !(state.safe > 0 && Math.floor(t * 10) % 2 === 0);
    if (car.userData.rainbow) car.userData.rainbow.forEach(m => m.color.setHSL((t * 0.1) % 1, 0.8, 0.6));
    driver.userData.animate(t, Math.hypot(state.car.vx, state.car.vz) > 2 ? 'happy' : null);
    updateWorldCamera(dt);
  }
  if (state.screen === 'house' && room) room.update(dt, t);
  if (view) renderer.render(view.scene, view.camera);
  requestAnimationFrame(frame);
}

// Handy for poking at the game from the browser console.
window.game = { state, placeCar, get world() { return world; }, get room() { return room; } };

resize();
preloadModels().then(() => {
  showTitle();
  requestAnimationFrame(frame);
});
