// world.js
// Builds a world from its layout in worlds.js, and runs everything that moves.
//
// The ground has real hills and mountains: heightAt(x, z) says how high it is.
// Collisions are flat (seen from above): the car is a circle, and solid things
// are boxes or circles. resolve(world, pos, r) pushes the car out of them.

import * as THREE from 'three';
import { makeModel } from './models.js';

const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85 }, extra));
export const inBox = (x, z, [x1, z1, x2, z2]) => x > x1 && x < x2 && z > z1 && z < z2;

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
function seeded(text) {
  let s = 7;
  for (const ch of text) s = (s * 31 + ch.charCodeAt(0)) % 2147483647;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---------- Ground textures, one per kind of world ----------

function groundTexture(kind, color) {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 128, 128);
    const rnd = seeded(kind);
    if (kind === 'plates') {
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3; g.strokeRect(2, 2, 124, 124);
      g.fillStyle = 'rgba(40,50,70,0.35)';
      for (const [x, y] of [[10, 10], [118, 10], [10, 118], [118, 118]]) g.fillRect(x - 3, y - 3, 6, 6);
    } else if (kind === 'stone') {
      g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 3;
      for (let y = 0; y < 128; y += 32) { g.strokeRect(0, y, 64, 32); g.strokeRect(64, y, 64, 32); g.strokeRect(-32, y + 16, 64, 32); g.strokeRect(32, y + 16, 64, 32); g.strokeRect(96, y + 16, 64, 32); }
    } else {
      const dots = { snow: 'rgba(160,190,230,0.5)', grass: 'rgba(40,110,40,0.5)', night: 'rgba(170,220,255,0.5)', ash: 'rgba(255,120,40,0.35)' }[kind] || 'rgba(0,0,0,0.2)';
      g.fillStyle = dots;
      for (let i = 0; i < 70; i++) g.fillRect(rnd() * 128, rnd() * 128, 2 + rnd() * 3, 2 + rnd() * 3);
      if (kind === 'ash') {
        g.strokeStyle = 'rgba(255,90,20,0.5)'; g.lineWidth = 2; g.beginPath();
        for (let i = 0; i < 5; i++) { let x = rnd() * 128, y = rnd() * 128; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rnd() * 24 - 12; y += rnd() * 24 - 12; g.lineTo(x, y); } }
        g.stroke();
      }
    }
  });
}

// ---------- Building the world ----------

