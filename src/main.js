// main.js
// The game itself: screens, driving, robots and the phone, going into the
// haunted houses, moving on to the next world, the Gecko Land ending, saving,
// and the camera.
//
// Everything the game knows lives in one object called `state`.
// Type `state` in the browser console to look at it.

import * as THREE from 'three';
import { preloadModels, makeModel, makeVehicle, VEHICLES } from './models.js';
import { WORLDS, worldHint } from './worlds.js';
import { buildWorld, resolve, inBox, setWorldNumber } from './world.js';
import { createLavaRoom, LAVA_EASY, LAVA_HARD } from './rooms/lava.js';
import { createIceRoom } from './rooms/ice.js';
import { createLeverRoom } from './rooms/levers.js';
import { createMirrorRoom, MIRRORS_EASY, MIRRORS_HARD } from './rooms/mirrors.js';
import { move, onKey, clearHeld, setupJoystick } from './input.js';
import { unlockAudio, sound, engine, toggleMute } from './audio.js';
const placeAt = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };

const SAVE_KEY = 'robotLandToGeckoLand.v3';
const CAR_R = 1.1;
const ROOMS = {
  lava1: (ctx) => createLavaRoom(ctx, LAVA_EASY),
  ice: (ctx) => createIceRoom(ctx),
  levers: (ctx) => createLeverRoom(ctx),
  mirrors1: (ctx) => createMirrorRoom(ctx, MIRRORS_EASY),
  lava2: (ctx) => createLavaRoom(ctx, LAVA_HARD),
  mirrors2: (ctx) => createMirrorRoom(ctx, MIRRORS_HARD),
};

const state = {
  screen: 'loading',   // 'loading', 'title', 'select', 'world', 'house', 'end' or 'home'
  overlay: null,       // null, 'phone' or 'dialog' (the world pauses)
  time: 0,
  charId: null, stats: null,
  worldIndex: 0,
  flags: { switches: [], houseDone: false },
  hearts: 3, safe: 0,
  car: { x: 0, z: 0, vx: 0, vz: 0, heading: Math.PI },
  jump: null,          // flying through the air from a spring pad
  teleLock: null,      // the teleport pad you just arrived on
  checkpoint: null,
  cutscene: null,      // { x, z, until } the camera looks somewhere else for a bit
  selectIndex: 0, selectReadyAt: 0,
  robotNear: -1,
};
window.state = state;

const $ = (id) => document.getElementById(id);
const show = (id, on) => $(id).classList.toggle('hidden', !on);
const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const charOf = () => CHARACTERS.find(c => c.id === state.charId);

// ---------- Renderer and screen size ----------

const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
let view = null;    // what is being drawn: { scene, camera }
let world = null, worldScene = null, car = null, driver = null, sunLight = null, room = null, homeScene = null;

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
  if (name === 'end' || name === 'home') show('end-screen', true);
  blurAll(); clearHeld();
}

// ---------- Saving ----------

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ charId: state.charId, worldIndex: state.worldIndex, flags: state.flags })); } catch (e) { /* optional */ }
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && CHARACTERS.some(c => c.id === s.charId) && WORLDS[s.worldIndex] && s.flags) return s;
  } catch (e) { /* no save */ }
  return null;
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* fine */ } }

// ---------- Title and character screens ----------

let titleScene = null;
function makeTitleScene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color('#8fb3d9');
  s.add(new THREE.HemisphereLight('#ffffff', '#556644', 1.4));
  const sun = new THREE.DirectionalLight('#ffffff', 1.5); sun.position.set(5, 10, 6); s.add(sun);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: '#6acb5c' }));
  disc.rotation.x = -Math.PI / 2; s.add(disc);
  const cast = [['robot', -4.2, 2.2], ['dragon', 4.2, 2.6], ['ghost', 0, 1.6], ['snowgun', -6.5, 2], ['wizard', 6.5, 2], ['yoyo', 0, 1.6]].map(([n, x, h], i) => {
    const m = makeModel(n, h); m.position.set(x, n === 'ghost' ? 0.6 : 0, i > 2 ? -3.5 : n === 'ghost' ? -2 : 0); s.add(m); return m;
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
    $('btn-continue').textContent = '▶ Continue as ' + CHARACTERS.find(c => c.id === saved.charId).name + ' (World ' + (saved.worldIndex + 1) + ')';
    $('btn-continue').focus();
  }
}

