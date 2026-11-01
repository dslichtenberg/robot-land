// models.js
// Every 3D thing that moves: the friends, the car, robots, villains, the ghost
// and the prize items.
//
// If a .glb file exists in assets/models/ (see MODEL_FILES below), it is used.
// If not, a simple stand-in is built from spheres and boxes, so the game works
// before all the models are ready. Drop a new .glb in and it replaces its stand-in.
//
// makeModel(name, height) gives back a THREE.Group standing on y = 0, facing +Z,
// with group.userData.animate(t, mood) to wiggle its parts every frame.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const MODEL_FILES = {
  tyler: 'tyler.glb', skyler: 'skyler.glb', nick: 'nick.glb',
  pip: 'pip.glb', mo: 'mo.glb', zazz: 'zazz.glb',
  dragon: 'dragon.glb', snowgun: 'snowgun.glb', yoyo: 'yoyo.glb', wizard: 'wizard.glb',
  ghost: 'ghost.glb', robot: 'tall-robot.glb',
};

const loaded = {};   // name -> the loaded scene, or null when there is no file

// Load every model file we know about. Missing files are fine.
export function preloadModels() {
  const loader = new GLTFLoader();
  return Promise.all(Object.entries(MODEL_FILES).map(([name, file]) =>
    loader.loadAsync('assets/models/' + file)
      .then(g => { loaded[name] = g.scene; })
      .catch(() => { loaded[name] = null; })));
}
export function hasModelFile(name) { return !!loaded[name]; }

// ---------- Small helpers ----------

const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.65 }, extra));
function ball(r, color, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat(color));
  m.position.set(x, y, z);
  m.scale.set(sx || 1, sy || 1, sz || 1);
  return m;
}
function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}
function shadows(obj) { obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }
function eyes(g, y, z, spread, r) {
  for (const s of [-1, 1]) {
    g.add(ball(r, '#ffffff', s * spread, y, z));
    g.add(ball(r * 0.55, '#222222', s * spread, y, z + r * 0.6));
  }
}

// Move a mesh so it turns around a joint instead of the model's middle.
// Our GLB parts have their points baked in model space, so we shift them.
function pivotPart(mesh, pickPoint) {
  mesh.geometry.computeBoundingBox();
  const b = mesh.geometry.boundingBox, p = pickPoint(b);
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.translate(-p.x, -p.y, -p.z);
  const pivot = new THREE.Group();
  pivot.position.copy(p);
  mesh.parent.add(pivot);
  pivot.add(mesh);
  return pivot;
}
function partsNamed(root, name) {
  const out = [];
  root.traverse(o => { if (o.isMesh && o.name === name) out.push(o); });
  return out;
}

// ---------- Making a model ----------

export function makeModel(name, height) {
  const outer = new THREE.Group();
  let inner;
  if (loaded[name]) {
    inner = loaded[name].clone(true);
    inner.traverse(o => { if (o.isMesh) o.material = o.material.clone(); });
  } else {
    inner = standIn(name);
  }
  // Scale it to the height we want, standing on the ground.
  const bb = new THREE.Box3().setFromObject(inner);
  const s = height / Math.max(0.01, bb.max.y - bb.min.y);
  inner.scale.setScalar(s);
  inner.position.y = -bb.min.y * s;
  outer.add(inner);
  shadows(outer);
  outer.userData.animate = rigParts(name, inner, !!loaded[name]);
  outer.userData.inner = inner;
  return outer;
}

