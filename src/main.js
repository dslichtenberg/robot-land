// main.js
// The game itself: screens, driving, robots and the phone, going into the
// haunted houses, moving on to the next world, the Gecko Land ending, saving,
// and the camera.
//
// Everything the game knows lives in one object called `state`.
// Type `state` in the browser console to look at it.

import * as THREE from 'three';
import { loadModels, CORE_MODELS, makeModel, makeVehicle, makeScatter, VEHICLES } from './models.js';
import { WORLDS, worldHint } from './worlds.js';
import { buildWorld, resolve, inBox, setWorldNumber, worldModels } from './world.js';
import { createLavaRoom, LAVA_EASY, LAVA_HARD } from './rooms/lava.js';
import { createIceRoom } from './rooms/ice.js';
import { createLeverRoom } from './rooms/levers.js';
import { createMirrorRoom, MIRRORS_EASY, MIRRORS_HARD } from './rooms/mirrors.js';
import { makeLaser } from './laser.js';
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
  powers: {},          // what this world's prizes let you do: { laser: true, ... }
  hop: null,           // a Bouncy String jump: { t }
  turbo: 0,            // seconds of Rocket Boots left
  cool: { laser: 0, turbo: 0, jump: 0, shield: 0 },  // seconds until each power is ready again
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

// ---------- Prize powers ----------
// Each haunted house prize gives the car a power for the worlds after it.
// The ones with a key are buttons; the shield and the heart just work.
const POWERS = {
  laser: { icon: '⚡', key: 'Space', keys: [' ', 'z', 'Z'], wait: 1.2, text: 'It turns on a LASER for your car! Press Space (or tap ⚡) to zap snowballs, sparkles and villains.' },
  turbo: { icon: '🚀', key: 'X', keys: ['x', 'X'], wait: 5, text: 'Press X (or tap 🚀) for a burst of super speed!' },
  jump: { icon: '🦘', key: 'C', keys: ['c', 'C'], wait: 1, text: 'Press C (or tap 🦘) to jump right over snowballs, fireballs and yo-yos!' },
  shield: { icon: '🫧', wait: 10, text: 'It makes a magic bubble around your car that blocks one bump, then grows back.' },
  heart: { icon: '❤️', text: 'You get an extra heart from now on!' },
};
const ownedItems = () => WORLDS.slice(0, state.worldIndex + (state.flags.houseDone ? 1 : 0)).map(w => w.item);

// Work out the powers from the prizes you have, and draw their buttons.
function refreshPowers() {
  state.powers = {};
  ownedItems().forEach(it => { if (it.power) state.powers[it.power] = true; });
  state.stats = statsFor(state.charId);
  if (state.powers.heart) state.stats.hearts += 1;
  const box = $('powers');
  box.innerHTML = '';
  for (const name of ['shield', 'jump', 'turbo', 'laser']) {
    if (!state.powers[name]) continue;
    const P = POWERS[name], b = document.createElement(P.keys ? 'button' : 'div');
    b.className = 'power' + (P.keys ? '' : ' passive');
    b.dataset.power = name;
    b.innerHTML = '<span class="power-icon">' + P.icon + '</span><span class="power-cool"></span>' + (P.key ? '<span class="power-key">' + P.key + '</span>' : '');
    if (P.keys) b.addEventListener('pointerdown', (e) => { e.preventDefault(); unlockAudio(); usePower(name); });
    box.append(b);
  }
}

function usePower(name) {
  if (state.screen !== 'world' || state.overlay || state.cutscene || !state.powers[name] || state.cool[name] > 0 || state.jump) return;
  const c = state.car;
  state.cool[name] = POWERS[name].wait;
  if (name === 'laser') {
    const dx = Math.sin(c.heading), dz = Math.cos(c.heading);
    const { hits, range } = world.zap(c.x, c.z, dx, dz, 16);
    worldScene.userData.laser.fire(muzzle(), c.heading, Math.max(0.5, range - 1.2), state.time);
    sound('zap');
    if (hits) setTimeout(() => sound('pop'), 120);
  }
  if (name === 'turbo') { state.turbo = 2.5; sound('boost'); }
  if (name === 'jump') { state.hop = { t: 0 }; sound('boing'); }
}

// The front of the car, where the laser comes out.
function muzzle() {
  const c = state.car;
  return new THREE.Vector3(c.x + Math.sin(c.heading) * 1.2, world.heightAt(c.x, c.z) + 1.3 + hopHeight(), c.z + Math.cos(c.heading) * 1.2);
}