function showSelect() {
  setScreen('select');
  view = { scene: titleScene, camera };
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

// ---------- Worlds ----------

function startGame(charId, saved) {
  state.charId = charId;
  state.stats = statsFor(charId);
  state.worldIndex = saved ? saved.worldIndex : 0;
  state.flags = saved ? { switches: saved.flags.switches || [], houseDone: !!saved.flags.houseDone } : { switches: [], houseDone: false };
  if (!saved) clearSave();
  enterWorld(true);
}

// Build the current world and put the car in it.
function enterWorld(greet) {
  if (worldScene) disposeScene(worldScene);
  buildCurrentWorld();
  const w = world.data;
  // Coming back to a saved game: start near where you got to.
  const spot = state.flags.houseDone ? w.checkpoints[w.checkpoints.length - 1].at : state.flags.switches.length ? w.checkpoints[0].at : w.start;
  placeCar(spot[0], spot[1]);
  state.checkpoint = spot;
  state.hearts = state.stats.hearts;
  state.jump = null; state.teleLock = null; state.robotNear = -1;
  setScreen('world');
  updateHearts();
  view = { scene: worldScene, camera };
  if (greet) {
    const v = VEHICLES[w.vehicle];
    setTimeout(() => toast('World ' + (state.worldIndex + 1) + ': ' + w.name + '! You are driving the ' + v.name + '. 📱 Call a robot if you get lost.', 5.5), 600);
  }
}

function disposeScene(scene) {
  scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}

function buildCurrentWorld() {
  const w = WORLDS[state.worldIndex], th = w.theme;
  setWorldNumber(state.worldIndex + 1);
  worldScene = new THREE.Scene();
  worldScene.background = new THREE.Color(th.fog);
  worldScene.fog = new THREE.Fog(th.fog, th.fogNear || 32, th.fogFar || 85);
  worldScene.add(new THREE.HemisphereLight(th.night ? '#9aa8ff' : '#ffffff', '#4d5a6e', th.night ? 0.7 : 1.3));
  sunLight = new THREE.DirectionalLight(th.night ? '#b9c4ff' : '#ffffff', th.night ? 0.8 : 1.7);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunLight.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 140 });
  worldScene.add(sunLight, sunLight.target);
  world = buildWorld(worldScene, w, state.flags);
  car = makeVehicle(w.vehicle, charOf());
  driver = makeModel(state.charId, 1.25);
  car.userData.seat.add(driver);
  if (th.night || VEHICLES[w.vehicle].light) {
    const lamp = new THREE.PointLight('#fff2c0', th.night ? 60 : 20, 22);
    lamp.position.set(0, 2.5, 2); car.add(lamp);
  }
  worldScene.add(car);
}

function placeCar(x, z) {
  Object.assign(state.car, { x, z, vx: 0, vz: 0 });
  snapCamera = true;
}

// ---------- Driving ----------

function updateDriving(dt) {
  const c = state.car, m = move(), v = VEHICLES[world.data.vehicle];
  const top = state.stats.carSpeed * v.speed;
  let grip = Math.hypot(m.x, m.y) > 0.1 ? v.grip : v.grip * 1.4;
  if (world.iceAt(c.x, c.z)) grip = v.iceGrip;
  const k = 1 - Math.exp(-dt * grip);
  c.vx += (m.x * top - c.vx) * k;
  c.vz += (-m.y * top - c.vz) * k;
  const pos = { x: c.x + c.vx * dt, z: c.z + c.vz * dt };
  const push = world.pushAt(pos.x, pos.z);
  if (push) { pos.x += push[0] * dt; pos.z += push[1] * dt; }
  resolve(world, pos, CAR_R);
  // Going up a hill slows you down a little.
  const climb = world.heightAt(pos.x, pos.z) - world.heightAt(c.x, c.z), step = Math.hypot(pos.x - c.x, pos.z - c.z);
  if (step > 0.001 && climb > 0) { const slow = Math.min(0.5, climb / step * 0.5); c.vx *= 1 - slow * dt * 4; c.vz *= 1 - slow * dt * 4; }
  c.x = pos.x; c.z = pos.z;
  const speed = Math.hypot(c.vx, c.vz);
  if (speed > 0.6) {
    let d = Math.atan2(c.vx, c.vz) - c.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    c.heading += d * Math.min(1, dt * 10);
  }
  engine(speed / top);
}

