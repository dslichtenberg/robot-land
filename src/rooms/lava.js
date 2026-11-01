// rooms/lava.js
// The Dragon's lava room (World 1, and a harder one in World 5).
//
// A path of stepping stones lights up one stone at a time. Then the lights go
// out and you hop across from memory. A wrong stone sinks and you start that
// round again (no hearts lost). Three rounds, each path longer. In later rounds
// the stones wobble and sink if you stand still too long. In World 5, fireballs
// also roll across a row: watch for the glowing row and hop out of the way.
// Miss a round three times and the ghost leaves the path glowing a little.

import * as THREE from 'three';
import { roomBase, gridMover, makeEnding, mat, tileFloor } from './common.js';
import { makeModel } from '../models.js';

export const LAVA_EASY = {
  cols: 5, rows: 6, fireEvery: 0,
  rounds: [{ side: 1, show: 0.6, sink: 0 }, { side: 3, show: 0.5, sink: 2.2 }, { side: 5, show: 0.42, sink: 1.5 }],
};
export const LAVA_HARD = {
  cols: 5, rows: 7, fireEvery: 3.2,
  rounds: [{ side: 3, show: 0.5, sink: 2 }, { side: 5, show: 0.42, sink: 1.6 }, { side: 7, show: 0.36, sink: 1.2 }],
};

function makePath(cols, rows, extraSide) {
  const path = [], used = new Set();
  let c = Math.floor(Math.random() * cols), left = extraSide;
  for (let r = 0; r < rows; r++) {
    path.push([c, r]); used.add(c + ',' + r);
    let steps = r === rows - 1 ? 0 : Math.min(left, Math.random() < 0.75 ? 1 + Math.floor(Math.random() * 2) : 0);
    const dir = c <= 1 ? 1 : c >= cols - 2 ? -1 : (Math.random() < 0.5 ? -1 : 1);
    while (steps > 0 && c + dir >= 0 && c + dir < cols && !used.has((c + dir) + ',' + r)) {
      c += dir; steps--; left--;
      path.push([c, r]); used.add(c + ',' + r);
    }
  }
  return path;
}

