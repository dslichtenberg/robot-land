// rooms/mirrors.js
// Houses 4 and 6: the Wizard's mirror rooms.
//
// A magic light shoots in from the left wall. Bounce it off mirrors so it hits
// the crystal. Bump into a mirror to flip it ( / becomes \ ). You have until
// the candle burns down; if it runs out, the wizard mixes up the mirrors and
// the candle lights again. Some mirrors are tricks that are not on the path.
// In World 6 the wizard also throws sparkles down the columns: if one hits
// you, you go back to the start (the mirrors stay as you left them).
// Every puzzle is made fresh, built backward from a real solution.

import * as THREE from 'three';
import { roomBase, gridMover, makeEnding, mat, tileFloor } from './common.js';
import { makeModel } from '../models.js';
const placeAt = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };

export const MIRRORS_EASY = {
  n: 7, sparkEvery: 0,
  rounds: [{ turns: 2, decoys: 1, rocks: 3, time: 60 }, { turns: 3, decoys: 2, rocks: 4, time: 55 }, { turns: 3, decoys: 3, rocks: 5, time: 50 }],
};
export const MIRRORS_HARD = {
  n: 8, sparkEvery: 3,
  rounds: [{ turns: 3, decoys: 3, rocks: 4, time: 55 }, { turns: 4, decoys: 3, rocks: 5, time: 50 }, { turns: 5, decoys: 4, rocks: 6, time: 50 }],
};

const flip = (t) => t === '/' ? '\\' : '/';
const bounce = (t, [dc, dr]) => t === '/' ? [dr, dc] : [-dr, -dc];

// Follow the light. Returns the points it passes and whether it hits the crystal.
export function traceBeam(p) {
  let c = 0, r = p.row, d = [1, 0];
  const pts = [[-1, p.row]];
  for (let steps = 0; steps < 200; steps++) {
    if (c < 0 || c >= p.n || r < 0 || r >= p.n) { pts.push([c, r]); return { pts, hit: c === p.crystal[0] && r === p.crystal[1] }; }
    const k = c + ',' + r;
    if (p.rocks.has(k)) { pts.push([c, r]); return { pts, hit: false }; }
    if (p.mirrors.has(k)) { pts.push([c, r]); d = bounce(p.mirrors.get(k), d); }
    c += d[0]; r += d[1];
  }
  return { pts, hit: false };
}

export function makePuzzle(n, rule) {
  for (let tries = 0; tries < 3000; tries++) {
    const row = 1 + Math.floor(Math.random() * (n - 2));
    const used = new Set(), mirrors = new Map(), solution = new Map();
    let c = 0, r = row, d = [1, 0], ok = true;
    for (let t = 0; t <= rule.turns && ok; t++) {
      const last = t === rule.turns;
      const len = last ? 99 : 1 + Math.floor(Math.random() * (n - 2));
      for (let i = 0; i < len; i++) {
        if (c < 0 || c >= n || r < 0 || r >= n) { if (!last) ok = false; break; }
        if (used.has(c + ',' + r)) { ok = false; break; }
        used.add(c + ',' + r);
        if (i < len - 1 || last) { c += d[0]; r += d[1]; }
      }
      if (!ok || last) break;
      const turns = d[0] ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
      const nd = turns[Math.floor(Math.random() * 2)];
      const type = bounce('/', d)[0] === nd[0] && bounce('/', d)[1] === nd[1] ? '/' : '\\';
      solution.set(c + ',' + r, type);
      d = nd; c += d[0]; r += d[1];
    }
    if (!ok || solution.size !== rule.turns) continue;
    const crystal = [c, r];
    if (crystal[0] === -1 || crystal[1] === -1) continue;   // not on the left wall, or behind the words at the bottom
    solution.forEach((t, k) => mirrors.set(k, t));
    const free = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!used.has(x + ',' + y)) free.push(x + ',' + y);
    free.sort(() => Math.random() - 0.5);
    const rocks = new Set(free.splice(0, rule.rocks));
    free.splice(0, rule.decoys).forEach(k => mirrors.set(k, Math.random() < 0.5 ? '/' : '\\'));
    const p = { n, row, crystal, rocks, mirrors, solution };
    // You must be able to walk next to every mirror on the path.
    const blocked = (k) => rocks.has(k) || mirrors.has(k);
    const startCell = free.find(k => k.endsWith(',0') && !blocked(k));
    if (!startCell) continue;
    const reach = new Set([startCell]), queue = [startCell];
    while (queue.length) {
      const [x, y] = queue.shift().split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = (x + dx) + ',' + (y + dy);
        if (x + dx < 0 || x + dx >= n || y + dy < 0 || y + dy >= n || reach.has(k) || blocked(k)) continue;
        reach.add(k); queue.push(k);
      }
    }
    const touchable = [...solution.keys()].every(k => {
      const [x, y] = k.split(',').map(Number);
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((x + dx) + ',' + (y + dy)));
    });
    if (!touchable) continue;
    p.start = startCell.split(',').map(Number);
    scramble(p);
    return p;
  }
  return null;
}