function hurt(fromX, fromZ) {
  if (state.safe > 0 || state.jump) return;
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
  world.hazards.forEach(h => { if (h.r && Math.hypot(c.x - h.x, c.z - h.z) < h.r + CAR_R) hurt(h.x, h.z); });
  world.shots.forEach(s => { if (!s.hit && Math.hypot(c.x - s.x, c.z - s.z) < s.r + CAR_R) { s.hit = true; hurt(s.x - s.vx, s.z - s.vz); } });
  // Robots talk when you drive up to them.
  let near = -1;
  world.robots.forEach((r, i) => { if (Math.hypot(c.x - r.x, c.z - r.z) < 2.6) near = i; });
  if (near >= 0 && near !== state.robotNear) { sound('beep'); openDialog(world.robots[near].data.line + ' ' + hintText()); }
  state.robotNear = near;
  // Buttons and stars
  world.switches.forEach((sw, i) => {
    if (sw.done || Math.hypot(c.x - sw.at[0], c.z - sw.at[1]) > 2.4) return;
    const gate = world.press(i);
    state.flags.switches.push(i);
    save();
    const total = world.switches.length, have = world.switches.filter(s => s.done).length;
    sound(sw.kind === 'star' ? 'chime' : 'clank');
    if (gate) {
      state.cutscene = { x: (gate.box[0] + gate.box[2]) / 2, z: (gate.box[1] + gate.box[3]) / 2, until: state.time + 3 };
      toast(sw.kind === 'star' ? '⭐ All the stars! A magic gate opened!' : 'CLANK! A gate opened somewhere!', 4.5);
    } else toast(sw.kind === 'star' ? '⭐ You found a star! ' + have + ' of ' + total + '.' : 'CLANK! Button ' + have + ' of ' + total + ' pressed!', 4);
  });
  // Spring pads
  const pad = world.pads.find(p => Math.hypot(c.x - p.at[0], c.z - p.at[1]) < 1.8);
  if (pad) { state.jump = { fx: c.x, fz: c.z, tx: pad.to[0], tz: pad.to[1], t: 0, dur: 1.2 }; sound('hop'); return; }
  // Magic teleport pads
  if (state.teleLock && Math.hypot(c.x - state.teleLock[0], c.z - state.teleLock[1]) > 2.6) state.teleLock = null;
  if (!state.teleLock) {
    for (const tp of world.teleports) {
      for (const [from, to] of [[tp.a, tp.b], [tp.b, tp.a]]) {
        if (Math.hypot(c.x - from[0], c.z - from[1]) < 1.6) {
          placeCar(to[0], to[1]); state.teleLock = to; sound('chime');
          toast('✨ Zap!', 1.5);
          return;
        }
      }
    }
  }
  // Checkpoints: where you come back if you run out of hearts.
  w.checkpoints.forEach(cp => { if (inBox(c.x, c.z, cp.box)) state.checkpoint = cp.at; });
  if (world.slid) { toast(world.slid === 'draw' ? 'Whoa! The bridge went up! Wait for it to come down.' : 'Whoa! The stones sank! Wait for them to pop up.'); world.slid = false; }
  // The haunted house door and the portal
  if (!world.houseDone && Math.hypot(c.x - world.doorSpot.x, c.z - world.doorSpot.z) < 2.2) enterHouse();
  if (world.houseDone && Math.hypot(c.x - world.portalSpot.x, c.z - world.portalSpot.z) < 2.8) finishWorld();
}

function updateJump(dt) {
  const j = state.jump;
  j.t += dt;
  const k = Math.min(1, j.t / j.dur);
  state.car.x = j.fx + (j.tx - j.fx) * k;
  state.car.z = j.fz + (j.tz - j.fz) * k;
  state.car.heading = Math.atan2(j.tx - j.fx, j.tz - j.fz);
  j.y = Math.sin(k * Math.PI) * 7;
  if (k >= 1) {
    state.jump = null;
    const pos = { x: state.car.x, z: state.car.z };
    resolve(world, pos, CAR_R);
    Object.assign(state.car, pos, { vx: 0, vz: 0 });
    sound('bonk');
  }
}

// ---------- Phone and robots ----------

