// rooms/lava.js
// House 1: the Dragon's lava room.
//
// A path of stepping stones lights up, one stone at a time. Then the lights
// go out and you hop across from memory. Step on a wrong stone and it sinks,
// and you start that round again (no hearts lost). Three rounds, each longer.
// In rounds 2 and 3 the stones get wobbly: stand still too long and they sink,
// so you have to keep hopping. Miss a round three times and the ghost helps
// by leaving the path glowing a little.

import * as THREE from 'three';
import { makeModel, makeItem } from '../models.js';
import { move } from '../input.js';

const COLS = 5, ROWS = 6, GAP = 2.2;
const ROUNDS = [
  { extraSide: 1, showStep: 0.6, sinkAfter: 0 },
  { extraSide: 3, showStep: 0.5, sinkAfter: 2.2 },
  { extraSide: 5, showStep: 0.42, sinkAfter: 1.5 },
];

const stoneX = (c) => (c - (COLS - 1) / 2) * GAP;
const stoneZ = (r) => r < 0 ? 2.8 : r >= ROWS ? -ROWS * GAP - 0.8 : -r * GAP;

// A path from the front row to the back row, with some sideways steps.
function makePath(extraSide) {
  const path = [];
  let c = Math.floor(Math.random() * COLS), sideLeft = extraSide;
  const used = new Set();
  for (let r = 0; r < ROWS; r++) {
    path.push([c, r]); used.add(c + ',' + r);
    const rowsLeft = ROWS - 1 - r;
    let steps = rowsLeft === 0 ? sideLeft : Math.min(sideLeft, Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 2) : 0);
    const dir = c <= 1 ? 1 : c >= COLS - 2 ? -1 : (Math.random() < 0.5 ? -1 : 1);
    while (steps > 0 && c + dir >= 0 && c + dir < COLS && !used.has((c + dir) + ',' + r)) {
      c += dir; steps--; sideLeft--;
      path.push([c, r]); used.add(c + ',' + r);
    }
  }
  return path;
}