// Returns a function that wiggles the model each frame.
// mood: 'walk', 'happy', 'hurt' or nothing.
function rigParts(name, inner, fromFile) {
  const baseY = inner.position.y;
  const bob = (t, mood, amount) => {
    const fast = mood === 'walk' ? 14 : mood === 'happy' ? 10 : 3;
    inner.position.y = baseY + Math.abs(Math.sin(t * fast)) * (mood ? 0.12 : amount || 0.02);
    inner.rotation.z = mood === 'walk' ? Math.sin(t * 14) * 0.08 : 0;
  };
  if (name === 'dragon' && fromFile) {
    const wings = partsNamed(inner, 'stubby-wing').map(m =>
      ({ side: 0, pivot: pivotPart(m, b => { const c = b.getCenter(new THREE.Vector3()); return new THREE.Vector3(c.x > 0.1 ? b.min.x : b.max.x, c.y, c.z); }) }));
    wings.forEach(w => { w.side = w.pivot.position.x > 0.1 ? 1 : -1; });
    return (t, mood) => {
      wings.forEach(w => { w.pivot.rotation.z = w.side * Math.sin(t * 9) * 0.5; });
      bob(t, mood === 'walk' ? null : mood, 0.08);
    };
  }
  if (name === 'ghost' && fromFile) {
    const arm = partsNamed(inner, 'waving-arm').map(m => pivotPart(m, b => { const c = b.getCenter(new THREE.Vector3()); return new THREE.Vector3(c.x > 0 ? b.min.x : b.max.x, b.min.y, c.z); }))[0];
    return (t) => {
      inner.position.y = baseY + 0.15 + Math.sin(t * 2) * 0.15;
      if (arm) arm.rotation.z = Math.sin(t * 5) * 0.5;
    };
  }
  if (name === 'robot' && fromFile) {
    const bulbs = partsNamed(inner, 'red-bulb');
    return (t, mood) => {
      const on = Math.floor(t * 2) % 2 === 0;
      bulbs.forEach(b => { b.material.emissive = new THREE.Color(on ? '#ff2020' : '#000000'); });
      bob(t, mood, 0.03);
    };
  }
  if (inner.userData.rainbow) {
    return (t, mood) => {
      inner.userData.rainbow.forEach((m, i) => m.color.setHSL(((t * (mood ? 0.5 : 0.12)) + i * 0.33) % 1, 0.8, 0.6));
      bob(t, mood);
    };
  }
  return (t, mood) => bob(t, mood);
}

// ---------- Stand-ins for models that are not ready yet ----------

function standIn(name) {
  const ch = (typeof CHARACTERS !== 'undefined') && CHARACTERS.find(c => c.id === name);
  if (ch) return friendStandIn(ch);
  const g = new THREE.Group();
  if (name === 'robot') {
    g.add(box(0.8, 0.9, 0.5, '#8b96a8', 0, 0.9, 0), box(0.7, 0.5, 0.5, '#aab4c3', 0, 1.6, 0));
    g.add(ball(0.08, '#2a7bff', -0.15, 1.65, 0.26), ball(0.08, '#2a7bff', 0.15, 1.65, 0.26));
    const bulb = ball(0.08, '#ff4d4d', 0, 2.05, 0); bulb.name = 'red-bulb'; g.add(bulb);
    g.add(box(0.2, 0.5, 0.2, '#6c7380', -0.2, 0.25, 0), box(0.2, 0.5, 0.2, '#6c7380', 0.2, 0.25, 0));
  } else if (name === 'dragon') {
    g.add(ball(0.5, '#e03c31', 0, 0.6, 0), ball(0.35, '#e03c31', 0, 1.3, 0.1), ball(0.3, '#ffc93c', 0, 0.55, 0.3));
    eyes(g, 1.4, 0.38, 0.14, 0.09);
  } else if (name === 'yoyo') {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 28), mat('#ff5fa2'));
    disc.rotation.x = Math.PI / 2; disc.position.y = 0.7; g.add(disc);
    eyes(g, 0.85, 0.2, 0.2, 0.1);
  } else if (name === 'wizard') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 20), mat('#7b3fc4')); robe.position.y = 0.55; g.add(robe);
    g.add(ball(0.28, '#ffd7b0', 0, 1.25, 0), ball(0.22, '#ffffff', 0, 1.08, 0.15));
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 20), mat('#5a2a9a')); hat.position.y = 1.75; g.add(hat);
  } else if (name === 'ghost') {
    g.add(ball(0.5, '#ffffff', 0, 0.8, 0, 1, 1.3, 1)); eyes(g, 1.0, 0.42, 0.15, 0.08);
  } else if (name === 'snowgun') {
    g.add(ball(0.5, '#ffffff', 0, 0.5, 0), ball(0.35, '#ffffff', 0, 1.2, 0));
  } else {
    g.add(box(0.6, 0.6, 0.6, '#cccccc', 0, 0.3, 0));
  }
  return g;
}