function hintText() {
  return worldHint(world.data, {
    x: state.car.x, z: state.car.z, houseDone: world.houseDone, doorSpot: [world.doorSpot.x, world.doorSpot.z],
    switchDone: (i) => world.switchDone(i), switchCount: world.switches.filter(s => s.done).length,
  }, state.stats.detailedHints);
}
function openPhone() {
  if (state.screen !== 'world' || state.overlay) return;
  state.overlay = 'phone';
  show('toast', false);
  $('phone-status').textContent = '🌍 World ' + (state.worldIndex + 1) + ' of 6: ' + world.data.name;
  const items = WORLDS.slice(0, state.worldIndex + (world.houseDone ? 1 : 0)).map(w => w.item.icon + ' ' + w.item.name);
  $('phone-items').textContent = 'Items: ' + (items.length ? items.join(', ') : 'none yet');
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

// ---------- Haunted houses ----------

async function enterHouse() {
  if (state.screen !== 'world') return;
  state.screen = 'entering';
  engine(0);
  await fade(true);
  setScreen('house');
  room = ROOMS[world.data.room]({
    player: makeModel(state.charId, 1.1),
    stats: state.stats,
    item: world.data.item,
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
  disposeScene(room.scene);
  room = null;
  world.houseDone = state.flags.houseDone = true;
  world.removeGuards();
  world.portal.visible = true;
  state.hearts = state.stats.hearts;
  const d = world.doorSpot, h = world.data.house;
  const out = { west: [-1.5, 0], east: [1.5, 0], south: [0, 1.5], north: [0, -1.5] }[h.door];
  placeCar(d.x + out[0], d.z + out[1]);
  state.checkpoint = world.data.checkpoints[world.data.checkpoints.length - 1].at;
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
  if (state.worldIndex + 1 < WORLDS.length) {
    state.worldIndex++;
    state.flags = { switches: [], houseDone: false };
    save();
    enterWorld(true);
  } else {
    clearSave();
    showHome();
  }
  await fade(false);
}

// ---------- The ending: home in Gecko Land ----------

function makeHomeScene() {
  const s = new THREE.Scene();
  s.background = new THREE.Color('#9fe0ff');
  s.fog = new THREE.Fog('#9fe0ff', 30, 80);
  s.add(new THREE.HemisphereLight('#ffffff', '#4a8a3a', 1.4));
  const sun = new THREE.DirectionalLight('#fff4d0', 1.8); sun.position.set(6, 14, 8); sun.castShadow = true; s.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: '#5fd257' }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
  const petal = new THREE.SphereGeometry(0.12, 8, 6), colors = ['#ff6fa8', '#ffd23f', '#ffffff', '#b583ff', '#ff8c42'];
  colors.forEach((col, ci) => {
    const flowers = new THREE.InstancedMesh(petal, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25 }), 160);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 30;
      m.makeTranslation(Math.cos(a) * r, 0.15, Math.sin(a) * r); flowers.setMatrixAt(i, m);
    }
    s.add(flowers);
  });
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, tree = new THREE.Group();
    tree.add(placeAt(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.4), new THREE.MeshStandardMaterial({ color: '#7a5230' })), 0, 1.2, 0));
    tree.add(placeAt(new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), new THREE.MeshStandardMaterial({ color: '#3fae4a' })), 0, 3.6, 0));
    tree.position.set(Math.cos(a) * 22, 0, Math.sin(a) * 22); s.add(tree);
  }
  const friends = [charOf()].concat(CHARACTERS.filter(c => c.id !== state.charId)).map((ch, i) => {
    const m = makeModel(ch.id, i === 0 ? 1.6 : 1.3);
    const a = (i - 2.5) * 0.45;
    m.position.set(Math.sin(a) * 5, 0, Math.cos(a) * 5 - 3);
    if (i === 0) m.position.set(0, 0, 1);
    s.add(m); return m;
  });
  const confetti = [];
  for (let i = 0; i < 160; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.15), new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
    p.position.set(Math.random() * 20 - 10, Math.random() * 12, Math.random() * 14 - 8);
    s.add(p); confetti.push(p);
  }
  s.userData = { friends, confetti };
  return s;
}

