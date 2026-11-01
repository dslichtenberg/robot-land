// world.js
// Builds a world from its layout in worlds.js and runs the moving parts:
// the drawbridge, the conveyor belts, the rolling gear, the button and gate,
// the dragon, the robots and the portal.
//
// It also does collisions: the car is a circle, and walls are boxes or circles.
// resolve(pos, r) pushes the circle out of anything solid.

import * as THREE from 'three';
import { makeModel } from './models.js';

const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, extra));

// A flat texture drawn with the 2D canvas, so we need no image files.
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function boxMesh(x1, z1, x2, z2, h, material, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, h, z2 - z1), material);
  m.position.set((x1 + x2) / 2, (y || 0) + h / 2, (z1 + z2) / 2);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// Sign with big text on it (used for the house number).
function textSprite(text, color, bg) {
  const tex = canvasTexture(128, 128, (g) => {
    g.fillStyle = bg; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 64, 70);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.scale.set(2, 2, 2);
  return s;
}

export function buildWorld(scene, w, flags) {
  const world = { data: w, boxes: [], circles: [], robots: [], hazards: [], buildings: [], gateOpen: !!flags.gateOpen, houseDone: !!flags.houseDone };
  const solid = (x1, z1, x2, z2) => { const b = { x1, z1, x2, z2, on: true }; world.boxes.push(b); return b; };
  const H = w.half;

  // ---------- Ground, streets, edges ----------
  const plates = canvasTexture(128, 128, (g) => {
    g.fillStyle = w.ground; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; g.strokeRect(2, 2, 124, 124);
    g.fillStyle = 'rgba(40,50,70,0.35)';
    for (const [x, y] of [[10, 10], [118, 10], [10, 118], [118, 118]]) g.fillRect(x - 3, y - 3, 6, 6);
  });
  plates.repeat.set(H / 2, H / 2);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(H * 2 + 40, H * 2 + 40), mat('#ffffff', { map: plates }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMat = mat('#5d6475');
  w.streets.forEach(([x1, z1, x2, z2]) => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), roadMat);
    r.rotation.x = -Math.PI / 2; r.position.set((x1 + x2) / 2, 0.02, (z1 + z2) / 2);
    r.receiveShadow = true; scene.add(r);
  });

  const fenceMat = mat('#b9c2cf', { metalness: 0.4 });
  for (const [x1, z1, x2, z2] of [[-H - 2, -H - 2, H + 2, -H], [-H - 2, H, H + 2, H + 2], [-H - 2, -H, -H, H], [H, -H, H + 2, H]]) {
    scene.add(boxMesh(x1, z1, x2, z2, 3, fenceMat)); solid(x1, z1, x2, z2);
  }

  // ---------- Buildings ----------
  const windows = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#6f7a8e'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffe9a8';
    for (let y = 8; y < 64; y += 28) for (let x = 8; x < 64; x += 28) g.fillRect(x, y, 18, 14);
  });
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  w.blocksX.forEach(([bx1, bx2]) => w.blocksZ.forEach(([bz1, bz2]) => {
    const x1 = bx1 + 1.5, x2 = bx2 - 1.5, z1 = bz1 + 1.5, z2 = bz2 - 1.5, h = 4 + Math.floor(rnd() * 7);
    const tex = windows.clone(); tex.needsUpdate = true;
    tex.repeat.set(Math.round((x2 - x1) / 3), Math.round(h / 3));
    const hue = ['#8792a6', '#7f9ab0', '#9a8fb0', '#8fa5a0'][Math.floor(rnd() * 4)];
    const faces = [mat(hue, { map: tex }), mat(hue, { map: tex }), mat('#5d6475'), mat('#5d6475'), mat(hue, { map: tex }), mat(hue, { map: tex })];
    faces.forEach(f => { f.transparent = true; });
    const b = boxMesh(x1, z1, x2, z2, h, faces);
    scene.add(b); solid(x1, z1, x2, z2);
    world.buildings.push({ x1, z1, x2, z2, faces, see: 1 });
  }));

  // ---------- River, drawbridge and broken bridge ----------
  const { z1: rz1, z2: rz2 } = w.river;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, rz2 - rz1), mat('#3f9be6', { roughness: 0.2, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.04, (rz1 + rz2) / 2);
  scene.add(water);
  world.water = water;
  const db = w.drawbridge, bx1 = db.x - db.width / 2, bx2 = db.x + db.width / 2;
  solid(-H, rz1, bx1, rz2); solid(bx2, rz1, H, rz2);
  const gap = solid(bx1, rz1, bx2, rz2);
  const deckMat = mat('#c98b3c');
  const leafLen = (rz2 - rz1) / 2;
  const leaves = [rz2, rz1].map((hingeZ, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(db.x, 0.3, hingeZ);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(db.width, 0.3, leafLen), deckMat);
    deck.position.z = i === 0 ? -leafLen / 2 : leafLen / 2;
    deck.castShadow = deck.receiveShadow = true;
    pivot.add(deck);
    scene.add(pivot);
    return { pivot, dir: i === 0 ? -1 : 1 };
  });
  const lights = [rz2 + 1, rz1 - 1].flatMap(z => [bx1 - 0.6, bx2 + 0.6].map(x => {
    const post = boxMesh(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 1.6, mat('#4b5263'));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat('#550000', { emissive: '#000000' }));
    lamp.position.set(x, 1.8, z);
    scene.add(post, lamp); solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
    return lamp;
  }));
  // Broken bridge: two stubs that do not meet.
  const bb = w.brokenBridge;
  for (const [z, d] of [[rz2, -1], [rz1, 1]]) {
    const stub = new THREE.Mesh(new THREE.BoxGeometry(bb.width, 0.3, 1.6), deckMat);
    stub.position.set(bb.x, 0.3, z + d * 0.8); stub.rotation.x = d * 0.12; scene.add(stub);
  }

  // How the drawbridge moves: down most of the time, then up for a bit.
  world.bridgeAngle = (t) => {
    const p = t % db.cycle;
    if (p < 4.5) return 0;
    if (p < 5.5) return (p - 4.5) * 1.1;
    if (p < 7) return 1.1;
    return (8 - p) * 1.1;
  };
  world.updateBridge = (t, carPos) => {
    const a = world.bridgeAngle(t), warn = (t % db.cycle) > 3.5;
    leaves.forEach(l => { l.pivot.rotation.x = l.dir * a; });
    const blink = warn && Math.floor(t * 4) % 2 === 0;
    lights.forEach(l => { l.material.emissive.set(blink ? '#ff2020' : a > 0 ? '#aa0000' : '#00aa33'); });
    gap.on = a > 0.05;
    // If the bridge lifts while you are on it, you slide back to the closer side.
    if (gap.on && carPos.x > bx1 && carPos.x < bx2 && carPos.z > rz1 && carPos.z < rz2) {
      carPos.z = carPos.z > (rz1 + rz2) / 2 ? rz2 + 1.4 : rz1 - 1.4;
      world.slid = true;
    }
  };

  // ---------- Conveyor belts ----------
  const beltTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#3c4250'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.moveTo(14, 14); g.lineTo(46, 32); g.lineTo(14, 50); g.lineTo(24, 32); g.fill();
  });
  world.belts = w.conveyors.map(c => {
    const [x1, z1, x2, z2] = c.box;
    const tex = beltTex.clone(); tex.needsUpdate = true;
    tex.repeat.set((x2 - x1) / 3, (z2 - z1) / 3);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), mat('#ffffff', { map: tex }));
    m.rotation.x = -Math.PI / 2; m.position.set((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
    m.receiveShadow = true; scene.add(m);
    return { box: c.box, push: c.push, tex };
  });
  world.pushAt = (x, z) => {
    for (const b of world.belts) {
      const [x1, z1, x2, z2] = b.box;
      if (x > x1 && x < x2 && z > z1 && z < z2) return b.push;
    }
    return null;
  };

  // ---------- Walls, tower, button, yard, house ----------
  const crateMat = mat('#9a7b56');
  w.walls.forEach(([x1, z1, x2, z2]) => { scene.add(boxMesh(x1, z1, x2, z2, 2.5, crateMat)); solid(x1, z1, x2, z2); });

  const [tx, tz] = w.tower;
  scene.add(boxMesh(tx - 1.5, tz - 1.5, tx + 1.5, tz + 1.5, 18, mat('#6c7380', { metalness: 0.5 })));
  solid(tx - 1.6, tz - 1.6, tx + 1.6, tz + 1.6);
  const gear = new THREE.Group();
  gear.add(new THREE.Mesh(new THREE.TorusGeometry(4, 0.8, 10, 24), mat('#ffb300', { metalness: 0.6, roughness: 0.4 })));
  for (let i = 0; i < 12; i++) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.4), mat('#ffb300', { metalness: 0.6 }));
    tooth.position.set(Math.cos(i * Math.PI / 6) * 5, Math.sin(i * Math.PI / 6) * 5, 0);
    tooth.rotation.z = i * Math.PI / 6; gear.add(tooth);
  }
  gear.position.set(tx, 20, tz + 1.6);
  scene.add(gear);
  world.gear = gear;

  const [btx, btz] = w.button;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.3, 28), mat('#ffd23f'));
  pad.position.set(btx, 0.15, btz);
  const button = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.7, 28), mat('#e03c31', { emissive: '#400000' }));
  button.position.set(btx, world.gateOpen ? 0.2 : 0.6, btz);
  scene.add(pad, button);
  world.button = button;

  const { box: [yx1, yz1, yx2, yz2], gateZ, gateWidth } = w.yard;
  const yardMat = mat('#4b3d78');
  const g1 = gateZ - gateWidth / 2, g2 = gateZ + gateWidth / 2;
  // The yard runs to the edge of the world on the north and east, so the gate is the only way in.
  for (const [x1, z1, x2, z2] of [[yx1 - 0.5, -H, yx1 + 0.5, g1], [yx1 - 0.5, g2, yx1 + 0.5, yz2 + 0.5], [yx1 - 0.5, yz2 - 0.5, H, yz2 + 0.5]]) {
    scene.add(boxMesh(x1, z1, x2, z2, 3.2, yardMat)); solid(x1, z1, x2, z2);
  }
  const gate = new THREE.Group();
  for (let i = 0; i < 5; i++) gate.add(boxMesh(yx1 - 0.25, g1 + 0.5 + i * 1.2, yx1 + 0.25, g1 + 0.8 + i * 1.2, 3, mat('#e05555', { metalness: 0.3 })));
  gate.position.y = world.gateOpen ? -3.2 : 0;
  scene.add(gate);
  const gateBox = solid(yx1 - 0.5, g1, yx1 + 0.5, g2);
  gateBox.on = !world.gateOpen;
  world.gateMesh = gate; world.gateBox = gateBox;
  world.gateSpot = new THREE.Vector3(yx1, 0, gateZ);
  world.openGate = () => { world.gateOpen = true; gateBox.on = false; world.gateLowering = 0; };

  const hs = w.house.size, hx = w.house.x, hz = w.house.z;
  const house = new THREE.Group();
  house.add(boxMesh(-hs / 2, -hs / 2, hs / 2, hs / 2, 6, mat('#6d5a9c')));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(hs * 0.8, 5, 4), mat('#3f3168'));
  roof.position.y = 8.5; roof.rotation.y = Math.PI / 4; roof.castShadow = true; house.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 2.4), mat('#2b2140', { emissive: '#1a0f33' }));
  door.position.set(-hs / 2 - 0.1, 1.7, 0); house.add(door);
  for (const z of [-2.5, 2.5]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 1.4), mat('#7dff8a', { emissive: '#3dbb4a' }));
    win.position.set(-hs / 2 - 0.05, 4, z); house.add(win);
  }
  const num = textSprite('1', '#3f3168', '#ffe066');
  num.position.set(-hs / 2 - 0.5, 7, 0); house.add(num);
  house.position.set(hx, 0, hz);
  scene.add(house);
  solid(hx - hs / 2, hz - hs / 2, hx + hs / 2, hz + hs / 2);
  world.doorSpot = new THREE.Vector3(hx - hs / 2 - 1.6, 0, hz);
  const roofGhost = makeModel('ghost', 1.6);
  roofGhost.position.set(hx + 1, 6.2, hz + 2.5); roofGhost.rotation.y = -Math.PI / 2;
  scene.add(roofGhost);
  world.roofGhost = roofGhost;

  // ---------- Portal (shows up after the house) ----------
  const portal = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 14, 40), mat('#b583ff', { emissive: '#7a3fe0' }));
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), mat('#d9c2ff', { emissive: '#9a6bff', transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  portal.add(ring, swirl);
  portal.position.set(w.portal[0], 2.8, w.portal[1]);
  portal.visible = world.houseDone;
  scene.add(portal);
  world.portal = portal;
  world.portalSpot = new THREE.Vector3(w.portal[0], 0, w.portal[1]);

  // ---------- Robots ----------
  w.robots.forEach(r => {
    const m = makeModel('robot', 2.8);
    m.position.set(r.at[0], 0, r.at[1]);
    scene.add(m);
    world.robots.push({ mesh: m, data: r, x: r.at[0], z: r.at[1] });
    world.circles.push({ x: r.at[0], z: r.at[1], r: 0.9 });
  });

  // ---------- Things that bump you ----------
  w.rollers.forEach(r => {
    const m = new THREE.Group();
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.8, 16), mat('#9aa6b8', { metalness: 0.7, roughness: 0.3 }));
    wheel.rotation.x = Math.PI / 2;
    m.add(wheel);
    for (let i = 0; i < 8; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.8), wheel.material);
      tooth.position.set(Math.cos(i * Math.PI / 4) * 1.8, Math.sin(i * Math.PI / 4) * 1.8, 0);
      m.add(tooth);
    }
    m.position.set(r.x1, 2, r.z);
    m.traverse(o => { o.castShadow = true; });
    scene.add(m);
    world.hazards.push({ kind: 'roller', mesh: m, data: r, x: r.x1, z: r.z, r: 1.9, way: 1, knock: true });
  });
  if (!world.houseDone) {
    const dragon = makeModel('dragon', 2.6);
    scene.add(dragon);
    world.hazards.push({ kind: 'dragon', mesh: dragon, data: w.dragonLoop, angle: 0, x: 0, z: 0, r: 1.5, knock: true });
  }

  // ---------- Moving everything each frame ----------
  world.update = (dt, t, carPos, speed) => {
    world.updateBridge(t, carPos);
    // Buildings between the camera and the car turn see-through.
    world.buildings.forEach(b => {
      const inWay = b.z2 > carPos.z + 0.5 && b.z1 < carPos.z + 14 && carPos.x > b.x1 - 3 && carPos.x < b.x2 + 3;
      const goal = inWay ? 0.25 : 1;
      if (Math.abs(b.see - goal) > 0.01) {
        b.see += (goal - b.see) * Math.min(1, dt * 8);
        b.faces.forEach(f => { f.opacity = b.see; f.depthWrite = b.see > 0.9; });
      }
    });
    world.belts.forEach(b => { b.tex.offset.x -= dt * b.push[0] / 3; });
    gear.rotation.z += dt * 0.6;
    roofGhost.userData.animate(t);
    world.robots.forEach(r => {
      r.mesh.userData.animate(t + r.x);
      r.mesh.rotation.y = Math.atan2(carPos.x - r.x, carPos.z - r.z);
    });
    if (world.gateLowering !== undefined && gate.position.y > -3.2) gate.position.y -= dt * 2;
    if (world.gateOpen) button.position.y = Math.max(0.2, button.position.y - dt);
    world.hazards.forEach(h => {
      if (h.kind === 'roller') {
        h.x += h.way * h.data.speed * speed * dt;
        if (h.x > h.data.x2) { h.x = h.data.x2; h.way = -1; }
        if (h.x < h.data.x1) { h.x = h.data.x1; h.way = 1; }
        h.mesh.position.x = h.x;
        h.mesh.rotation.z -= h.way * h.data.speed * speed * dt / 1.8;
      }
      if (h.kind === 'dragon') {
        const L = h.data;
        h.angle += dt * L.speed * speed / L.r;
        h.x = L.x + Math.cos(h.angle) * L.r; h.z = L.z + Math.sin(h.angle) * L.r;
        h.mesh.position.set(h.x, 0.6 + Math.sin(t * 3) * 0.3, h.z);
        h.mesh.rotation.y = Math.atan2(-Math.sin(h.angle), Math.cos(h.angle));
        h.mesh.userData.animate(t);
      }
    });
    if (portal.visible) { swirl.rotation.z += dt * 2; ring.rotation.z -= dt; }
  };

  world.removeDragon = () => {
    world.hazards = world.hazards.filter(h => { if (h.kind === 'dragon') scene.remove(h.mesh); return h.kind !== 'dragon'; });
  };
  return world;
}

// ---------- Collisions ----------

// Push a circle (the car) out of every solid box and circle.
export function resolve(world, pos, r) {
  let hit = false;
  for (const b of world.boxes) {
    if (!b.on) continue;
    const cx = Math.max(b.x1, Math.min(b.x2, pos.x)), cz = Math.max(b.z1, Math.min(b.z2, pos.z));
    const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    hit = true;
    if (d > 1e-4) { pos.x = cx + dx / d * r; pos.z = cz + dz / d * r; continue; }
    // The middle is inside the box: push out the shortest way.
    const out = [[pos.x - b.x1, -1, 0], [b.x2 - pos.x, 1, 0], [pos.z - b.z1, 0, -1], [b.z2 - pos.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
    pos.x += out[1] * (out[0] + r); pos.z += out[2] * (out[0] + r);
  }
  for (const c of world.circles) {
    const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), min = r + c.r;
    if (d < min && d > 1e-4) { pos.x = c.x + dx / d * min; pos.z = c.z + dz / d * min; hit = true; }
  }
  return hit;
}

export function inBox(x, z, [x1, z1, x2, z2]) { return x > x1 && x < x2 && z > z1 && z < z2; }
