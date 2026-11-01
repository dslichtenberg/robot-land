// rooms/levers.js
// House 3: the Yo-yo's lever room.
//
// Colored levers stand around the room. At the start their lights flash in an
// order: remember it! Bump into the levers in that same order to open the exit
// door. Pull one out of order and they all reset (and the order is shown again).
// Giant yo-yos swing back and forth across some rows. If one bonks you, you go
// back to the start, but the levers you pulled stay pulled. Three rounds, with
// more yo-yos each time.

import * as THREE from 'three';
import { roomBase, gridMover, makeEnding, label, mat, tileFloor } from './common.js';
import { makeModel } from '../models.js';
const placeAt = (obj, x, y, z) => { obj.position.set(x, y, z); return obj; };

const COLS = 7, ROWS = 8, GAP = 2.2, EXIT_C = 3;
const ROUNDS = [
  { levers: 3, yoyos: 2, speed: 1.1 },
  { levers: 3, yoyos: 3, speed: 1.35 },
  { levers: 4, yoyos: 4, speed: 1.6 },
];
const COLORS = ['#ff4d4d', '#4da6ff', '#ffd23f', '#5fd257', '#c86bff'];

export function createLeverRoom(ctx) {
  const sx = (c) => (c - (COLS - 1) / 2) * GAP, sz = (r) => -r * GAP + 2;
  const base = roomBase({ theme: 'lever', wall: '#5a3d6a', villain: 'yoyo', villainZ: sz(ROWS) - 2.5 });
  const { scene } = base;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(COLS * GAP, 0.5, ROWS * GAP), mat('#6a4a2a'));
  floor.position.set(0, -0.35, sz((ROWS - 1) / 2)); floor.receiveShadow = true; scene.add(floor);
  tileFloor(scene, 'wood', sx(0) - GAP / 2, sz(ROWS - 1) - GAP / 2, sx(COLS - 1) + GAP / 2, sz(0) + GAP / 2, 0, GAP);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.4, 0.4), mat('#2b2140', { emissive: '#1a0f33' }));
  door.position.set(sx(EXIT_C), 1.7, sz(ROWS) + 0.6); scene.add(door);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(COLS * GAP + 4, 4, 0.5), mat('#3f2a4a'));
  wall.position.set(0, 2, sz(ROWS) + 0.4); scene.add(wall);
  const gapCut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.6, 0.6), mat('#120c1c'));
  gapCut.position.set(sx(EXIT_C), 1.8, sz(ROWS) + 0.45); scene.add(gapCut);

  const player = ctx.player;
  scene.add(player);
  const mover = gridMover(player, (c, r) => [sx(c), sz(r)], ctx.stats.hopTime);
  const ending = makeEnding(base, player, ctx);
  const roundStuff = new THREE.Group(); scene.add(roundStuff);

  const R = { phase: 'intro', t: 0, round: 0, levers: [], order: [], next: 0, yoyos: [], wrong: 0, showStep: -1, calm: false };
  const status = () => ctx.status('🪀 Round ' + (R.round + 1) + ' of 3   Levers ' + R.next + ' of ' + R.order.length);
  const leverAt = (c, r) => R.levers.find(l => l.c === c && l.r === r);

  function buildRound() {
    roundStuff.clear();
    const rule = ROUNDS[R.round];
    R.levers = [];
    while (R.levers.length < rule.levers) {
      const c = Math.floor(Math.random() * COLS), r = 2 + Math.floor(Math.random() * (ROWS - 3));
      if (R.levers.some(l => Math.abs(l.c - c) <= 1 && Math.abs(l.r - r) <= 1)) continue;
      const i = R.levers.length, g = new THREE.Group();
      // The lever model: 'handle' tips forward when pulled; its lamp (lever_lamp) shows the lever's color.
      const model = makeModel('rooms/lever');
      model.scale.setScalar(2); g.add(model);
      const handle = model.userData.part('handle') || new THREE.Group();
      handle.userData.rest = handle.rotation.x;
      handle.rotation.x = handle.userData.rest - 0.5;
      let lampMat = null;
      model.traverse(o => { if (o.isMesh && o.material.name === 'lever_lamp') lampMat = o.material; });
      if (!lampMat) lampMat = mat(COLORS[i]);
      lampMat.color.set(COLORS[i]); lampMat.emissive = new THREE.Color('#000000');
      // A big colored orb above each lever, so its color is easy to see and remember.
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), mat(COLORS[i], { emissive: '#000000', roughness: 0.3 }));
      orb.position.y = 3; orb.castShadow = true; g.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.08, 10, 28), mat('#ffd23f', { metalness: 0.6, roughness: 0.3 }));
      ring.position.y = 3; ring.rotation.x = Math.PI / 2; g.add(ring);
      const both = [lampMat, orb.material];
      const lamp = { material: { emissive: { set: (c) => both.forEach(m => m.emissive.set(c)) } } };
      const num = label('?'); num.position.y = 4.1; num.visible = false; g.add(num);
      g.position.set(sx(c), 0, sz(r)); g.traverse(o => { o.castShadow = true; });
      roundStuff.add(g);
      R.levers.push({ c, r, handle, lamp, num, color: COLORS[i], pulled: false });
    }
    R.order = R.levers.map((l, i) => i).sort(() => Math.random() - 0.5);
    R.order.forEach((li, k) => {
      const l = R.levers[li], old = l.num;
      l.num = label(String(k + 1)); l.num.position.y = 4.1; l.num.visible = false; old.parent.add(l.num); old.parent.remove(old);
    });
    const rows = [1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5).slice(0, rule.yoyos);
    R.yoyos = rows.map((row, i) => {
      const m = makeModel('yoyo', 1.8);
      roundStuff.add(m);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffffff' }));
      roundStuff.add(line);
      return { row, mesh: m, line, phase: i * 1.7 + Math.random(), x: 0 };
    });
    door.position.y = 1.7;
  }
  function resetLevers() {
    R.next = 0;
    R.levers.forEach(l => { l.pulled = false; l.handle.rotation.x = l.handle.userData.rest - 0.5; l.lamp.material.emissive.set('#000000'); });
    status();
  }
  function showOrder() {
    resetLevers();
    R.phase = 'show'; R.t = 0; R.showStep = -1;
    mover.place(EXIT_C, 0); player.rotation.y = Math.PI;
    ctx.say('👀 Watch the order of the lights!');
    if (R.wrong >= 2) R.levers.forEach(l => { l.num.visible = true; });
  }
  function startRound() { buildRound(); R.wrong = 0; showOrder(); }

  function decide(c, r, dc, dr) {
    const nc = c + dc, nr = r + dr;
    if (nr === ROWS && nc === EXIT_C && R.next === R.order.length) { ctx.sound('hop'); return 'go'; }
    if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) return 'bump';
    const lever = leverAt(nc, nr);
    if (!lever) { ctx.sound('hop'); return 'go'; }
    if (lever.pulled) return 'bump';
    if (R.levers.indexOf(lever) === R.order[R.next]) {
      lever.pulled = true; lever.handle.rotation.x = lever.handle.userData.rest + 0.5; lever.lamp.material.emissive.set(lever.color);
      R.next++; ctx.sound('clank'); status();
      if (R.next === R.order.length) { ctx.sound('ding'); ctx.say('🚪 The door is open! Hop out the top!'); }
    } else {
      R.wrong++; ctx.sound('buzz');
      ctx.say(R.wrong >= 2 ? 'Oops! Wrong order. I will show numbers this time.' : 'Oops! Wrong order. Watch again!');
      R.phase = 'wrong'; R.t = 0;
    }
    return 'bump';
  }
  mover.onLand = (c, r) => {
    if (r === ROWS) {
      R.round++; base.villain.userData.hurt = 1;
      if (R.round >= 3) { R.phase = 'end'; ending.start(); }
      else { R.phase = 'between'; R.t = 0; ctx.say('Wobble wobble! You got out! Next room has more yo-yos!'); }
    }
  };

  function update(dt, t) {
    R.t += dt;
    base.ghost.userData.animate(t);
    base.villain.userData.animate(t);
    if (ending.update(dt, t)) return;
    const rule = ROUNDS[Math.min(R.round, 2)];
    if (R.next === R.order.length && R.order.length) door.position.y = Math.min(5.5, door.position.y + dt * 3);
    R.yoyos.forEach(y => {
      y.x = Math.sin(t * rule.speed + y.phase) * (COLS * GAP / 2 - 0.5);
      y.mesh.position.set(y.x, 0.6, sz(y.row));
      y.mesh.rotation.y = t * 2;
      y.mesh.userData.animate(t);
      const p = y.line.geometry.attributes.position;
      p.setXYZ(0, 0, 11, sz(y.row)); p.setXYZ(1, y.x, 2, sz(y.row)); p.needsUpdate = true;
    });
    if (R.phase === 'intro') { if (R.t > 3) startRound(); return; }
    if (R.phase === 'between') { if (R.t > 2) startRound(); return; }
    if (R.phase === 'wrong') { if (R.t > 1.2) showOrder(); return; }
    if (R.phase === 'bonk') { player.rotation.z = Math.sin(R.t * 30) * 0.3; if (R.t > 1) { player.rotation.z = 0; R.phase = 'play'; mover.place(EXIT_C, 0); } return; }
    if (R.phase === 'show') {
      const step = Math.floor(R.t / 0.8) - 1;
      if (step !== R.showStep) {
        R.showStep = step;
        R.levers.forEach(l => l.lamp.material.emissive.set('#000000'));
        if (step >= 0 && step < R.order.length) { const l = R.levers[R.order[step]]; l.lamp.material.emissive.set(l.color); ctx.sound('tick'); }
      }
      if (R.t > 0.8 * (R.order.length + 1.5)) { R.phase = 'play'; ctx.say('🦎 Go! Bump the levers in the same order.'); }
      return;
    }
    if (R.phase !== 'play') return;
    mover.update(dt, decide);
    player.userData.animate(t, mover.hop ? 'walk' : null);
    if (R.calm) return;
    const pr = (2 - player.position.z) / GAP;
    for (const y of R.yoyos) {
      if (Math.abs(pr - y.row) < 0.5 && Math.abs(player.position.x - y.x) < 1.2) {
        ctx.sound('bonk'); ctx.say('Bonk! A yo-yo got you. Back to the start, but your levers stay pulled.');
        R.phase = 'bonk'; R.t = 0; mover.hop = null;
        break;
      }
    }
  }

  mover.place(EXIT_C, 0);
  player.rotation.y = Math.PI;
  ctx.say('🪀 Round and round and up and down! You will never escape my room!');
  ctx.status('🪀 Round 1 of 3');
  return { scene, camera: base.camera, update, room: { get phase() { return ending.phase === 'done' ? 'done' : R.phase; }, debug: { R, mover, leverAt, COLS, ROWS, EXIT_C } } };
}
