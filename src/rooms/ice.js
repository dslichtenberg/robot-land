// rooms/ice.js
// House 2: the Snowgun's ice room.
//
// The floor is slippery ice. When you push a direction you slide until you hit
// a rock or the wall. Slide over all three snowflakes, then stop on the exit.
// That takes some planning! Meanwhile the Snowgun fires snowballs down one
// column at a time. The column flashes blue first, so move out of the way.
// A snowball hit sends you back to the start (the flakes come back too).
// Every board is made fresh and checked by the computer to be solvable.

import * as THREE from 'three';
import { roomBase, gridMover, makeEnding, mat } from './common.js';

const N = 7, GAP = 2;
const ROUNDS = [
  { minMoves: 4, maxMoves: 6, fireEvery: 3.2 },
  { minMoves: 6, maxMoves: 8, fireEvery: 2.6 },
  { minMoves: 7, maxMoves: 11, fireEvery: 2.1 },
];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Slide from (c, r) in direction (dc, dr). Returns where you stop and which flakes you passed.
function slide(board, c, r, dc, dr, mask) {
  let got = mask;
  while (true) {
    const nc = c + dc, nr = r + dr;
    if (nc < 0 || nc >= N || nr < 0 || nr >= N || board.rocks.has(nc + ',' + nr)) break;
    c = nc; r = nr;
    const f = board.flakes.findIndex(([fc, fr]) => fc === c && fr === r);
    if (f >= 0) got |= 1 << f;
    if (c === board.exit[0] && r === board.exit[1] && got === 7) break;
  }
  return { c, r, got };
}

// Fewest moves to win, or -1 if it cannot be done.
function solve(board) {
  const key = (c, r, m) => c + ',' + r + ',' + m;
  const seen = new Set([key(board.start[0], board.start[1], 0)]);
  let frontier = [[board.start[0], board.start[1], 0]];
  for (let moves = 1; moves <= 14 && frontier.length; moves++) {
    const next = [];
    for (const [c, r, m] of frontier) for (const [dc, dr] of DIRS) {
      const s = slide(board, c, r, dc, dr, m);
      if (s.got === 7 && s.c === board.exit[0] && s.r === board.exit[1]) return moves;
      const k = key(s.c, s.r, s.got);
      if (!seen.has(k)) { seen.add(k); next.push([s.c, s.r, s.got]); }
    }
    frontier = next;
  }
  return -1;
}

export function makeBoard(round) {
  const rule = ROUNDS[round];
  for (let tries = 0; tries < 4000; tries++) {
    const used = new Set(), pick = () => { let p; do { p = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; } while (used.has(p + '')); used.add(p + ''); return p; };
    const start = [Math.floor(Math.random() * N), 0]; used.add(start + '');
    const exit = [Math.floor(Math.random() * N), N - 1 - Math.floor(Math.random() * 2)]; used.add(exit + '');
    const flakes = [pick(), pick(), pick()];
    const rocks = new Set();
    const count = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) rocks.add(pick().join(','));
    const board = { start, exit, flakes, rocks };
    const moves = solve(board);
    if (moves >= rule.minMoves && moves <= rule.maxMoves) return Object.assign(board, { moves });
  }
  return null;
}