export function buildWorld(scene, w, flags) {
  const theme = w.theme, rnd = seeded(w.id);
  const doneSwitches = new Set(flags.switches || []);
  const world = {
    data: w, boxes: [], circles: [], robots: [], hazards: [], shots: [], buildings: [], belts: [], pads: [],
    teleports: [], switches: [], gates: [], bridges: [], houseDone: !!flags.houseDone, scene,
  };
  const solid = (x1, z1, x2, z2) => { const b = { x1, z1, x2, z2, on: true }; world.boxes.push(b); return b; };
  const H = 60;

  // ----- Height of the ground: hills you drive over, mountains you cannot -----
  const bumps = (w.hills || []).concat(w.mountains || []);
  const heightAt = (x, z) => {
    let h = 0;
    for (const [hx, hz, r, top] of bumps) {
      const d2 = ((x - hx) ** 2 + (z - hz) ** 2) / (r * r);
      if (d2 < 6) h += top * Math.exp(-d2);
    }
    const edge = Math.max(Math.abs(x), Math.abs(z)) - 61;   // the ring of mountains around the world
    if (edge > 0) h += edge * 1.1 + Math.sin(x * 0.21) * Math.cos(z * 0.17) * Math.min(edge, 6);
    return h;
  };
  world.heightAt = heightAt;
  (w.mountains || []).forEach(([x, z, r]) => world.circles.push({ x, z, r: r * 0.75 }));

  const size = 200, seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = [];
  const snowy = new THREE.Color(theme.ground === 'ash' ? '#3a2a24' : theme.ground === 'night' || theme.ground === 'stone' ? '#8a86a8' : '#ffffff');
  for (let i = 0; i < pos.count; i++) {
    const h = heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    const c = new THREE.Color('#ffffff').lerp(snowy, Math.min(1, Math.max(0, (h - 5) / 8)));
    const shade = 1 - Math.min(0.25, Math.max(0, h - 1) * 0.02);
    colors.push(c.r * shade, c.g * shade, c.b * shade);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const tex = groundTexture(theme.ground, theme.groundColor);
  tex.repeat.set(size / 4, size / 4);
  const ground = new THREE.Mesh(geo, mat('#ffffff', { map: tex, vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // A flat strip that hugs the ground (roads, belts, ice).
  function groundStrip([x1, z1, x2, z2], material, lift) {
    const sx = Math.max(1, Math.round((x2 - x1) / 2)), sz = Math.max(1, Math.round((z2 - z1) / 2));
    const g = new THREE.PlaneGeometry(x2 - x1, z2 - z1, sx, sz);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + (x1 + x2) / 2, z = p.getZ(i) + (z1 + z2) / 2;
      p.setXYZ(i, x, heightAt(x, z) + (lift || 0.03), z);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  const at = (obj, x, z, up) => { obj.position.set(x, heightAt(x, z) + (up || 0), z); return obj; };

  const roadMat = mat(theme.road);
  (w.streets || []).forEach(b => groundStrip(b, roadMat));

  // The edge of the world (hidden behind the mountains)
  for (const [x1, z1, x2, z2] of [[-H - 2, -H - 2, H + 2, -H], [-H - 2, H, H + 2, H + 2], [-H - 2, -H, -H, H], [H, -H, H + 2, H]]) solid(x1, z1, x2, z2);

  // ----- Walls and buildings -----
  const wallLook = {
    crate: () => mat('#9a7b56'), snowcliff: () => mat('#e8f0fa'), hedge: () => mat('#2f7d3a'),
    stone: () => mat('#5a4f78'), ice: () => mat('#9fd6ff', { transparent: true, opacity: 0.8, roughness: 0.2 }),
    yard: () => mat(theme.edge),
  };
  function wallBox([x1, z1, x2, z2], h, look) {
    const base = Math.min(heightAt(x1, z1), heightAt(x2, z2), heightAt((x1 + x2) / 2, (z1 + z2) / 2));
    const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, h + 2, z2 - z1), look);
    m.position.set((x1 + x2) / 2, base - 2 + (h + 2) / 2, (z1 + z2) / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  (w.walls || []).forEach(wl => { if (wl.style !== 'hidden') wallBox(wl.box, wl.h || 3, (wallLook[wl.style] || wallLook.stone)()); solid(...wl.box); });
  (w.yardWalls || []).forEach(b => { wallBox(b, 3.2, wallLook.yard()); solid(...b); });

  if (w.cityBlocks) {
    const windows = canvasTexture(64, 64, (g) => {
      g.fillStyle = '#6f7a8e'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#ffe9a8';
      for (let y = 8; y < 64; y += 28) for (let x = 8; x < 64; x += 28) g.fillRect(x, y, 18, 14);
    });
    w.cityBlocks.xs.forEach(([bx1, bx2]) => w.cityBlocks.zs.forEach(([bz1, bz2]) => {
      const x1 = bx1 + 1.5, x2 = bx2 - 1.5, z1 = bz1 + 1.5, z2 = bz2 - 1.5, h = 4 + Math.floor(rnd() * 7);
      const t = windows.clone(); t.needsUpdate = true;
      t.repeat.set(Math.round((x2 - x1) / 3), Math.round(h / 3));
      const hue = ['#8792a6', '#7f9ab0', '#9a8fb0', '#8fa5a0'][Math.floor(rnd() * 4)];
      const faces = [0, 1, 2, 3, 4, 5].map(i => mat(i === 2 || i === 3 ? '#5d6475' : hue, i === 2 || i === 3 ? {} : { map: t }));
      faces.forEach(f => { f.transparent = true; });
      wallBox([x1, z1, x2, z2], h, faces);
      solid(x1, z1, x2, z2);
      world.buildings.push({ x1, z1, x2, z2, faces, see: 1 });
    }));
  }

  // ----- Trees, rocks, mushrooms and crystals -----
  const keepAway = [w.start, w.portal, ...(w.switches || []).map(s => s.at), ...(w.robots || []).map(r => r.at),
    ...(w.jumpPads || []).flatMap(p => [p.at, p.to]), ...(w.teleports || []).flatMap(t => [t.a, t.b])];
  const looks = {
    pine: { r: 1.1, make: () => { const g = new THREE.Group(); g.add(shaped(new THREE.CylinderGeometry(0.25, 0.3, 1.2), '#6b4a2b', 0.6)); [[1.6, 2, 1.6], [1.2, 1.8, 2.6], [0.8, 1.4, 3.4]].forEach(([r, h, y]) => g.add(shaped(new THREE.ConeGeometry(r, h, 9), theme.ground === 'snow' ? '#2f6b4f' : '#2f7d3a', y))); if (theme.ground === 'snow') g.add(shaped(new THREE.ConeGeometry(0.5, 0.6, 9), '#ffffff', 4)); return g; } },
    tree: { r: 1.3, make: () => { const g = new THREE.Group(); g.add(shaped(new THREE.CylinderGeometry(0.3, 0.35, 1.6), '#7a5230', 0.8)); g.add(shaped(new THREE.SphereGeometry(1.6, 12, 10), ['#3fae4a', '#55c25a', '#2f9a45'][Math.floor(rnd() * 3)], 2.6)); return g; } },
    rock: { r: 1.2, make: () => shaped(new THREE.DodecahedronGeometry(1.3), '#8a8f99', 0.6) },
    icerock: { r: 1.4, make: () => shaped(new THREE.DodecahedronGeometry(1.5), '#bfe6ff', 0.5, { roughness: 0.2 }) },
    lavarock: { r: 1.3, make: () => shaped(new THREE.DodecahedronGeometry(1.4), '#3a2a24', 0.6) },
    mushroom: { r: 0.8, make: () => { const g = new THREE.Group(); g.add(shaped(new THREE.CylinderGeometry(0.2, 0.3, 1), '#e8e0d0', 0.5)); g.add(shaped(new THREE.SphereGeometry(0.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ['#4dffc3', '#ff6bd5', '#8fb3ff'][Math.floor(rnd() * 3)], 1, { emissiveIntensity: 1.2 }, true)); return g; } },
    crystal: { r: 1, make: () => shaped(new THREE.OctahedronGeometry(1.2), ['#b583ff', '#4dffc3', '#ff8fd9'][Math.floor(rnd() * 3)], 1.4, { roughness: 0.2 }, true) },
  };
  function shaped(geometry, color, y, extra, glow) {
    const m = new THREE.Mesh(geometry, mat(color, Object.assign(glow ? { emissive: color } : {}, extra || {})));
    m.position.y = y; m.castShadow = true;
    return m;
  }
  (w.scatter || []).forEach(sc => {
    const look = looks[sc.style];
    for (let i = 0, tries = 0; i < sc.count && tries < sc.count * 20; tries++) {
      const x = sc.box[0] + rnd() * (sc.box[2] - sc.box[0]), z = sc.box[1] + rnd() * (sc.box[3] - sc.box[1]);
      if (keepAway.some(p => p && Math.hypot(p[0] - x, p[1] - z) < 5)) continue;
      if ((w.streets || []).some(b => inBox(x, z, [b[0] - 1.5, b[1] - 1.5, b[2] + 1.5, b[3] + 1.5]))) continue;
      if (world.circles.some(c => Math.hypot(c.x - x, c.z - z) < c.r + look.r + 0.5)) continue;
      if (world.boxes.some(b => x > b.x1 - 2 && x < b.x2 + 2 && z > b.z1 - 2 && z < b.z2 + 2)) continue;
      const m = look.make();
      m.rotation.y = rnd() * 6;
      m.scale.setScalar(0.8 + rnd() * 0.5);
      scene.add(at(m, x, z));
      world.circles.push({ x, z, r: look.r });
      i++;
    }
  });

  // ----- Rivers, lava and canyons -----
  const waterLook = {
    water: () => mat('#3f9be6', { roughness: 0.2 }),
    lava: () => mat('#ff5a1f', { emissive: '#d83a00' }),
    chasm: () => mat('#1a1530'),
  };
  world.lavaMats = [];
  (w.water || []).forEach(wt => {
    const [x1, z1, x2, z2] = wt.box, m = (waterLook[wt.style || 'water'])();
    if (wt.style === 'lava') world.lavaMats.push(m);
    groundStrip(wt.box, m, wt.style === 'chasm' ? 0.02 : 0.05);
    if (wt.style === 'chasm') {
      for (const z of [z1, z2]) {
        const lip = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, 0.3, 0.4), mat('#5a4a3a'));
        at(lip, (x1 + x2) / 2, z, 0.1); scene.add(lip);
      }
    }
    solid(x1, z1, x2, z2);
  });

  // ----- Bridges: drawbridges lift, stepping stones sink, broken ones are decoys -----
  (w.bridges || []).forEach(br => {
    const [x1, z1, x2, z2] = br.box, cx = (x1 + x2) / 2, width = x2 - x1, len = z2 - z1;
    if (br.kind === 'broken') {
      for (const [z, d] of [[z2, -1], [z1, 1]]) {
        const stub = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, 1.6), mat('#c98b3c'));
        stub.position.set(cx, 0.3, z + d * 0.8); stub.rotation.x = d * 0.12; scene.add(stub);
      }
      return;
    }
    const bridge = { box: br.box, cycle: br.cycle || 8, offset: br.offset || 0, kind: br.kind, gap: solid(x1, z1, x2, z2), parts: [], lamps: [] };
    if (br.kind === 'draw') {
      [z2, z1].forEach((hz, i) => {
        const pivot = new THREE.Group(); pivot.position.set(cx, 0.3, hz);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, len / 2), mat('#c98b3c'));
        deck.position.z = i === 0 ? -len / 4 : len / 4; deck.castShadow = deck.receiveShadow = true;
        pivot.add(deck); scene.add(pivot);
        bridge.parts.push({ pivot, dir: i === 0 ? -1 : 1 });
      });
    } else {
      for (let k = 0; k < 3; k++) {
        const stone = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.45, width * 0.5, 0.6, 7), mat('#7a6a5a'));
        stone.position.set(cx, 0.1, z1 + len * (k + 0.5) / 3); stone.castShadow = stone.receiveShadow = true;
        scene.add(stone);
        bridge.parts.push({ stone });
      }
    }
    for (const z of [z2 + 1, z1 - 1]) for (const x of [x1 - 0.6, x2 + 0.6]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.4), mat('#4b5263'));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat('#550000'));
      post.position.set(x, 0.8, z); lamp.position.set(x, 1.8, z);
      scene.add(post, lamp); solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
      bridge.lamps.push(lamp);
    }
    world.bridges.push(bridge);
  });
  // 0 means the bridge is open to drive on; 1 means it is up (or sunk).
  const bridgeState = (b, t) => {
    const p = (t + b.offset) % b.cycle, open = b.cycle * 0.56;
    if (p < open) return 0;
    if (p < open + 1) return p - open;
    if (p < b.cycle - 1) return 1;
    return b.cycle - p;
  };
  world.bridgeState = bridgeState;

  // ----- Conveyor belts and ice -----
  const beltTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#3c4250'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(14, 14); g.lineTo(46, 32); g.lineTo(14, 50); g.lineTo(24, 32); g.fill();
  });
  (w.conveyors || []).forEach(c => {
    const t = beltTex.clone(); t.needsUpdate = true;
    t.repeat.set((c.box[2] - c.box[0]) / 3, (c.box[3] - c.box[1]) / 3);
    groundStrip(c.box, mat('#ffffff', { map: t }), 0.05);
    world.belts.push({ box: c.box, push: c.push, tex: t });
  });
  (w.ice || []).forEach(b => groundStrip(b, mat('#cfefff', { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }), 0.04));
  world.pushAt = (x, z) => { const b = world.belts.find(b => inBox(x, z, b.box)); return b ? b.push : null; };
  world.iceAt = (x, z) => (w.ice || []).some(b => inBox(x, z, b));

  // ----- Spring pads and magic teleport pads -----
  (w.jumpPads || []).forEach(p => {
    const g = new THREE.Group();
    g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.3, 24), mat('#ffd23f')), { position: new THREE.Vector3(0, 0.15, 0) }));
    const coil = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.18, 8, 20), mat('#ff5fa2'));
    coil.rotation.x = Math.PI / 2; coil.position.y = 0.5; g.add(coil);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.2, 4), mat('#ff5fa2', { emissive: '#802050' }));
    const dx = p.to[0] - p.at[0], dz = p.to[1] - p.at[1];
    arrow.rotation.set(Math.PI / 2, 0, -Math.atan2(dx, dz) + Math.PI); arrow.rotation.order = 'YXZ';
    arrow.rotation.y = Math.atan2(dx, dz); arrow.rotation.x = Math.PI / 2;
    arrow.position.y = 1.2; g.add(arrow);
    scene.add(at(g, p.at[0], p.at[1]));
    world.pads.push({ at: p.at, to: p.to, coil, arrow });
  });
  (w.teleports || []).forEach(tp => {
    const ends = [tp.a, tp.b].map(p => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.25, 10, 30), mat(tp.color, { emissive: tp.color }));
      ring.rotation.x = Math.PI / 2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 30), mat(tp.color, { emissive: tp.color, transparent: true, opacity: 0.5 }));
      disc.rotation.x = -Math.PI / 2;
      const g = new THREE.Group(); g.add(ring, disc);
      scene.add(at(g, p[0], p[1], 0.15));
      return g;
    });
    world.teleports.push({ a: tp.a, b: tp.b, meshes: ends });
  });

  // ----- Landmark you can see from far away -----
  world.spinners = [];
  const lm = w.landmark;
  if (lm) {
    const [lx, lz] = lm.at, g = new THREE.Group();
    if (lm.kind === 'gear') {
      g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(3, 18, 3), mat('#6c7380', { metalness: 0.5 })), { position: new THREE.Vector3(0, 9, 0) }));
      const gear = new THREE.Group();
      gear.add(new THREE.Mesh(new THREE.TorusGeometry(4, 0.8, 10, 24), mat('#ffb300', { metalness: 0.6 })));
      for (let i = 0; i < 12; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.4), mat('#ffb300', { metalness: 0.6 }));
        tooth.position.set(Math.cos(i * Math.PI / 6) * 5, Math.sin(i * Math.PI / 6) * 5, 0); tooth.rotation.z = i * Math.PI / 6; gear.add(tooth);
      }
      gear.position.set(0, 20, 1.6); g.add(gear); world.spinners.push({ obj: gear, axis: 'z', speed: 0.6 });
      solid(lx - 1.6, lz - 1.6, lx + 1.6, lz + 1.6);
    } else if (lm.kind === 'crystal') {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(4), mat('#9fe3ff', { emissive: '#3aa8e0', roughness: 0.1 }));
      c.scale.y = 3; c.position.y = 14; g.add(c); world.spinners.push({ obj: c, axis: 'y', speed: 0.4 });
    } else if (lm.kind === 'yoyoTower') {
      g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 22), mat('#8a5a2b')), { position: new THREE.Vector3(0, 11, 0) }));
      const yo = makeModel('yoyo', 6); yo.position.y = 14; g.add(yo); world.spinners.push({ obj: yo, axis: 'bob', speed: 1.2 });
    } else if (lm.kind === 'moon') {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff3c4', fog: false }));
      moon.position.y = 45; g.add(moon);
    } else if (lm.kind === 'volcano') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(12, 18, 24, 1, true), mat('#4a2f22'));
      cone.position.y = 9; g.add(cone);
      const crater = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), mat('#ff5a1f', { emissive: '#ff3a00' }));
      crater.rotation.x = -Math.PI / 2; crater.position.y = 16; g.add(crater);
      world.circles.push({ x: lx, z: lz, r: 10 });
      world.smoke = { x: lx, z: lz, y: 18, puffs: [] };
    }
    scene.add(at(g, lx, lz));
  }

  // ----- Buttons and stars, and the gates they open -----
  (w.switches || []).forEach((sw, i) => {
    const done = doneSwitches.has(i);
    const g = new THREE.Group();
    let top;
    if (sw.kind === 'star') {
      const shape = new THREE.Shape();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.5 : 1.2, a = k * Math.PI / 5; k ? shape.lineTo(Math.sin(a) * r, Math.cos(a) * r) : shape.moveTo(0, r); }
      top = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }), mat('#ffe14d', { emissive: '#ffb300' }));
      top.position.y = 2;
      const glow = new THREE.PointLight('#ffe14d', 8, 10); glow.position.y = 2; g.add(glow);
    } else {
      g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.3, 28), mat('#ffd23f')), { position: new THREE.Vector3(0, 0.15, 0) }));
      top = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.7, 28), mat('#e03c31', { emissive: '#400000' }));
      top.position.y = done ? 0.2 : 0.6;
    }
    g.add(top);
    scene.add(at(g, sw.at[0], sw.at[1]));
    if (done && sw.kind === 'star') g.visible = false;
    world.switches.push({ at: sw.at, kind: sw.kind, done, group: g, top });
  });
  const gateLook = { ice: () => mat('#9fd6ff', { transparent: true, opacity: 0.8 }), hedge: () => mat('#2f7d3a'), stone: () => mat('#5a4f78') };
  (w.gates || []).forEach((gt, i) => {
    const needs = gt.needs || world.switches.map((s, k) => k);
    const look = gt.style ? gateLook[gt.style]() : mat('#e05555', { metalness: 0.3 });
    const m = wallBox(gt.box, 3, look);
    const gate = { box: gt.box, needs, mesh: m, solid: solid(...gt.box), open: false, sink: 0 };
    gate.open = needs.every(k => doneSwitches.has(k));
    gate.solid.on = !gate.open;
    if (gate.open) m.visible = false;
    world.gates.push(gate);
  });
  world.switchDone = (i) => world.switches[i] && world.switches[i].done;
  // Press a switch. Returns the gate it opened, if any.
  world.press = (i) => {
    const sw = world.switches[i];
    sw.done = true;
    if (sw.kind === 'star') sw.group.visible = false;
    const opened = world.gates.find(g => !g.open && g.needs.every(k => world.switches[k].done));
    if (opened) { opened.open = true; opened.solid.on = false; }
    return opened;
  };

  // ----- The haunted house -----
  const hs = w.house.size, hx = w.house.x, hz = w.house.z, tall = w.house.tall ? 10 : 6;
  const house = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(hs, tall + 2, hs), mat(theme.house));
  walls.position.y = tall / 2 - 1; walls.castShadow = walls.receiveShadow = true; house.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(hs * 0.8, w.house.tall ? 9 : 5, 4), mat('#2b2140'));
  roof.position.y = tall + (w.house.tall ? 4.5 : 2.5); roof.rotation.y = Math.PI / 4; roof.castShadow = true; house.add(roof);
  const doorDir = { west: [-1, 0], east: [1, 0], south: [0, 1], north: [0, -1] }[w.house.door];
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorDir[0] ? 0.3 : 2.4, 3.4, doorDir[0] ? 2.4 : 0.3), mat('#2b2140', { emissive: '#1a0f33' }));
  door.position.set(doorDir[0] * (hs / 2 + 0.1), 1.7, doorDir[1] * (hs / 2 + 0.1)); house.add(door);
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(doorDir[0] ? 0.2 : 1.4, 1.4, doorDir[0] ? 1.4 : 0.2), mat('#7dff8a', { emissive: '#3dbb4a' }));
    win.position.set(doorDir[0] * (hs / 2 + 0.05) + (doorDir[1] ? s * 2.4 : 0), 4, doorDir[1] * (hs / 2 + 0.05) + (doorDir[0] ? s * 2.4 : 0));
    house.add(win);
  }
  const sign = canvasTexture(128, 128, (g) => {
    g.fillStyle = '#ffe066'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3f3168'; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(WORLD_NUMBER(w)), 64, 70);
  });
  const num = new THREE.Sprite(new THREE.SpriteMaterial({ map: sign })); num.scale.set(2, 2, 2);
  num.position.set(doorDir[0] * (hs / 2 + 0.5), tall + 1, doorDir[1] * (hs / 2 + 0.5)); house.add(num);
  scene.add(at(house, hx, hz));
  solid(hx - hs / 2, hz - hs / 2, hx + hs / 2, hz + hs / 2);
  world.doorSpot = new THREE.Vector3(hx + doorDir[0] * (hs / 2 + 1.6), 0, hz + doorDir[1] * (hs / 2 + 1.6));
  const roofGhost = makeModel('ghost', 1.6);
  roofGhost.position.set(hx + 1.5, house.position.y + tall + 0.5, hz + 1.5);
  scene.add(roofGhost);
  world.roofGhost = roofGhost;

  // ----- Portal (appears after you beat the house) -----
  const portal = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 14, 40), mat('#b583ff', { emissive: '#7a3fe0' }));
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(2.2, 40), mat('#d9c2ff', { emissive: '#9a6bff', transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  portal.add(ring, swirl);
  at(portal, w.portal[0], w.portal[1], 2.8);
  portal.visible = world.houseDone;
  scene.add(portal);
  world.portal = portal; world.ring = ring; world.swirl = swirl;
  world.portalSpot = new THREE.Vector3(w.portal[0], 0, w.portal[1]);

  // ----- Robots -----
  (w.robots || []).forEach(r => {
    const m = makeModel('robot', 2.8);
    scene.add(at(m, r.at[0], r.at[1]));
    world.robots.push({ mesh: m, data: r, x: r.at[0], z: r.at[1] });
    world.circles.push({ x: r.at[0], z: r.at[1], r: 0.9 });
  });

  // ----- Things that bump you -----
  const rollerLook = {
    gear: () => { const m = new THREE.Group(); const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.8, 16), mat('#9aa6b8', { metalness: 0.7 })); wheel.rotation.x = Math.PI / 2; m.add(wheel); for (let i = 0; i < 8; i++) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.8), wheel.material); tooth.position.set(Math.cos(i * Math.PI / 4) * 1.8, Math.sin(i * Math.PI / 4) * 1.8, 0); m.add(tooth); } return { mesh: m, y: 2, r: 1.9, spin: true }; },
    boulder: () => ({ mesh: new THREE.Mesh(new THREE.DodecahedronGeometry(1.6), mat('#7b7f88')), y: 1.6, r: 1.7, spin: true }),
    fireball: () => ({ mesh: new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), mat('#ff7a1f', { emissive: '#ff3a00' })), y: 1.4, r: 1.5, spin: true }),
    yoyo: () => ({ mesh: makeModel('yoyo', 2.6), y: 1.2, r: 1.5, string: true }),
  };
  (w.rollers || []).forEach(rl => {
    const look = rollerLook[rl.kind]();
    look.mesh.traverse(o => { o.castShadow = true; });
    scene.add(look.mesh);
    const hz = { kind: 'roller', data: rl, mesh: look.mesh, y: look.y, r: look.r, spin: look.spin, p: 0, way: 1, x: rl.from[0], z: rl.from[1], guard: rl.guard };
    if (look.string) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      hz.string = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#ffffff' }));
      const mx = (rl.from[0] + rl.to[0]) / 2, mz = (rl.from[1] + rl.to[1]) / 2;
      hz.anchor = new THREE.Vector3(mx, heightAt(mx, mz) + 14, mz);
      scene.add(hz.string);
    }
    world.hazards.push(hz);
  });
  (w.patrols || []).forEach(pt => {
    const m = makeModel(pt.kind, 2.6);
    scene.add(m);
    world.hazards.push({ kind: 'patrol', data: pt, mesh: m, angle: 0, x: pt.x + pt.r, z: pt.z, r: 1.5, guard: pt.guard });
  });
  (w.cannons || []).forEach(cn => {
    const m = makeModel('snowgun', 2.4);
    m.rotation.y = Math.atan2(cn.dir[0], cn.dir[1]);
    scene.add(at(m, cn.at[0], cn.at[1]));
    world.circles.push({ x: cn.at[0], z: cn.at[1], r: 1 });
    world.hazards.push({ kind: 'cannon', data: cn, mesh: m, timer: cn.offset || 0, x: cn.at[0], z: cn.at[1], r: 0, guard: cn.guard });
  });
  (w.wizards || []).forEach(wz => {
    const m = makeModel('wizard', 2.4);
    scene.add(at(m, wz.home[0], wz.home[1]));
    world.hazards.push({ kind: 'wizard', data: wz, mesh: m, timer: 0, cast: 1.5, x: wz.home[0], z: wz.home[1], r: 1.2, guard: wz.guard });
  });

  const shotGeo = { snow: new THREE.SphereGeometry(0.6, 12, 10), sparkle: new THREE.OctahedronGeometry(0.6) };
  const shotMat = { snow: mat('#ffffff'), sparkle: mat('#ffe14d', { emissive: '#ffb300' }) };
  function shoot(kind, x, z, dx, dz, speed, range) {
    const m = new THREE.Mesh(shotGeo[kind], shotMat[kind]);
    scene.add(m);
    world.shots.push({ kind, mesh: m, x, z, vx: dx * speed, vz: dz * speed, left: range / speed, r: 0.7 });
  }
  const freeSpot = (x, z) => !world.boxes.some(b => b.on && x > b.x1 - 1.3 && x < b.x2 + 1.3 && z > b.z1 - 1.3 && z < b.z2 + 1.3) &&
    !world.circles.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 1.3) && heightAt(x, z) < 4;
  world.freeSpot = freeSpot;

  // ----- Moving everything, every frame -----
  world.update = (dt, t, car, speed) => {
    world.bridges.forEach(b => {
      const s = bridgeState(b, t), warn = ((t + b.offset) % b.cycle) > b.cycle * 0.56 - 1;
      b.gap.on = s > 0.05;
      if (b.kind === 'draw') b.parts.forEach(p => { p.pivot.rotation.x = p.dir * s * 1.1; });
      else b.parts.forEach((p, k) => { p.stone.position.y = 0.1 - s * 1.2 + Math.sin(t * 3 + k) * 0.05; p.stone.material.emissive.set(warn && s < 0.05 && Math.floor(t * 4) % 2 ? '#801000' : '#000000'); });
      const blink = warn && Math.floor(t * 4) % 2 === 0;
      b.lamps.forEach(l => l.material.emissive.set(blink ? '#ff2020' : s > 0 ? '#aa0000' : '#00aa33'));
      const [x1, z1, x2, z2] = b.box;
      if (b.gap.on && inBox(car.x, car.z, b.box)) {
        car.z = car.z > (z1 + z2) / 2 ? z2 + 1.4 : z1 - 1.4;
        world.slid = b.kind;
      }
    });
    world.buildings.forEach(b => {
      const inWay = b.z2 > car.z + 0.5 && b.z1 < car.z + 14 && car.x > b.x1 - 3 && car.x < b.x2 + 3;
      const goal = inWay ? 0.25 : 1;
      if (Math.abs(b.see - goal) > 0.01) {
        b.see += (goal - b.see) * Math.min(1, dt * 8);
        b.faces.forEach(f => { f.opacity = b.see; f.depthWrite = b.see > 0.9; });
      }
    });
    world.belts.forEach(b => { b.tex.offset.x -= dt * b.push[0] / 3; b.tex.offset.y += dt * b.push[1] / 3; });
    world.lavaMats.forEach(m => m.emissive.setHSL(0.04, 1, 0.35 + Math.sin(t * 2) * 0.06));
    world.spinners.forEach(s => { if (s.axis === 'bob') s.obj.position.y = 10 + Math.sin(t * s.speed) * 6; else s.obj.rotation[s.axis] += dt * s.speed; });
    world.pads.forEach(p => { p.coil.position.y = 0.5 + Math.abs(Math.sin(t * 4)) * 0.3; });
    world.teleports.forEach(tp => tp.meshes.forEach(m => { m.rotation.y += dt * 1.5; }));
    world.switches.forEach(sw => {
      if (sw.kind === 'star') { sw.top.rotation.y += dt * 2; sw.top.position.y = 2 + Math.sin(t * 2) * 0.3; }
      else if (sw.done) sw.top.position.y = Math.max(0.2, sw.top.position.y - dt);
    });
    world.gates.forEach(g => { if (g.open && g.mesh.visible) { g.sink += dt * 2; g.mesh.position.y -= dt * 2; if (g.sink > 6) g.mesh.visible = false; } });
    roofGhost.userData.animate(t);
    world.robots.forEach(r => { r.mesh.userData.animate(t + r.x); r.mesh.rotation.y = Math.atan2(car.x - r.x, car.z - r.z); });
    if (world.smoke && Math.random() < dt * 3) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), mat('#777777', { transparent: true, opacity: 0.6 }));
      puff.position.set(world.smoke.x, heightAt(world.smoke.x, world.smoke.z) + world.smoke.y, world.smoke.z);
      scene.add(puff); world.smoke.puffs.push({ mesh: puff, life: 4 });
    }
    if (world.smoke) world.smoke.puffs = world.smoke.puffs.filter(p => {
      p.life -= dt; p.mesh.position.y += dt * 2; p.mesh.scale.multiplyScalar(1 + dt * 0.3); p.mesh.material.opacity = p.life / 6;
      if (p.life <= 0) scene.remove(p.mesh);
      return p.life > 0;
    });

    world.hazards.forEach(h => {
      if (h.kind === 'roller') {
        const [fx, fz] = h.data.from, [tx, tz] = h.data.to, len = Math.hypot(tx - fx, tz - fz);
        h.p += h.way * h.data.speed * speed * dt / len;
        if (h.p > 1) { h.p = 1; h.way = -1; }
        if (h.p < 0) { h.p = 0; h.way = 1; }
        h.x = fx + (tx - fx) * h.p; h.z = fz + (tz - fz) * h.p;
        h.mesh.position.set(h.x, heightAt(h.x, h.z) + h.y, h.z);
        if (h.spin) { h.mesh.rotation.y = Math.atan2(tx - fx, tz - fz) + Math.PI / 2; h.mesh.rotation.z -= h.way * h.data.speed * speed * dt / h.r; }
        else { h.mesh.userData.animate(t); h.mesh.rotation.y = Math.atan2(car.x - h.x, car.z - h.z); }
        if (h.string) {
          const p = h.string.geometry.attributes.position;
          p.setXYZ(0, h.anchor.x, h.anchor.y, h.anchor.z); p.setXYZ(1, h.x, h.mesh.position.y + 1.5, h.z); p.needsUpdate = true;
        }
      } else if (h.kind === 'patrol') {
        const L = h.data;
        h.angle += dt * L.speed * speed / L.r;
        h.x = L.x + Math.cos(h.angle) * L.r; h.z = L.z + Math.sin(h.angle) * L.r;
        h.mesh.position.set(h.x, heightAt(h.x, h.z) + 0.6 + Math.sin(t * 3) * 0.3, h.z);
        h.mesh.rotation.y = Math.atan2(-Math.sin(h.angle), Math.cos(h.angle));
        h.mesh.userData.animate(t);
      } else if (h.kind === 'cannon') {
        h.timer += dt * speed;
        h.mesh.userData.animate(t);
        if (h.timer >= h.data.every) {
          h.timer = 0;
          const [dx, dz] = h.data.dir;
          shoot('snow', h.x + dx * 1.5, h.z + dz * 1.5, dx, dz, h.data.speed * speed, h.data.range);
        }
      } else if (h.kind === 'wizard') {
        h.timer += dt; h.cast -= dt;
        h.mesh.userData.animate(t);
        h.mesh.rotation.y = Math.atan2(car.x - h.x, car.z - h.z);
        if (h.timer > 3) {
          h.timer = 0;
          for (let k = 0; k < 20; k++) {
            const a = rnd() * Math.PI * 2, d = rnd() * h.data.radius;
            const nx = h.data.home[0] + Math.cos(a) * d, nz = h.data.home[1] + Math.sin(a) * d;
            if (freeSpot(nx, nz) && Math.hypot(nx - car.x, nz - car.z) > 5) { h.x = nx; h.z = nz; break; }
          }
          h.mesh.position.set(h.x, heightAt(h.x, h.z), h.z);
        }
        if (h.cast <= 0) {
          h.cast = 3;
          const dx = car.x - h.x, dz = car.z - h.z, d = Math.hypot(dx, dz);
          if (d < 16 && d > 1) shoot('sparkle', h.x, h.z, dx / d, dz / d, 6 * speed, 20);
        }
      }
    });
    world.shots = world.shots.filter(s => {
      s.x += s.vx * dt; s.z += s.vz * dt; s.left -= dt;
      s.mesh.position.set(s.x, heightAt(s.x, s.z) + 1, s.z);
      s.mesh.rotation.y += dt * 5;
      if (s.left <= 0 || s.hit) { scene.remove(s.mesh); return false; }
      return true;
    });
    if (portal.visible) { swirl.rotation.z += dt * 2; ring.rotation.z -= dt; }
  };

  // After the house is beaten, its guard villains go home.
  world.removeGuards = () => {
    world.hazards = world.hazards.filter(h => { if (h.guard) scene.remove(h.mesh); return !h.guard; });
  };
  return world;
}

// The house number on the sign. Set by main.js before building.
let worldNumber = 1;
export function setWorldNumber(n) { worldNumber = n; }
function WORLD_NUMBER() { return worldNumber; }

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
    const out = [[pos.x - b.x1, -1, 0], [b.x2 - pos.x, 1, 0], [pos.z - b.z1, 0, -1], [b.z2 - pos.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
    pos.x += out[1] * (out[0] + r); pos.z += out[2] * (out[0] + r);
  }
  for (const c of world.circles) {
    const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), min = r + c.r;
    if (d < min && d > 1e-4) { pos.x = c.x + dx / d * min; pos.z = c.z + dz / d * min; hit = true; }
  }
  return hit;
}