function friendStandIn(ch) {
  const g = new THREE.Group(), c = ch.color, a = ch.accent;
  if (ch.look === 'gecko' || ch.look === 'chameleon') {
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 20, Math.PI * 1.3), mat(c));
    tail.position.set(0, 0.25, -0.3); tail.rotation.y = Math.PI / 2; g.add(tail);
    g.add(ball(0.3, c, 0, 0.42, 0, 1, 1.2, 0.95));
    g.add(ball(0.1, c, -0.22, 0.08, 0.08), ball(0.1, c, 0.22, 0.08, 0.08));
    g.add(ball(0.08, c, -0.3, 0.5, 0.1), ball(0.08, c, 0.3, 0.5, 0.1));
    if (ch.pattern === 'belly') g.add(ball(0.2, a, 0, 0.42, 0.16, 1, 1.3, 0.6));
    if (ch.pattern === 'spots') [[-0.12, 0.5], [0.14, 0.36], [0.02, 0.25]].forEach(([x, y]) => g.add(ball(0.06, a, x, y, 0.27)));
    if (ch.pattern === 'stripes') [0.3, 0.45, 0.6].forEach(y => g.add(ball(0.29, a, 0, y, 0.02, 1.02, 0.12, 0.98)));
    g.add(ball(0.3, c, 0, 0.92, 0.05, 1.1, 0.9, 1));
    eyes(g, 1.0, 0.27, 0.14, 0.09);
    if (ch.look === 'chameleon') {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), mat(a)); crest.position.set(0, 1.25, 0); g.add(crest);
      g.userData.rainbow = [];
      g.traverse(o => { if (o.isMesh && o.material.color.getHexString() === c.slice(1)) g.userData.rainbow.push(o.material); });
    }
  } else if (ch.look === 'frog') {
    g.add(ball(0.36, c, 0, 0.38, 0, 1.2, 0.9, 1), ball(0.24, '#e8ffc2', 0, 0.35, 0.18, 1, 1, 0.6));
    g.add(ball(0.32, c, 0, 0.72, 0.05, 1.25, 0.8, 1));
    g.add(ball(0.14, c, -0.2, 0.95, 0.1), ball(0.14, c, 0.2, 0.95, 0.1));
    eyes(g, 0.98, 0.2, 0.2, 0.09);
    g.add(ball(0.13, c, -0.32, 0.1, 0.1, 1.4, 0.6, 1), ball(0.13, c, 0.32, 0.1, 0.1, 1.4, 0.6, 1));
  } else if (ch.look === 'turtle') {
    g.add(ball(0.42, a, 0, 0.35, -0.05, 1.1, 0.75, 1.1), ball(0.4, '#c49a5c', 0, 0.2, 0, 1.05, 0.25, 1.05));
    [[-0.3, 0.25], [0.3, 0.25], [-0.3, -0.3], [0.3, -0.3]].forEach(([x, z]) => g.add(ball(0.11, c, x, 0.1, z)));
    g.add(ball(0.22, c, 0, 0.62, 0.38));
    eyes(g, 0.7, 0.55, 0.1, 0.07);
  }
  return g;
}

// ---------- The car ----------

export function makeCar(ch) {
  const g = new THREE.Group();
  const body = box(1.7, 0.55, 2.7, ch.color, 0, 0.55, 0);
  const bonnet = box(1.5, 0.3, 0.9, ch.color, 0, 0.95, 0.75);
  const seatBack = box(1.3, 0.6, 0.2, '#2b2b38', 0, 1.1, -0.55);
  const trim = box(1.76, 0.12, 2.76, '#2b2b38', 0, 0.3, 0);
  g.add(body, bonnet, seatBack, trim);
  for (const [x, z] of [[-0.85, 0.85], [0.85, 0.85], [-0.85, -0.85], [0.85, -0.85]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 18), mat('#222222'));
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.35, z); g.add(w);
  }
  g.add(ball(0.13, '#fff7b0', -0.5, 0.65, 1.36, 1, 1, 0.5), ball(0.13, '#fff7b0', 0.5, 0.65, 1.36, 1, 1, 0.5));
  if (ch.look === 'chameleon') g.userData.rainbow = [body.material, bonnet.material];
  shadows(g);
  const seat = new THREE.Group();
  seat.position.set(0, 0.7, -0.1);
  g.add(seat);
  g.userData.seat = seat;
  return g;
}

// ---------- Prize items ----------

export function makeItem(kind) {
  const g = new THREE.Group();
  if (kind === 'key') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.1, 12, 24), mat('#ffc93c', { metalness: 0.6, roughness: 0.3 }));
    ring.position.y = 0.4; g.add(ring);
    g.add(box(0.12, 0.7, 0.12, '#ffc93c', 0, -0.15, 0), box(0.25, 0.1, 0.12, '#ffc93c', 0.12, -0.4, 0), box(0.2, 0.1, 0.12, '#ffc93c', 0.1, -0.2, 0));
    g.traverse(o => { if (o.isMesh) o.material.emissive = new THREE.Color('#664400'); });
  } else {
    g.add(ball(0.4, '#ffd23f', 0, 0, 0));
  }
  shadows(g);
  return g;
}