function updatePowers(dt) {
  for (const k in state.cool) state.cool[k] = Math.max(0, state.cool[k] - dt);
  state.turbo = Math.max(0, state.turbo - dt);
  if (state.hop) { state.hop.t += dt; if (state.hop.t > HOP_TIME) state.hop = null; }
}
const HOP_TIME = 0.8;
const hopHeight = () => state.hop ? Math.sin(state.hop.t / HOP_TIME * Math.PI) * 3 : 0;

// Grey out a button while it charges back up.
function drawPowerButtons() {
  for (const b of $('powers').children) {
    const name = b.dataset.power, P = POWERS[name];
    const left = P.wait ? state.cool[name] / P.wait : 0;
    b.querySelector('.power-cool').style.height = (left * 100).toFixed(0) + '%';
    b.classList.toggle('ready', left === 0);
  }
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
// The launch screen: a little sunny island with the whole cast, the first
// haunted house behind them, and a kart doing laps.
const TITLE_MODELS = ['vehicles/kart', 'houses/house_gear', 'scenery/gecko/tree_lush_a', 'scenery/gecko/tree_lush_b',
  'scenery/gecko/flower_a', 'scenery/gecko/flower_b', 'scenery/gecko/flower_c', 'scenery/gecko/grass_tuft_a', 'scenery/gecko/grass_tuft_b'];
// ---------- Cheering jumps (title screen and the Gecko Land ending) ----------
// The cheer clip floats the body up and down like a slow wave. Here we take the up and down away from the clip (keeping its arms) and
// jump for real: crouch, spring up, fall with gravity, squash on landing.
const GRAVITY = 24;
function makeJumper(m) {
  const hips = m.getObjectByName('hips');
  if (!hips) return;
  m.userData.animate(0, 'idle'); m.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  m.userData.jumper = {
    hips, v, base: m.worldToLocal(hips.getWorldPosition(v)).y,
    phase: 'wait', timer: 0.2 + Math.random() * 1.2,
    y: 0, vy: 0,
    squash: 0, squashV: 0,   // a springy squash: below 0 is squashed flat, above 0 is stretched tall
    groundY: m.position.y,
  };
}
function jumpStep(m, dt) {
  const J = m.userData.jumper;
  J.timer -= dt;
  if (J.phase === 'wait' && J.timer <= 0) { J.phase = 'crouch'; J.timer = 0.13; }
  if (J.phase === 'crouch') {
    J.squash += (-0.22 - J.squash) * Math.min(1, dt * 30);
    if (J.timer <= 0) {
      const height = 0.55 + Math.random() * 0.6;
      J.vy = Math.sqrt(2 * GRAVITY * height);
      J.phase = 'air'; J.squashV = 6;
    }
  }
  if (J.phase === 'air') {
    J.vy -= GRAVITY * dt; J.y += J.vy * dt;
    if (J.y <= 0) {
      J.y = 0; J.phase = 'wait';
      J.squashV = -Math.min(9, Math.abs(J.vy) * 0.9);
      J.timer = Math.random() < 0.3 ? 0.08 : 0.35 + Math.random() * 1.1;   // sometimes a quick double hop
      J.vy = 0;
    }
  }
  if (J.phase !== 'crouch') {
    // A damped spring pulls the squash back to normal.
    J.squashV += (-90 * J.squash - 9 * J.squashV) * dt;
    J.squash += J.squashV * dt;
    // Stretch a little while rising fast, as cartoons do.
    if (J.phase === 'air') J.squash += (Math.max(-0.05, Math.min(0.12, J.vy * 0.012)) - J.squash) * Math.min(1, dt * 12);
  }
  const sy = 1 + J.squash, sxz = 1 / Math.sqrt(sy);
  m.scale.set(sxz, sy, sxz);
  // Take out the clip's own float so only our jump moves the body.
  m.updateMatrixWorld(true);
  const lift = m.worldToLocal(J.hips.getWorldPosition(J.v)).y - J.base;
  m.position.y = J.groundY + J.y - lift * sy;
}

function makeTitleScene() {
  const s = new THREE.Scene();
  // Sky: deep blue at the top fading to a warm horizon.
  const sky = document.createElement('canvas'); sky.width = 2; sky.height = 256;
  const g = sky.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4f9ff0'); grad.addColorStop(0.55, '#9fd3ff'); grad.addColorStop(1, '#ffe7c4');
  g.fillStyle = grad; g.fillRect(0, 0, 2, 256);
  const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
  s.background = skyTex;
  s.fog = new THREE.Fog('#cfe8ff', 26, 60);
  s.add(new THREE.HemisphereLight('#e8f4ff', '#5a8a4a', 1.25));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.set(-6, 12, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 40 });
  s.add(sun);
  const rim = new THREE.DirectionalLight('#b9d8ff', 0.8); rim.position.set(6, 5, -10); s.add(rim);
  // The island: grass on top, a rocky rim, flowers and tufts.
  const grassTex = new THREE.TextureLoader().load('assets/textures/ground_grass.webp');
  grassTex.colorSpace = THREE.SRGBColorSpace; grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(5, 5);
  const top = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.9 }));
  top.rotation.x = -Math.PI / 2; top.receiveShadow = true; s.add(top);
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(16, 13, 4, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 1 }));
  cliff.position.y = -2; s.add(cliff);
  const spots = (n, rMin, rMax, avoid) => {
    const out = [];
    while (out.length < n) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (avoid && avoid(x, z)) continue;
      out.push({ x, y: 0, z, rot: Math.random() * 6, scale: 0.8 + Math.random() * 0.6 });
    }
    return out;
  };
  const clearStage = (x, z) => (Math.abs(x) < 7 && z > -1 && z < 5) || z > 5.5 || Math.hypot(x + 10, z + 12) < 5;
  for (const f of ['flower_a', 'flower_b', 'flower_c']) { const sc = makeScatter('scenery/gecko/' + f, spots(70, 2, 15, clearStage), { shadows: false }); sc.update(0, 0); s.add(sc.group); }
  for (const f of ['grass_tuft_a', 'grass_tuft_b']) { const sp = spots(70, 3, 15.5, clearStage); sp.forEach(o => { o.scale *= 0.55; }); const sc = makeScatter('scenery/gecko/' + f, sp, { shadows: false }); sc.update(0, 0); s.add(sc.group); }
  for (const [x, z, k] of [[-13, -2, 'a'], [10.5, -6, 'b'], [-13.5, 3, 'b'], [13.5, 2, 'a'], [3, -13, 'a'], [9, -12, 'b'], [-2, -14, 'b']]) {
    const tree = makeModel('scenery/gecko/tree_lush_' + k); tree.position.set(x, 0, z); tree.rotation.y = Math.random() * 6; tree.scale.setScalar(1.2); s.add(tree);
  }
  const house = makeModel('houses/house_gear'); house.position.set(-10, 0, -12); house.rotation.y = 0.5; s.add(house);
  // The cast. Villains and the robot stand behind the six friends.
  const cast = [];
  const put = (name, x, z, rotY, mood, y) => { const m = makeModel(name); m.position.set(x, y || 0, z); m.rotation.y = rotY || 0; m.userData.titleMood = mood; s.add(m); cast.push(m); return m; };
  put('robot', -6.2, -2.5, 0.5, 'wave');
  put('dragon', 5.8, -3, -0.4, 'taunt');
  put('snowgun', -3.4, -4.5, 0.3, 'idle');
  put('wizard', 3.2, -5, -0.2, 'taunt');
  put('yoyo', 0, -5.2, 0, 'idle');
  const ghost = put('ghost', -8.6, -10.4, 0.4, 'wave', 7.5);
  ghost.userData.float = true;
  const moods = ['cheer', 'wave', 'cheer', 'idle', 'wave', 'cheer'];
  CHARACTERS.forEach((ch, i) => {
    const x = -5 + i * 2, z = 2.6 - Math.abs(x) * 0.18;
    const m = put(ch.id, x, z, -x * 0.06, moods[i]);
    if (moods[i] === 'cheer') makeJumper(m);
  });
  // A kart doing laps behind the line-up.
  const kart = makeVehicle('kart', CHARACTERS[0]);
  const driver = makeModel('pip'); kart.userData.seat.add(driver);
  s.add(kart);
  s.userData = { cast, kart, driver, sun };
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
      // Use the painted portrait if there is one; keep the simple drawing if not.
      const img = new Image();
      img.className = 'portrait'; img.alt = '';
      img.onload = () => b.querySelector('canvas').replaceWith(img);
      img.src = 'assets/portraits/' + ch.id + '.webp';
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
    const sel = i === state.selectIndex;
    cards[i].classList.toggle('selected', sel);
    const canvas = cards[i].querySelector('canvas');
    if (!canvas) continue;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 128, 128);
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
  return enterWorld(true);
}