// ctx: { player (model), stats, sound(name), say(text), status(text), onSolved() }
export function createLavaRoom(ctx) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2b2140');
  scene.fog = new THREE.Fog('#2b2140', 22, 40);
  scene.add(new THREE.HemisphereLight('#c9b8ff', '#552200', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(4, 14, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -18 });
  scene.add(sun);

  // Room, lava, start and goal ledges
  const room = new THREE.Mesh(new THREE.BoxGeometry(24, 14, 34), new THREE.MeshStandardMaterial({ color: '#4a3b78', side: THREE.BackSide }));
  room.position.set(0, 5, -6); scene.add(room);
  const lavaMat = new THREE.MeshStandardMaterial({ color: '#ff5a1f', emissive: '#c43a00' });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(24, 34), lavaMat);
  lava.rotation.x = -Math.PI / 2; lava.position.set(0, -0.6, -6); scene.add(lava);
  const ledgeMat = new THREE.MeshStandardMaterial({ color: '#7a6a9c' });
  for (const z of [stoneZ(-1) + 0.6, stoneZ(ROWS) - 1.6]) {
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 4), ledgeMat);
    ledge.position.set(0, -0.5, z); ledge.receiveShadow = true; scene.add(ledge);
  }
  // Glowing torches on the walls
  for (const [x, z] of [[-11.5, -2], [11.5, -2], [-11.5, -12], [11.5, -12]]) {
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffa000' }));
    flame.position.set(x, 4, z); scene.add(flame);
  }

  // Stones
  const stones = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.6, 6), new THREE.MeshStandardMaterial({ color: '#8d8a99', roughness: 0.9 }));
    m.position.set(stoneX(c), -0.3, stoneZ(r));
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    stones.push({ c, r, mesh: m, sink: 0, sinking: false, stood: 0 });
  }
  const stoneAt = (c, r) => stones.find(s => s.c === c && s.r === r);

  const dragon = makeModel('dragon', 3.2);
  dragon.position.set(0, 0, stoneZ(ROWS) - 2.2);
  scene.add(dragon);
  const ghost = makeModel('ghost', 1.6);
  ghost.position.set(-8, 3, 0); ghost.rotation.y = 0.6;
  scene.add(ghost);
  const player = ctx.player;
  player.rotation.set(0, Math.PI, 0);
  scene.add(player);

  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100);
  camera.position.set(0, 12, 10);
  camera.lookAt(0, -1, -6);

  // ---------- Game state for this room ----------
  const R = {
    phase: 'intro', t: 0, round: 0, fails: 0, path: [], safe: new Set(), showIndex: -1,
    pos: { c: 2, r: -1 }, hop: null, dragonHits: 0, fallT: 0,
  };
  let hearts = 3;
  const statusLine = () => ctx.status('🐲 ' + '❤️'.repeat(hearts) + '🖤'.repeat(3 - hearts) + '   Round ' + (R.round + 1) + ' of 3');

  function placePlayer() {
    player.position.set(stoneX(R.pos.c), 0, stoneZ(R.pos.r));
  }
  function resetStones() {
    stones.forEach(s => {
      s.sink = 0; s.sinking = false; s.stood = 0;
      s.mesh.position.y = -0.3; s.mesh.rotation.set(0, 0, 0);
      s.mesh.material.emissive.set('#000000'); s.mesh.material.color.set('#8d8a99');
    });
  }
  function startRound(newPath) {
    if (newPath) {
      R.path = makePath(ROUNDS[R.round].extraSide);
      R.safe = new Set(R.path.map(([c, r]) => c + ',' + r));
    }
    resetStones();
    R.pos = { c: R.path[0][0], r: -1 }; R.hop = null;
    placePlayer();
    player.visible = true;
    R.phase = 'show'; R.t = 0; R.showIndex = -1;
    ctx.say('👀 Watch the path!');
    statusLine();
  }

  function land() {
    const { c, r } = R.pos;
    if (r >= ROWS) { winRound(); return; }
    if (r < 0) return;
    const s = stoneAt(c, r);
    if (R.safe.has(c + ',' + r)) {
      s.mesh.material.emissive.set('#1f9a3a');
      s.stood = 0;
      ctx.sound('tick');
    } else {
      s.sinking = true;
      fall();
    }
  }
  function fall() {
    R.phase = 'fall'; R.t = 0; R.fails++;
    ctx.sound('buzz');
    ctx.say(R.fails >= 3 ? '👻 Boo-hoo! I will help. The path will glow a tiny bit.' : 'Oops! Splash! Try again!');
  }
  function winRound() {
    R.phase = 'won'; R.t = 0; R.fails = 0;
    hearts--; ctx.sound('ding');
    statusLine();
    ctx.say(hearts > 0 ? 'Ouch! Lucky hop! Next path is longer!' : 'Nooo!');
  }

  // ---------- Every frame ----------
  function update(dt, t) {
    R.t += dt;
    dragon.userData.animate(t);
    ghost.userData.animate(t);
    lavaMat.emissive.setHSL(0.04, 1, 0.3 + Math.sin(t * 2) * 0.06);
    if (R.phase === 'intro') {
      if (R.t > 3.5) startRound(true);
    } else if (R.phase === 'show') {
      const step = ROUNDS[R.round].showStep, i = Math.floor(R.t / step) - 1;
      if (i !== R.showIndex && i >= 0 && i < R.path.length) {
        R.showIndex = i;
        const s = stoneAt(R.path[i][0], R.path[i][1]);
        s.mesh.material.emissive.set('#ffd23f');
        ctx.sound('tick');
      }
      if (R.t > step * (R.path.length + 2)) {
        stones.forEach(s => s.mesh.material.emissive.set(R.fails >= 3 && R.safe.has(s.c + ',' + s.r) ? '#3a3010' : '#000000'));
        R.phase = 'play'; R.t = 0;
        ctx.say('🦎 Go! Hop across!');
      }
    } else if (R.phase === 'play') {
      updatePlay(dt);
    } else if (R.phase === 'fall') {
      player.position.y -= dt * 4;
      if (R.t > 1.3) startRound(false);
    } else if (R.phase === 'won') {
      dragon.position.x = Math.sin(t * 40) * 0.2 * Math.max(0, 1 - R.t);
      if (R.t > 1.8) {
        if (hearts > 0) { R.round++; startRound(true); }
        else { R.phase = 'defeat'; R.t = 0; }
      }
    } else if (R.phase === 'defeat') {
      dragon.rotation.y += dt * 14;
      dragon.scale.setScalar(Math.max(0.01, 1 - R.t / 1.6));
      if (R.t > 1.6) {
        dragon.visible = false;
        R.item = makeItem('key');
        R.item.position.set(0, 1.5, stoneZ(ROWS) - 2);
        scene.add(R.item);
        stones.forEach(s => { s.mesh.material.emissive.set('#806010'); s.mesh.position.y = -0.3; });
        R.phase = 'walk'; R.t = 0;
        ctx.say('');
        R.walkFrom = player.position.clone();
      }
    } else if (R.phase === 'walk') {
      const k = Math.min(1, R.t / 2.5);
      player.position.set(R.walkFrom.x * (1 - k), 0, R.walkFrom.z + (stoneZ(ROWS) - 0.5 - R.walkFrom.z) * k);
      player.userData.animate(t, 'walk');
      R.item.rotation.y += dt * 3;
      if (k >= 1) { R.phase = 'done'; ctx.sound('chime'); ctx.onSolved(); }
      return;
    } else if (R.phase === 'done') {
      R.item.rotation.y += dt * 3;
      R.item.position.y = 2.4 + Math.sin(t * 3) * 0.2;
      R.item.position.z = player.position.z;
      player.userData.animate(t, 'happy');
      return;
    }
    // Sinking stones
    stones.forEach(s => {
      if (s.sinking) { s.sink += dt; s.mesh.position.y = -0.3 - s.sink * 2; s.mesh.rotation.z = s.sink; }
    });
    player.userData.animate(t, R.hop ? 'walk' : null);
  }

  function updatePlay(dt) {
    const rule = ROUNDS[R.round];
    if (R.hop) {
      R.hop.k += dt / ctx.stats.hopTime;
      const k = Math.min(1, R.hop.k);
      player.position.x = R.hop.fx + (stoneX(R.pos.c) - R.hop.fx) * k;
      player.position.z = R.hop.fz + (stoneZ(R.pos.r) - R.hop.fz) * k;
      player.position.y = Math.sin(k * Math.PI) * 0.7;
      if (R.hop.k >= 1) { R.hop = null; land(); }
      return;
    }
    // Wobbly stones in later rounds: do not stand still too long.
    if (rule.sinkAfter && R.pos.r >= 0 && R.pos.r < ROWS) {
      const s = stoneAt(R.pos.c, R.pos.r);
      s.stood += dt;
      s.mesh.rotation.z = s.stood > rule.sinkAfter * 0.5 ? Math.sin(s.stood * 30) * 0.08 : 0;
      if (s.stood > rule.sinkAfter) { s.sinking = true; fall(); return; }
    }
    const m = move();
    if (Math.max(Math.abs(m.x), Math.abs(m.y)) < 0.5) return;
    let { c, r } = R.pos;
    if (Math.abs(m.x) > Math.abs(m.y)) c += Math.sign(m.x); else r += Math.sign(m.y);
    if (c < 0 || c >= COLS || r < -1 || r > ROWS) return;
    if (r === ROWS && R.pos.r !== ROWS - 1) return;
    R.hop = { fx: player.position.x, fz: player.position.z, k: 0 };
    player.rotation.y = Math.atan2(c - R.pos.c, R.pos.r - r);
    if (r !== R.pos.r || c !== R.pos.c) {
      const old = R.pos.r >= 0 && R.pos.r < ROWS && stoneAt(R.pos.c, R.pos.r);
      if (old) old.stood = 0;
    }
    R.pos = { c, r };
    ctx.sound('hop');
  }

  placePlayer();
  ctx.say('🐲 You will never cross my lava, little gecko!');
  statusLine();
  return { scene, camera, update, room: R };
}