export function createIceRoom(ctx) {
  const sx = (c) => (c - (N - 1) / 2) * GAP, sz = (r) => -r * GAP;
  const base = roomBase({ wall: '#3d5f8a', floor: '#2b3f5a', villain: 'snowgun', villainZ: sz(N) - 1.5 });
  const { scene } = base;
  base.villain.rotation.y = 0;
  const ice = new THREE.Mesh(new THREE.BoxGeometry(N * GAP, 0.4, N * GAP), mat('#cfefff', { roughness: 0.05, metalness: 0.2 }));
  ice.position.set(0, -0.2, sz((N - 1) / 2)); ice.receiveShadow = true; scene.add(ice);
  const lines = new THREE.GridHelper(N * GAP, N, '#9fd6ff', '#9fd6ff');
  lines.position.set(0, 0.01, sz((N - 1) / 2)); scene.add(lines);

  const player = ctx.player;
  scene.add(player);
  const mover = gridMover(player, (c, r) => [sx(c), sz(r)], ctx.stats.hopTime);
  const ending = makeEnding(base, player, ctx);
  const things = new THREE.Group(); scene.add(things);
  const lane = new THREE.Mesh(new THREE.BoxGeometry(GAP * 0.9, 0.05, N * GAP), mat('#4da6ff', { emissive: '#2060ff', transparent: true, opacity: 0.5 }));
  lane.position.set(0, 0.05, sz((N - 1) / 2)); lane.visible = false; scene.add(lane);
  const snowball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 10), mat('#ffffff'));
  snowball.visible = false; scene.add(snowball);

  const R = { phase: 'intro', t: 0, round: 0, board: null, mask: 0, flakeMeshes: [], shot: null, shotTimer: 0, misses: 0 };
  const status = () => ctx.status('☃️ Round ' + (R.round + 1) + ' of 3   ❄️ ' + countFlakes() + ' of 3');
  const countFlakes = () => [0, 1, 2].filter(i => R.mask & (1 << i)).length;

  function buildBoard() {
    things.clear();
    R.board = makeBoard(R.round);
    R.board.rocks.forEach(k => {
      const [c, r] = k.split(',').map(Number);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9), mat('#9fc3e0', { roughness: 0.3 }));
      rock.position.set(sx(c), 0.7, sz(r)); rock.castShadow = true; things.add(rock);
    });
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.1, 24), mat('#3f3168', { emissive: '#7a3fe0' }));
    ex.position.set(sx(R.board.exit[0]), 0.05, sz(R.board.exit[1])); things.add(ex);
    R.exitMesh = ex;
  }
  function resetRun() {
    R.mask = 0;
    R.flakeMeshes.forEach(m => things.remove(m));
    R.flakeMeshes = R.board.flakes.map(([c, r]) => {
      const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), mat('#ffffff', { emissive: '#88ccff' }));
      f.position.set(sx(c), 1, sz(r)); things.add(f); return f;
    });
    mover.place(R.board.start[0], R.board.start[1]);
    player.rotation.y = Math.PI;
    R.shot = null; lane.visible = false; snowball.visible = false; R.shotTimer = 0;
    status();
  }
  function startRound() {
    buildBoard(); resetRun();
    R.phase = 'play'; R.t = 0;
    ctx.say('❄️ Slide over all 3 snowflakes, then stop on the purple exit!');
  }

  mover.onLand = (c, r) => {
    if (c === R.board.exit[0] && r === R.board.exit[1] && R.mask === 7) {
      R.round++; ctx.sound('ding');
      base.villain.userData.hurt = 1;
      if (R.round >= 3) { R.phase = 'end'; ending.start(); }
      else { R.phase = 'between'; R.t = 0; ctx.say('Brrr! Lucky slide! The next one is trickier.'); }
    }
  };
  // Sliding moves you many tiles in one push. We move tile by tile so flakes pop as you pass.
  function decide(c, r, dc, dr) {
    const s = slide(R.board, c, r, dc, dr, R.mask);
    if (s.c === c && s.r === r) return 'bump';
    R.path = [];
    let pc = c, pr = r;
    while (pc !== s.c || pr !== s.r) { pc += dc; pr += dr; R.path.push([pc, pr]); }
    ctx.sound('hop');
    return 'slide';
  }

  function update(dt, t) {
    R.t += dt;
    base.ghost.userData.animate(t);
    base.villain.userData.animate(t);
    if (ending.update(dt, t)) return;
    R.flakeMeshes.forEach((m, i) => { m.rotation.y += dt * 2; m.visible = !(R.mask & (1 << i)); });
    if (R.exitMesh) R.exitMesh.material.emissive.set(R.mask === 7 && Math.floor(t * 4) % 2 ? '#c89bff' : '#7a3fe0');
    if (R.phase === 'intro') { if (R.t > 3) startRound(); return; }
    if (R.phase === 'between') { if (R.t > 2) startRound(); return; }
    if (R.phase === 'hit') { player.rotation.z = Math.sin(R.t * 30) * 0.3; if (R.t > 1.2) { player.rotation.z = 0; R.phase = 'play'; resetRun(); } return; }
    if (R.phase !== 'play') return;
    if (R.path && R.path.length && !mover.hop) {
      const [c, r] = R.path.shift();
      mover.go(c, r, 0.09);
      const f = R.board.flakes.findIndex(([fc, fr]) => fc === c && fr === r);
      if (f >= 0 && !(R.mask & (1 << f))) { R.mask |= 1 << f; ctx.sound('tick'); status(); }
    } else {
      mover.update(dt, (c, r, dc, dr) => { decide(c, r, dc, dr); return 'no'; });
    }
    player.userData.animate(t, mover.hop ? 'walk' : null);
    updateSnow(dt);
  }

  // A snowball comes down one column. The column glows first.
  function updateSnow(dt) {
    const rule = ROUNDS[Math.min(R.round, 2)];
    if (!R.shot) {
      R.shotTimer += dt;
      if (R.shotTimer > rule.fireEvery) {
        R.shotTimer = 0;
        const col = Math.random() < 0.5 ? mover.c : Math.floor(Math.random() * N);
        R.shot = { col, t: 0 };
        base.villain.position.x = sx(col);
        lane.position.x = sx(col); lane.visible = true;
      }
      return;
    }
    const s = R.shot;
    s.t += dt;
    lane.material.opacity = 0.25 + Math.abs(Math.sin(s.t * 10)) * 0.35;
    if (s.t < 1) return;
    lane.visible = false;
    const row = N - (s.t - 1) * 6;
    snowball.visible = true;
    snowball.position.set(sx(s.col), 0.7, sz(row));
    const pr = -player.position.z / GAP, pc = player.position.x / GAP + (N - 1) / 2;
    if (Math.abs(pc - s.col) < 0.6 && Math.abs(pr - row) < 0.7) {
      snowball.visible = false; R.shot = null;
      ctx.sound('buzz'); ctx.say('Brrr! Snowball! Back to the start.');
      R.path = []; mover.hop = null;
      R.phase = 'hit'; R.t = 0;
      return;
    }
    if (row < -1) { snowball.visible = false; R.shot = null; }
  }

  mover.place(3, 0);
  ctx.say('☃️ My ice is too slippery for you, little gecko!');
  ctx.status('☃️ Round 1 of 3');
  return { scene, camera: base.camera, update, room: { get phase() { return ending.phase === 'done' ? 'done' : R.phase; }, debug: { R, mover, slide } } };
}