// Load the current world's models, build it, and put the car in it.
async function enterWorld(greet) {
  state.screen = 'loading';
  show('loading', true);
  await loadModels(worldModels(WORLDS[state.worldIndex]));
  if (worldScene) disposeScene(worldScene);
  buildCurrentWorld();
  const w = world.data;
  // Coming back to a saved game: start near where you got to.
  const spot = state.flags.houseDone ? w.checkpoints[w.checkpoints.length - 1].at : state.flags.switches.length ? w.checkpoints[0].at : w.start;
  placeCar(spot[0], spot[1]);
  state.checkpoint = spot;
  refreshPowers();
  state.hearts = state.stats.hearts;
  state.jump = null; state.teleLock = null; state.robotNear = -1;
  state.hop = null; state.turbo = 0;
  for (const k in state.cool) state.cool[k] = 0;
  setScreen('world');
  updateHearts();
  view = { scene: worldScene, camera };
  if (greet) {
    const v = VEHICLES[w.vehicle];
    setTimeout(() => toast('World ' + (state.worldIndex + 1) + ': ' + w.name + '! You are driving the ' + v.name + '. 📱 Call a robot if you get lost.', 5.5), 600);
  }
}

// Free a world's graphics memory, but keep parts shared with the loaded model files.
function disposeScene(scene) {
  scene.traverse(o => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (o.material) [].concat(o.material).forEach(m => {
      if (m.userData.shared) return;
      if (m.map && !m.map.userData.shared) m.map.dispose();
      m.dispose();
    });
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
  driver = makeModel(state.charId);
  car.userData.seat.add(driver);
  if (th.night || VEHICLES[w.vehicle].light) {
    const lamp = new THREE.PointLight('#fff2c0', th.night ? 60 : 20, 22);
    lamp.position.set(0, 2.5, 2); car.add(lamp);
  }
  worldScene.add(car);
  // The Wizard Hat bubble, and the laser beam (hidden until used).
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 16), new THREE.MeshStandardMaterial({ color: '#9fe3ff', emissive: '#3aa8ff', emissiveIntensity: 0.4, transparent: true, opacity: 0.22, depthWrite: false }));
  bubble.position.y = 1.1; bubble.visible = false;
  car.add(bubble); car.userData.bubble = bubble;
  worldScene.userData.laser = makeLaser(worldScene);
}