function showHome() {
  if (worldScene) { disposeScene(worldScene); worldScene = null; world = null; }
  homeScene = makeHomeScene();
  setScreen('home');
  view = { scene: homeScene, camera };
  $('end-text').textContent = 'Welcome home, ' + charOf().name + '!';
  $('end-sub').textContent = 'You beat all six haunted houses and made it home to Gecko Land! 🦎🎉';
  sound('chime');
  setTimeout(() => $('btn-again').focus(), 500);
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
$('btn-again').onclick = () => { state.selectIndex = 0; showSelect(); };

// ---------- Camera and main loop ----------

let snapCamera = true;
const camTarget = new THREE.Vector3();
function updateWorldCamera(dt) {
  const c = state.car;
  let tx = c.x, tz = c.z;
  if (state.cutscene) {
    if (state.time < state.cutscene.until) { tx = state.cutscene.x; tz = state.cutscene.z; } else state.cutscene = null;
  }
  const goal = new THREE.Vector3(tx, world.heightAt(tx, tz), tz);
  if (snapCamera) { camTarget.copy(goal); snapCamera = false; } else camTarget.lerp(goal, Math.min(1, dt * (state.cutscene ? 2.5 : 6)));
  camera.position.set(camTarget.x, camTarget.y + 20, camTarget.z + 12);
  camera.lookAt(camTarget.x, camTarget.y, camTarget.z - 2);
  sunLight.position.set(camTarget.x + 18, camTarget.y + 34, camTarget.z + 12);
  sunLight.target.position.copy(camTarget);
}

function placeCarMesh(t) {
  const c = state.car, hAt = world.heightAt;
  const ground = hAt(c.x, c.z);
  car.position.set(c.x, ground + (state.jump ? state.jump.y : 0), c.z);
  // Tilt the car to match the hill.
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const pitch = Math.atan2(hAt(c.x + fx, c.z + fz) - hAt(c.x - fx, c.z - fz), 2);
  const roll = Math.atan2(hAt(c.x + fz, c.z - fx) - hAt(c.x - fz, c.z + fx), 2);
  car.rotation.set(-pitch, c.heading, roll, 'YXZ');
  car.visible = !(state.safe > 0 && Math.floor(t * 10) % 2 === 0);
  const speed = Math.hypot(c.vx, c.vz);
  car.userData.animate(t, speed);
  if (car.userData.rainbow) car.userData.rainbow.forEach(m => m.color.setHSL((t * 0.1) % 1, 0.8, 0.6));
  driver.userData.animate(t, speed > 2 || state.jump ? 'happy' : null);
}

let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  state.time += dt;
  const t = state.time;
  if (state.screen === 'title' || state.screen === 'select') {
    const a = t * 0.15;
    camera.position.set(Math.sin(a) * 12, 5, Math.cos(a) * 12);
    camera.lookAt(0, 1, 0);
    if (titleScene) titleScene.userData.cast.forEach((m, i) => m.userData.animate(t + i, null));
    if (state.screen === 'select') drawCards();
  }
  if (state.screen === 'home' && homeScene) {
    const a = t * 0.1;
    camera.position.set(Math.sin(a) * 10, 3.5, Math.cos(a) * 10);
    camera.lookAt(0, 3, 0);
    homeScene.userData.friends.forEach((m, i) => m.userData.animate(t + i * 0.3, 'happy'));
    homeScene.userData.confetti.forEach((p, i) => { p.position.y -= dt * (1.5 + (i % 5) * 0.3); p.rotation.x += dt * 3; p.rotation.y += dt * 2; if (p.position.y < 0) p.position.y = 12; });
  }
  if (world && worldScene && (state.screen === 'world' || state.screen === 'entering' || state.screen === 'leaving')) {
    const paused = state.overlay || state.screen !== 'world' || state.cutscene;
    if (!paused) {
      state.safe = Math.max(0, state.safe - dt);
      if (state.jump) updateJump(dt);
      else { updateDriving(dt); checkWorldThings(); }
    } else engine(0);
    if (!state.overlay && world) world.update(dt, t, state.car, state.stats.villainSpeed);
    if (world) { placeCarMesh(t); updateWorldCamera(dt); }
  }
  if (state.screen === 'house' && room) room.update(dt, t);
  if (view) renderer.render(view.scene, view.camera);
  requestAnimationFrame(frame);
}

// Handy for poking at the game from the browser console.
window.game = {
  state, placeCar, sound, WORLDS,
  get world() { return world; }, get room() { return room; }, get car() { return car; },
  goToWorld(i) { state.worldIndex = i; state.flags = { switches: [], houseDone: false }; enterWorld(false); },
};

resize();
preloadModels().then(() => {
  showTitle();
  requestAnimationFrame(frame);
});