// Mix up the mirrors so the light does not already hit the crystal.
function scramble(p) {
  do { p.mirrors.forEach((t, k) => p.mirrors.set(k, Math.random() < 0.5 ? '/' : '\\')); } while (traceBeam(p).hit);
}

export function createMirrorRoom(ctx, cfg) {
  const N = cfg.n, GAP = 2;
  const sx = (c) => (c - (N - 1) / 2) * GAP, sz = (r) => -r * GAP + 2;
  const base = roomBase({ theme: 'mirror', wall: '#2b2150', villain: 'wizard', villainZ: sz(N) - 1.5 });
  const { scene } = base;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(N * GAP, 0.5, N * GAP), mat('#3a3060'));
  floor.position.set(0, -0.35, sz((N - 1) / 2)); floor.receiveShadow = true; scene.add(floor);
  tileFloor(scene, 'magic', sx(0) - GAP / 2, sz(N - 1) - GAP / 2, sx(N - 1) + GAP / 2, sz(0) + GAP / 2, 0, GAP);

  // The candle model: its 'wax' part shrinks as time runs out.
  const candle = new THREE.Group();
  const candleModel = makeModel('rooms/candle_big');
  candleModel.scale.setScalar(1.8); candle.add(candleModel);
  const wax = candleModel.userData.part('wax') || candleModel;
  const waxRest = wax.scale.y;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat('#ffd23f', { emissive: '#ff9000' }));
  candle.add(flame);
  candle.position.set(sx(N - 1) + 3.2, 0, sz(0));
  scene.add(candle);

  const player = ctx.player;
  scene.add(player);
  const mover = gridMover(player, (c, r) => [sx(c), sz(r)], ctx.stats.hopTime);
  const ending = makeEnding(base, player, ctx);
  const stuff = new THREE.Group(); scene.add(stuff);
  const beam = new THREE.Group(); scene.add(beam);
  const lane = new THREE.Mesh(new THREE.BoxGeometry(GAP * 0.9, 0.05, N * GAP), mat('#ffe14d', { emissive: '#ffb300', transparent: true, opacity: 0.4 }));
  lane.position.set(0, 0.06, sz((N - 1) / 2)); lane.visible = false; scene.add(lane);
  const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), mat('#ffe14d', { emissive: '#ffb300' }));
  spark.visible = false; scene.add(spark);

  const R = { phase: 'intro', t: 0, round: 0, p: null, left: 0, mirrorMeshes: new Map(), crystal: null, spark: null, sparkTimer: 0, calm: false };
  const status = () => ctx.status('🧙 Round ' + (R.round + 1) + ' of 3   🕯️ ' + Math.ceil(R.left));

  function build() {
    stuff.clear(); R.mirrorMeshes.clear();
    const p = R.p = makePuzzle(N, cfg.rounds[R.round]);
    p.rocks.forEach(k => {
      const [c, r] = k.split(',').map(Number);
      // A stone block that stops the light (a wall piece squashed into a cube).
      const rock = makeModel('rooms/room_wall_mirror');
      rock.scale.set(0.8, 0.4, 6.5); rock.position.set(sx(c) - 0.8, 0, sz(r) + 0.78); stuff.add(rock);
    });
    p.mirrors.forEach((type, k) => {
      const [c, r] = k.split(',').map(Number), g = new THREE.Group();
      const stand = makeModel('rooms/mirror_stand');
      stand.traverse(o => { if (o.isMesh && o.material.name === 'mirror_glass') { o.material.emissive = new THREE.Color('#5aa0d0'); o.material.emissiveIntensity = 0.6; } });
      g.add(stand);
      g.position.set(sx(c), 0, sz(r));
      g.rotation.y = type === '/' ? Math.PI / 4 : -Math.PI / 4;
      g.userData.goal = g.rotation.y;
      stuff.add(g); R.mirrorMeshes.set(k, g);
    });
    const shooter = makeModel('rooms/beam_emitter');
    shooter.scale.setScalar(1.6); shooter.rotation.y = Math.PI / 2;
    shooter.position.set(sx(-1), 0, sz(p.row)); stuff.add(shooter);
    R.crystal = makeModel('rooms/crystal_target');
    R.crystal.position.set(sx(p.crystal[0]), 0, sz(p.crystal[1])); stuff.add(R.crystal);
    R.crystalMat = null;
    R.crystal.traverse(o => { if (o.isMesh && o.material.name === 'crystal_glow') R.crystalMat = o.material; });
    if (R.crystalMat) R.crystalMat.emissive = new THREE.Color('#108080');
    mover.place(p.start[0], p.start[1]); player.rotation.y = Math.PI;
    R.left = cfg.rounds[R.round].time;
    drawBeam();
  }
  function drawBeam() {
    beam.clear();
    const { pts, hit } = traceBeam(R.p);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = new THREE.Vector3(sx(pts[i][0]), 1, sz(pts[i][1])), b = new THREE.Vector3(sx(pts[i + 1][0]), 1, sz(pts[i + 1][1]));
      const len = a.distanceTo(b);
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), mat('#fff6a0', { emissive: '#ffd000' }));
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      beam.add(seg);
    }
    return hit;
  }
  function startRound() { build(); R.phase = 'play'; R.t = 0; status(); ctx.say('✨ Bump the mirrors to flip them. Bounce the light onto the crystal!'); }

  function decide(c, r, dc, dr) {
    const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
    if (nc < 0 || nc >= N || nr < 0 || nr >= N || R.p.rocks.has(k)) return 'bump';
    if (R.p.mirrors.has(k)) {
      R.p.mirrors.set(k, flip(R.p.mirrors.get(k)));
      const m = R.mirrorMeshes.get(k);
      m.userData.goal += Math.PI / 2;
      ctx.sound('tick');
      if (drawBeam()) win();
      return 'bump';
    }
    ctx.sound('hop');
    return 'go';
  }
  function win() {
    ctx.sound('ding'); if (R.crystalMat) R.crystalMat.emissive.set('#60fff0');
    R.round++; base.villain.userData.hurt = 1;
    if (R.round >= 3) { R.phase = 'end'; setTimeout(() => ending.start(), 800); }
    else { R.phase = 'between'; R.t = 0; ctx.say('Zap! The crystal is glowing! The next one is trickier.'); }
  }

  function update(dt, t) {
    R.t += dt;
    base.ghost.userData.animate(t);
    base.villain.userData.animate(t);
    R.mirrorMeshes.forEach(m => { m.rotation.y += (m.userData.goal - m.rotation.y) * Math.min(1, dt * 12); });
    if (R.crystal) R.crystal.rotation.y += dt;
    if (ending.update(dt, t)) return;
    if (R.phase === 'intro') { if (R.t > 3) startRound(); return; }
    if (R.phase === 'between') { if (R.t > 2) startRound(); return; }
    if (R.phase === 'bonk') { player.rotation.z = Math.sin(R.t * 30) * 0.3; if (R.t > 1) { player.rotation.z = 0; R.phase = 'play'; mover.place(R.p.start[0], R.p.start[1]); } return; }
    if (R.phase !== 'play') return;
    // The candle burns down. When it runs out, the wizard mixes up the mirrors.
    R.left -= dt;
    const k = Math.max(0, R.left / cfg.rounds[R.round].time);
    wax.scale.y = waxRest * (0.2 + k * 0.8); flame.position.y = 1.8 * 0.9 * (0.2 + k * 0.8) + 0.25;
    flame.scale.setScalar(0.8 + Math.sin(t * 20) * 0.2);
    if (Math.floor(R.left + dt) !== Math.floor(R.left)) status();
    if (R.left <= 0) {
      scramble(R.p);
      R.p.mirrors.forEach((type, key) => { R.mirrorMeshes.get(key).userData.goal = type === '/' ? Math.PI / 4 : -Math.PI / 4; });
      drawBeam();
      R.left = cfg.rounds[R.round].time;
      ctx.sound('buzz'); ctx.say('🕯️ Hee hee! The candle went out, so I mixed up the mirrors!');
    }
    mover.update(dt, decide);
    player.userData.animate(t, mover.hop ? 'walk' : null);
    updateSparks(dt);
  }

  // World 6: sparkles fly down a column. The column glows first.
  function updateSparks(dt) {
    if (!cfg.sparkEvery || R.calm) return;
    if (!R.spark) {
      R.sparkTimer += dt;
      if (R.sparkTimer > cfg.sparkEvery) { R.sparkTimer = 0; R.spark = { col: Math.random() < 0.5 ? mover.c : Math.floor(Math.random() * N), t: 0 }; lane.position.x = sx(R.spark.col); lane.visible = true; }
      return;
    }
    const s = R.spark;
    s.t += dt;
    if (s.t < 1) { lane.material.opacity = 0.2 + Math.abs(Math.sin(s.t * 10)) * 0.4; return; }
    lane.visible = false;
    const row = N - (s.t - 1) * 5;
    spark.visible = true; spark.position.set(sx(s.col), 0.8, sz(row)); spark.rotation.y += dt * 8;
    const pc = player.position.x / GAP + (N - 1) / 2, pr = (2 - player.position.z) / GAP;
    if (Math.abs(pc - s.col) < 0.6 && Math.abs(pr - row) < 0.7) {
      spark.visible = false; R.spark = null;
      ctx.sound('bonk'); ctx.say('Zap! A sparkle got you. Back to the start, the mirrors stay put.');
      R.phase = 'bonk'; R.t = 0; mover.hop = null;
      return;
    }
    if (row < -1) { spark.visible = false; R.spark = null; }
  }

  mover.place(Math.floor(N / 2), 0);
  ctx.say(cfg.sparkEvery ? '🧙 You found my tower! It is full of the trickiest magic of all! Hee hee!' : '🧙 I am Wizzle! Abracadabra! My magic mirrors will trick you!');
  ctx.status('🧙 Round 1 of 3');
  return { scene, camera: base.camera, update, room: { get phase() { return ending.phase === 'done' ? 'done' : R.phase; }, debug: { R, mover, traceBeam } } };
}