function placeCar(x, z) {
  Object.assign(state.car, { x, z, vx: 0, vz: 0 });
  snapCamera = true;
}

// ---------- Driving ----------

function updateDriving(dt) {
  const c = state.car, m = move(), v = VEHICLES[world.data.vehicle];
  const top = state.stats.carSpeed * v.speed * (state.turbo > 0 ? 1.7 : 1);
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
    c.turn = d;
  }
  engine(speed / top);
}

function hurt(fromX, fromZ) {
  if (state.safe > 0 || state.jump || state.hop) return;
  const c = state.car, dx = c.x - fromX, dz = c.z - fromZ, d = Math.hypot(dx, dz) || 1;
  // The Wizard Hat bubble takes the bump instead of a heart.
  if (state.powers.shield && state.cool.shield <= 0) {
    state.cool.shield = POWERS.shield.wait; state.safe = 1.2;
    sound('pop');
    c.vx = dx / d * 18; c.vz = dz / d * 18;
    return;
  }
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
  c.vx = dx / d * 22; c.vz = dz / d * 22;
}

function checkWorldThings() {
  const c = state.car, w = world.data;
  world.hazards.forEach(h => { if (h.r && !(h.stun > 0) && Math.hypot(c.x - h.x, c.z - h.z) < h.r + CAR_R) hurt(h.x, h.z); });
  world.shots.forEach(s => { if (!s.hit && !state.hop && Math.hypot(c.x - s.x, c.z - s.z) < s.r + CAR_R) { s.hit = true; hurt(s.x - s.vx, s.z - s.vz); } });
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
  const items = ownedItems().map(it => it.icon + ' ' + it.name + (POWERS[it.power] ? ' (' + POWERS[it.power].icon + (POWERS[it.power].key ? ' ' + POWERS[it.power].key : '') + ')' : ''));
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
      const power = POWERS[item.power];
      $('banner-text').textContent = 'You got the ' + item.name + '! ' + item.icon + (power ? ' ' + power.text : '');
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
  refreshPowers();
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
    await enterWorld(true);
  } else {
    clearSave();
    await showHome();
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
  const colors = ['#ff6fa8', '#ffd23f', '#ffffff', '#b583ff', '#ff8c42'];
  const spots = (n, rMin, rMax) => Array.from({ length: n }, () => { const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin); return { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, rot: Math.random() * 6, scale: 0.8 + Math.random() * 0.5 }; });
  for (const f of ['flower_a', 'flower_b', 'flower_c']) { const sc = makeScatter('scenery/gecko/' + f, spots(140, 3, 30), { shadows: false }); sc.update(0, 0); s.add(sc.group); }
  for (const g of ['grass_tuft_a', 'grass_tuft_b']) { const sp = spots(90, 6, 30); sp.forEach(o => { o.scale *= 0.55; }); const sc = makeScatter('scenery/gecko/' + g, sp, { shadows: false }); sc.update(0, 0); s.add(sc.group); }
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, tree = makeModel('scenery/gecko/' + (i % 2 ? 'tree_lush_a' : 'tree_lush_b'));
    tree.position.set(Math.cos(a) * 22, 0, Math.sin(a) * 22); tree.rotation.y = -a; s.add(tree);
  }
  const home = makeModel('scenery/gecko/gecko_house'); home.position.set(-2, 0, -16); s.add(home);
  const blanket = makeModel('scenery/gecko/picnic_blanket'); blanket.scale.setScalar(1.6); blanket.position.set(0, 0.02, -1); s.add(blanket);
  const friends = [charOf()].concat(CHARACTERS.filter(c => c.id !== state.charId)).map((ch, i) => {
    const m = makeModel(ch.id, i === 0 ? 1.4 : 1.15);
    const a = (i - 2.5) * 0.45;
    m.position.set(Math.sin(a) * 5, 0, Math.cos(a) * 5 - 3);
    if (i === 0) m.position.set(0, 0, 1);
    s.add(m); makeJumper(m); return m;
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

async function showHome() {
  await loadModels(['scenery/gecko/flower_a', 'scenery/gecko/flower_b', 'scenery/gecko/flower_c', 'scenery/gecko/grass_tuft_a', 'scenery/gecko/grass_tuft_b',
    'scenery/gecko/tree_lush_a', 'scenery/gecko/tree_lush_b', 'scenery/gecko/gecko_house', 'scenery/gecko/picnic_blanket']);
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
    for (const name in POWERS) if (POWERS[name].keys && POWERS[name].keys.includes(key)) usePower(name);
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
  car.position.set(c.x, ground + (state.jump ? state.jump.y : 0) + hopHeight(), c.z);
  car.userData.bubble.visible = !!state.powers.shield && state.cool.shield <= 0;
  if (car.userData.bubble.visible) car.userData.bubble.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
  // Tilt the car to match the hill.
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const pitch = Math.atan2(hAt(c.x + fx, c.z + fz) - hAt(c.x - fx, c.z - fz), 2);
  const roll = Math.atan2(hAt(c.x + fz, c.z - fx) - hAt(c.x - fz, c.z + fx), 2);
  car.rotation.set(-pitch, c.heading, roll, 'YXZ');
  car.visible = !(state.safe > 0 && Math.floor(t * 10) % 2 === 0);
  const speed = Math.hypot(c.vx, c.vz);
  const turn = c.turn || 0;
  car.userData.animate(t, speed, Math.max(-1, Math.min(1, turn * 2)));
  c.turn = 0;
  if (car.userData.rainbow) car.userData.rainbow.forEach(m => m.color.setHSL((t * 0.1) % 1, 0.8, 0.6));
  const hurtNow = state.safe > state.stats.safeTime - 0.9;
  driver.userData.animate(t, hurtNow ? 'oops' : state.jump || state.hop ? 'happy' : turn > 0.08 ? 'drive_left' : turn < -0.08 ? 'drive_right' : 'drive');
}

let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  state.time += dt;
  const t = state.time;
  if (state.screen === 'title' || state.screen === 'select') {
    // A slow, gentle sway (never all the way around, so we always see faces).
    const sway = Math.sin(t * 0.18);
    camera.position.set(sway * 2.5, 2.7 + Math.sin(t * 0.25) * 0.25, 11.5);
    camera.lookAt(sway * 0.6, 3.1, -2);
    if (titleScene) {
      const T = titleScene.userData;
      T.cast.forEach(m => {
        m.userData.animate(t, m.userData.titleMood || 'idle');
        if (m.userData.jumper) jumpStep(m, dt);
        if (m.userData.float) m.position.y = 7.3 + Math.sin(t * 1.6) * 0.25;
      });
      const a = t * 0.45, kx = Math.cos(a) * 10, kz = -4.5 + Math.sin(a) * 3.2;
      T.kart.position.set(kx, 0, kz);
      T.kart.rotation.y = Math.atan2(-Math.sin(a) * 10, Math.cos(a) * 3.2);
      T.kart.userData.animate(t, 8, 0.6);
      T.driver.userData.animate(t, 'drive_left');
    }
    if (state.screen === 'select') drawCards();
  }
  if (state.screen === 'home' && homeScene) {
    const a = t * 0.1;
    camera.position.set(Math.sin(a) * 10, 3.5, Math.cos(a) * 10);
    camera.lookAt(0, 3, 0);
    homeScene.userData.friends.forEach((m, i) => { m.userData.animate(t + i * 0.3, 'happy'); if (m.userData.jumper) jumpStep(m, dt); });
    homeScene.userData.confetti.forEach((p, i) => { p.position.y -= dt * (1.5 + (i % 5) * 0.3); p.rotation.x += dt * 3; p.rotation.y += dt * 2; if (p.position.y < 0) p.position.y = 12; });
  }
  if (world && worldScene && (state.screen === 'world' || state.screen === 'entering' || state.screen === 'leaving')) {
    const paused = state.overlay || state.screen !== 'world' || state.cutscene;
    if (!paused) {
      state.safe = Math.max(0, state.safe - dt);
      updatePowers(dt);
      if (state.jump) updateJump(dt);
      else { updateDriving(dt); checkWorldThings(); }
    } else engine(0);
    if (!state.overlay && world) world.update(dt, t, state.car, state.stats.villainSpeed);
    if (world) { placeCarMesh(t); const L = worldScene.userData.laser; if (L.on) L.follow(muzzle(), state.car.heading); L.update(t, dt); updateWorldCamera(dt); drawPowerButtons(); }
  }
  if (state.screen === 'house' && room) room.update(dt, t);
  if (view) renderer.render(view.scene, view.camera);
  requestAnimationFrame(frame);
}

// Handy for poking at the game from the browser console.
window.game = {
  state, placeCar, sound, WORLDS,
  get world() { return world; }, get room() { return room; }, get car() { return car; },
  goToWorld(i) { return jumpTo(i, false); },
};

// ---------- Test mode ----------
// Open the game with ?test on the end of the address (for example
// https://dslichtenberg.github.io/robot-land/?test). Then Ctrl+1 to Ctrl+6
// jump straight to that world and Ctrl+7 to the Gecko Land ending, from any
// screen. Alt works too, for browsers that keep Ctrl+number for tabs.
// Jumping never touches the saved game.
const TEST_MODE = new URLSearchParams(location.search).has('test');

let jumping = false;
async function jumpTo(i, greet) {
  if (jumping) return;
  jumping = true;
  try {
    if (!state.charId) { state.charId = CHARACTERS[0].id; state.stats = statsFor(state.charId); }
    if (state.overlay) closeOverlay();
    show('banner', false); show('speech', false);
    engine(0);
    if (room) { disposeScene(room.scene); room = null; }
    if (homeScene) { disposeScene(homeScene); homeScene = null; }
    if (i >= WORLDS.length) {
      await showHome();
    } else {
      state.worldIndex = i;
      state.flags = { switches: [], houseDone: false };
      await enterWorld(greet);
    }
  } finally { jumping = false; }
}

if (TEST_MODE) {
  window.addEventListener('keydown', (e) => {
    const m = /^Digit([1-7])$/.exec(e.code);
    if (!m || !(e.ctrlKey || e.altKey) || e.repeat) return;
    e.preventDefault();
    if (['loading', 'entering', 'leaving'].includes(state.screen)) return;
    jumpTo(+m[1] - 1, true);
  });
  const badge = document.createElement('div');
  badge.id = 'test-badge';
  badge.textContent = 'Test mode: Ctrl+1 to 6 = worlds, Ctrl+7 = home';
  document.body.append(badge);
}

resize();
// Load the cast, then fade from the loading screen to the launch screen.
loadModels([...CORE_MODELS, ...TITLE_MODELS]).then(async () => {
  await fade(true);
  showTitle();
  requestAnimationFrame(frame);
  setTimeout(() => fade(false), 250);
});
