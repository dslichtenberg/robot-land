// rooms/common.js
// Shared pieces for the haunted house rooms: the room itself (walls, floor,
// lights, the ghost, the villain), hopping from tile to tile, and the ending
// where the villain spins away and you pick up the prize.

import * as THREE from 'three';
import { makeModel, makeItem } from '../models.js';
import { move } from '../input.js';

export const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, extra));

// opts: { wall, floor, villain, villainZ, width, depth }
export function roomBase(opts) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(opts.wall);
  scene.fog = new THREE.Fog(opts.wall, 24, 44);
  scene.add(new THREE.HemisphereLight('#d9ccff', '#332244', 1.3));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(4, 16, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -20 });
  scene.add(sun);
  const room = new THREE.Mesh(new THREE.BoxGeometry(opts.width || 26, 14, opts.depth || 36), mat(opts.wall, { side: THREE.BackSide }));
  room.position.set(0, 5, -6); room.receiveShadow = true; scene.add(room);
  if (opts.floor) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(opts.width || 26, opts.depth || 36), mat(opts.floor));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.6, -6); floor.receiveShadow = true; scene.add(floor);
  }
  for (const [x, z] of [[-12, -2], [12, -2], [-12, -13], [12, -13]]) {
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mat('#ffd23f', { emissive: '#ffa000' }));
    flame.position.set(x, 4, z); scene.add(flame);
  }
  const ghost = makeModel('ghost', 1.6);
  ghost.position.set(-9, 3, 1); ghost.rotation.y = 0.6; scene.add(ghost);
  const villain = makeModel(opts.villain, 3.2);
  villain.position.set(0, 0, opts.villainZ); scene.add(villain);
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 13, 10);
  camera.lookAt(0, -1, -6);
  return { scene, camera, ghost, villain };
}

// Grid hopping. toXZ(c, r) gives the floor spot for a tile.
// update(dt, decide): when you push a direction, decide(c, r, dc, dr) answers
//   'go'   hop there,   'bump'  you cannot go, but something happens,   anything else: nothing.
export function gridMover(player, toXZ, hopTime) {
  const m = { c: 0, r: 0, hop: null, wait: 0, onLand: null };
  m.place = (c, r) => {
    m.c = c; m.r = r; m.hop = null;
    const [x, z] = toXZ(c, r);
    player.position.set(x, 0, z);
  };
  m.update = (dt, decide, slideSpeed) => {
    m.wait = Math.max(0, m.wait - dt);
    if (m.hop) {
      m.hop.k += dt / m.hop.time;
      const k = Math.min(1, m.hop.k), [x, z] = toXZ(m.c, m.r);
      player.position.x = m.hop.fx + (x - m.hop.fx) * k;
      player.position.z = m.hop.fz + (z - m.hop.fz) * k;
      player.position.y = m.hop.slide ? 0 : Math.sin(k * Math.PI) * 0.7;
      if (m.hop.k >= 1) { m.hop = null; if (m.onLand) m.onLand(m.c, m.r); }
      return;
    }
    if (m.wait > 0) return;
    const inp = move();
    if (Math.max(Math.abs(inp.x), Math.abs(inp.y)) < 0.5) return;
    let dc = 0, dr = 0;
    if (Math.abs(inp.x) > Math.abs(inp.y)) dc = Math.sign(inp.x); else dr = Math.sign(inp.y);
    player.rotation.y = Math.atan2(dc, -dr);
    const answer = decide(m.c, m.r, dc, dr);
    if (answer === 'go') m.go(m.c + dc, m.r + dr);
    else if (answer === 'bump') m.wait = 0.35;
  };
  // Move to a tile (hop, or slide when slideTime is given).
  m.go = (c, r, slideTime) => {
    m.hop = { fx: player.position.x, fz: player.position.z, k: 0, time: slideTime || hopTime, slide: !!slideTime };
    m.c = c; m.r = r;
  };
  return m;
}

// Words floating in the room (like lever numbers).
export function label(text, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color || '#ffe066'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b2140'; g.font = 'bold 80px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.scale.set(1.3, 1.3, 1.3);
  return s;
}

// The happy ending of every room: villain spins away, prize appears, you walk to it.
// Call ending.start() when the puzzle is solved, and ending.update() every frame.
export function makeEnding(base, player, ctx) {
  const e = { phase: null, t: 0 };
  e.start = () => { e.phase = 'defeat'; e.t = 0; ctx.say('Nooo!'); ctx.sound('ding'); };
  e.update = (dt, t) => {
    if (!e.phase) return false;
    e.t += dt;
    const v = base.villain;
    if (e.phase === 'defeat') {
      v.rotation.y += dt * 14;
      v.scale.setScalar(Math.max(0.01, 1 - e.t / 1.6));
      if (e.t > 1.6) {
        v.visible = false;
        e.item = makeItem(ctx.item.kind);
        e.item.position.set(v.position.x, 1.5, v.position.z + 1);
        base.scene.add(e.item);
        e.from = player.position.clone();
        e.phase = 'walk'; e.t = 0; ctx.say('');
      }
    } else if (e.phase === 'walk') {
      const k = Math.min(1, e.t / 2.2);
      player.position.set(e.from.x * (1 - k), 0, e.from.z + (e.item.position.z + 1.2 - e.from.z) * k);
      player.rotation.y = Math.PI;
      player.userData.animate(t, 'walk');
      e.item.rotation.y += dt * 3;
      if (k >= 1) { e.phase = 'done'; ctx.sound('chime'); ctx.onSolved(); }
    } else if (e.phase === 'done') {
      e.item.rotation.y += dt * 3;
      e.item.position.set(player.position.x, 2.6 + Math.sin(t * 3) * 0.2, player.position.z);
      player.rotation.y = 0;
      player.userData.animate(t, 'happy');
    }
    return true;
  };
  return e;
}