export function createLavaRoom(ctx, cfg) {
  const COLS = cfg.cols, ROWS = cfg.rows, GAP = 2.2;
  const sx = (c) => (c - (COLS - 1) / 2) * GAP;
  const sz = (r) => r < 0 ? 2.8 : r >= ROWS ? -ROWS * GAP - 0.8 : -r * GAP;
  const base = roomBase({ theme: 'lava', wall: '#4a3b78', villain: 'dragon', villainZ: sz(ROWS) - 2.2 });
  const { scene } = base;

  const lavaMat = mat('#ff5a1f', { emissive: '#c43a00' });
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(26, 36), lavaMat);
  lava.rotation.x = -Math.PI / 2; lava.position.set(0, -0.6, -6); scene.add(lava);
  for (const z of [sz(-1) + 0.6, sz(ROWS) - 1.6]) {
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 4), mat('#4a3f5c'));
    ledge.position.set(0, -0.6, z); ledge.receiveShadow = true; scene.add(ledge);
    tileFloor(scene, 'stone', -7, z - 2, 7, z + 2, 0);
  }
  const stones = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    // Hex stepping stone: its top face has its own material (hex_top) that we light up.
    const m = makeModel('rooms/hex_stone');
    m.position.set(sx(c), 0, sz(r));
    scene.add(m);
    let top = null;
    m.traverse(o => { if (o.isMesh && o.material.name === 'hex_top') top = o.material; });
    if (!top) top = mat('#8d8a99');
    top.emissive = new THREE.Color('#000000');
    stones.push({ c, r, mesh: m, top, sink: 0, sinking: false, stood: 0 });
  }
  const stoneAt = (c, r) => stones.find(s => s.c === c && s.r === r);
  const fireball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 10), mat('#ffb000', { emissive: '#ff5000' }));
  fireball.visible = false; scene.add(fireball);

  const player = ctx.player;
  scene.add(player);
  const mover = gridMover(player, (c, r) => [sx(c), sz(r)], ctx.stats.hopTime);
  const ending = makeEnding(base, player, ctx);

  const R = { phase: 'intro', t: 0, round: 0, fails: 0, path: [], safe: new Set(), showIndex: -1, fire: null, fireTimer: 0 };
  let hearts = 3;
  const status = () => ctx.status('🐲 ' + '❤️'.repeat(hearts) + '🖤'.repeat(3 - hearts) + '   Round ' + (R.round + 1) + ' of 3');

  function resetStones() {
    stones.forEach(s => {
      s.sink = 0; s.sinking = false; s.stood = 0;
      s.mesh.position.y = 0; s.mesh.rotation.set(0, 0, 0);
      s.mark = '#000000'; s.top.emissive.set(s.mark);
    });
  }
  function startRound(fresh) {
    if (fresh) {
      R.path = makePath(COLS, ROWS, cfg.rounds[R.round].side);
      R.safe = new Set(R.path.map(([c, r]) => c + ',' + r));
    }
    resetStones();
    mover.place(R.path[0][0], -1);
    player.rotation.y = Math.PI;
    R.phase = 'show'; R.t = 0; R.showIndex = -1; R.fire = null; R.fireTimer = 0; fireball.visible = false;
    ctx.say('👀 Watch the path!');
    status();
  }
  function fall() {
    R.phase = 'fall'; R.t = 0; R.fails++;
    ctx.sound('buzz');
    ctx.say(R.fails >= 3 ? '👻 Psst! It is Boo. I will help: the path will glow a tiny bit.' : 'Oops! Splash! Try again!');
  }
  mover.onLand = (c, r) => {
    if (r >= ROWS) {
      R.phase = 'won'; R.t = 0; R.fails = 0; hearts--;
      ctx.sound('ding'); status();
      ctx.say(hearts > 0 ? 'Ouch! Lucky hop! The next path is longer!' : '');
      return;
    }
    if (r < 0) return;
    const s = stoneAt(c, r);
    if (R.safe.has(c + ',' + r)) { s.mark = '#1f9a3a'; s.top.emissive.set(s.mark); s.stood = 0; ctx.sound('tick'); }
    else { s.sinking = true; fall(); }
  };

  function update(dt, t) {
    R.t += dt;
    base.villain.userData.animate(t);
    base.ghost.userData.animate(t);
    lavaMat.emissive.setHSL(0.04, 1, 0.3 + Math.sin(t * 2) * 0.06);
    if (ending.update(dt, t)) return;
    const rule = cfg.rounds[R.round];
    if (R.phase === 'intro') { if (R.t > 3.5) startRound(true); }
    else if (R.phase === 'show') {
      const i = Math.floor(R.t / rule.show) - 1;
      if (i !== R.showIndex && i >= 0 && i < R.path.length) {
        R.showIndex = i;
        stoneAt(R.path[i][0], R.path[i][1]).top.emissive.set('#ffd23f');
        ctx.sound('tick');
      }
      if (R.t > rule.show * (R.path.length + 2)) {
        stones.forEach(s => { s.mark = R.fails >= 3 && R.safe.has(s.c + ',' + s.r) ? '#3a3010' : '#000000'; s.top.emissive.set(s.mark); });
        R.phase = 'play'; R.t = 0;
        ctx.say('🦎 Go! Hop across!');
      }
    } else if (R.phase === 'play') {
      mover.update(dt, (c, r, dc, dr) => {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= COLS || nr < -1 || nr > ROWS) return 'no';
        if (nr === ROWS && r !== ROWS - 1) return 'no';
        if (r >= 0 && r < ROWS) stoneAt(c, r).stood = 0;
        ctx.sound('hop');
        return 'go';
      });
      // Wobbly stones: do not stand still too long.
      if (rule.sink && !mover.hop && mover.r >= 0 && mover.r < ROWS) {
        const s = stoneAt(mover.c, mover.r);
        s.stood += dt;
        s.mesh.rotation.z = s.stood > rule.sink * 0.5 ? Math.sin(s.stood * 30) * 0.08 : 0;
        if (s.stood > rule.sink) { s.sinking = true; fall(); }
      }
      updateFire(dt);
    } else if (R.phase === 'fall') {
      player.position.y -= dt * 4;
      if (R.t > 1.3) startRound(false);
    } else if (R.phase === 'won') {
      base.villain.position.x = Math.sin(t * 40) * 0.2 * Math.max(0, 1 - R.t);
      if (R.t > 1.8) {
        if (hearts > 0) { R.round++; startRound(true); }
        else { R.phase = 'end'; ending.start(); }
      }
    }
    stones.forEach(s => { if (s.sinking) { s.sink += dt; s.mesh.position.y = -s.sink * 2; s.mesh.rotation.z = s.sink; } });
    if (R.phase !== 'end') player.userData.animate(t, R.phase === 'fall' ? 'oops' : R.phase === 'won' ? 'happy' : mover.hop ? 'walk' : null);
  }

  // World 5: a fireball rolls across one row. The row glows first.
  function updateFire(dt) {
    if (!cfg.fireEvery) return;
    if (!R.fire) {
      R.fireTimer += dt;
      if (R.fireTimer > cfg.fireEvery) {
        R.fireTimer = 0;
        R.fire = { row: Math.floor(Math.random() * ROWS), t: 0 };
      }
      return;
    }
    const f = R.fire;
    f.t += dt;
    const row = stones.filter(s => s.r === f.row);
    if (f.t < 1) row.forEach(s => { if (!s.sinking) s.top.emissive.set(Math.floor(f.t * 8) % 2 ? '#ff3000' : s.mark); });
    else {
      row.forEach(s => { if (!s.sinking) s.top.emissive.set(s.mark); });
      const k = (f.t - 1) / 1.4;
      fireball.visible = true;
      fireball.position.set(-7 + k * 14, 0.6, sz(f.row));
      if (mover.r === f.row && Math.abs(player.position.x - fireball.position.x) < 1 && player.position.y < 0.4) { fireball.visible = false; R.fire = null; fall(); return; }
      if (k >= 1) { fireball.visible = false; R.fire = null; }
    }
  }

  mover.place(2, -1);
  player.rotation.y = Math.PI;
  ctx.say(cfg.fireEvery ? '🐲 Scorch is back, and my lava is even HOTTER!' : '🐲 I am Scorch! You will never cross my lava!');
  status();
  return { scene, camera: base.camera, update, room: { get phase() { return ending.phase === 'done' ? 'done' : R.phase; }, debug: { R, mover } } };
}
