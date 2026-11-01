// models.js
// Loads the 3D models (assets/models/, see docs/MODEL_SPEC.md) and makes
// copies of them for the game.
//
//   await loadModels(['characters/tyler', 'vehicles/kart'])   load files once
//   makeModel('characters/tyler')         a copy, ready to add to a scene
//   model.userData.animate(t, mood)       call every frame: plays the right
//                                         animation clip and face for the mood
//   makeVehicle('kart', character)        a vehicle with spinning wheels etc.
//   makeScatter(...)                      many copies of scenery, drawn cheaply
//
// Short names: 'tyler', 'dragon', 'robot', 'ghost' and so on work too (see ALIASES).
// If a file is missing, a simple stand-in made of spheres is used instead.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const ALIASES = {
  tyler: 'characters/tyler', skyler: 'characters/skyler', nick: 'characters/nick',
  pip: 'characters/pip', mo: 'characters/mo', zazz: 'characters/zazz',
  dragon: 'villains/dragon', snowgun: 'villains/snowgun', yoyo: 'villains/yoyo', wizard: 'villains/wizard',
  ghost: 'villains/ghost', robot: 'villains/tall-robot',
};
export const CORE_MODELS = Object.values(ALIASES);
const fileOf = (name) => ALIASES[name] || name;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const loaded = {};    // file -> { scene, animations } or null if missing
const pending = {};

export function loadModels(names) {
  return Promise.all(names.map(n => {
    const f = fileOf(n);
    if (f in loaded) return null;
    if (!pending[f]) {
      pending[f] = loader.loadAsync('assets/models/' + f + '.glb')
        .then(g => {
          // Marked shared, so leaving a world does not throw away parts other worlds reuse.
          g.scene.traverse(o => {
            if (o.geometry) o.geometry.userData.shared = true;
            if (o.material) { o.material.userData.shared = true; for (const k of ['map', 'emissiveMap', 'normalMap', 'metalnessMap', 'roughnessMap']) if (o.material[k]) o.material[k].userData.shared = true; }
          });
          loaded[f] = { scene: g.scene, animations: g.animations };
        })
        .catch(() => { loaded[f] = null; console.warn('missing model', f); });
    }
    return pending[f];
  }));
}
export function hasModel(name) { return !!loaded[fileOf(name)]; }

// ---------- Small helpers ----------

const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.65 }, extra));
function ball(r, color, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat(color));
  m.position.set(x, y, z); m.scale.set(sx || 1, sy || 1, sz || 1);
  return m;
}
function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  return m;
}
function shadows(obj) { obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }

// Materials that the game changes on one copy only get their own copy.
const OWN_MATERIAL = new Set(['eyes', 'mouth', 'paint', 'skin_tint', 'robot_glow', 'lever_lamp', 'hex_top', 'crystal_glow', 'pad_glow']);

// A fresh copy of a loaded file: animated models need their skeleton copied too.
function copyOf(file) {
  const src = loaded[file];
  const skinned = src.animations.length > 0 || (() => { let s = false; src.scene.traverse(o => { if (o.isSkinnedMesh) s = true; }); return s; })();
  const root = skinned ? cloneSkinned(src.scene) : src.scene.clone(true);
  root.traverse(o => {
    if (o.name === 'col') o.visible = false;
    if (o.name === 'lod1') o.visible = false;
    if (o.isMesh && OWN_MATERIAL.has(o.material.name)) {
      o.material = o.material.clone();
      if (o.material.map && (o.material.name === 'eyes' || o.material.name === 'mouth')) {
        o.material.map = o.material.map.clone();
        o.material.map.wrapS = o.material.map.wrapT = THREE.RepeatWrapping;
        o.material.map.needsUpdate = true;
      }
    }
  });
  return { root, animations: src.animations };
}

// ---------- Animation and faces ----------

// What clip to play for a mood. The first clip the model has wins.
const MOOD_CLIPS = {
  idle: ['idle', 'float'], walk: ['walk', 'fly', 'roll', 'float', 'idle'], happy: ['cheer', 'taunt', 'float', 'idle'],
  drive: ['drive'], drive_left: ['drive_left', 'drive'], drive_right: ['drive_right', 'drive'],
  hop: ['hop', 'walk'], oops: ['oops', 'hurt', 'idle'], dizzy: ['dizzy', 'hurt', 'idle'], hurt: ['hurt', 'oops', 'idle'],
  wave: ['wave', 'idle'], victory: ['victory', 'cheer', 'idle'], talk: ['talk', 'idle'], fire: ['fire', 'idle'],
  cast: ['cast', 'idle'], teleport: ['teleport', 'idle'], defeat: ['spin_out', 'melt', 'unwind', 'poof', 'hurt'],
  taunt: ['taunt', 'idle'], fly: ['fly', 'idle'], roll: ['roll', 'idle'], ripple: ['ripple'],
};
const ONE_SHOT = new Set(['hop', 'oops', 'victory', 'fire', 'cast', 'teleport', 'defeat', 'puff']);
// Face sheets: each texture holds 4 pictures in a 2 by 2 grid.
const EYES = { open: [0, 0], blink: [0.5, 0], happy: [0, 0.5], sad: [0.5, 0.5] };
const MOUTH = { smile: [0, 0], grin: [0.5, 0], o: [0, 0.5], frown: [0.5, 0.5] };
const MOOD_FACE = { happy: ['happy', 'grin'], victory: ['happy', 'grin'], oops: ['sad', 'o'], dizzy: ['sad', 'frown'], hurt: ['sad', 'frown'], defeat: ['sad', 'o'], talk: ['open', 'grin'], taunt: ['happy', 'grin'] };

function animator(root, animations) {
  const mixer = animations.length ? new THREE.AnimationMixer(root) : null;
  const actions = {};
  animations.forEach(c => { actions[c.name] = mixer.clipAction(c); });
  const faces = { eyes: [], mouth: [], tint: [] };
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.name === 'eyes') faces.eyes.push(o.material.map);
    if (o.material.name === 'mouth') faces.mouth.push(o.material.map);
    if (o.material.name === 'skin_tint') faces.tint.push(o.material);
  });
  let current = null, lastT = null, blinkAt = 2 + Math.random() * 3;
  const setFace = (e, m) => {
    faces.eyes.forEach(t => t && t.offset.set(...EYES[e]));
    faces.mouth.forEach(t => t && t.offset.set(...MOUTH[m]));
  };
  // Play a clip by name (or mood). Smoothly blends from the last one.
  const play = (mood) => {
    const want = (MOOD_CLIPS[mood] || [mood]).find(n => actions[n]) || Object.keys(actions)[0];
    if (!want || want === current) return;
    const next = actions[want];
    next.reset();
    if (ONE_SHOT.has(mood) || ONE_SHOT.has(want)) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
    else next.setLoop(THREE.LoopRepeat, Infinity);
    next.play();
    if (current && actions[current]) actions[current].crossFadeTo(next, 0.2, false);
    current = want;
  };
  return {
    hasClips: !!mixer, play, setFace,
    animate(t, mood) {
      const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      if (mixer) { play(mood || 'idle'); mixer.update(dt); }
      const face = MOOD_FACE[mood];
      if (face) setFace(face[0], face[1]);
      else {
        blinkAt -= dt;
        setFace(blinkAt < 0 ? 'blink' : 'open', mood === 'walk' ? 'grin' : 'smile');
        if (blinkAt < -0.14) blinkAt = 2.5 + Math.random() * 3;
      }
      faces.tint.forEach((m, i) => m.color.setHSL((t * (mood === 'happy' ? 0.5 : 0.1) + i * 0.3) % 1, 0.75, 0.62));
    },
  };
}

// ---------- Making a model ----------

// height: scale the model to this height. Leave it out to keep the real size
// from the file (the spec's sizes are in meters, matching the game).
export function makeModel(name, height) {
  const file = fileOf(name);
  const outer = new THREE.Group();
  let inner, anim;
  if (loaded[file]) {
    const c = copyOf(file);
    inner = c.root;
    anim = animator(inner, c.animations);
  } else {
    inner = standIn(name);
    anim = null;
  }
  if (height) {
    const bb = new THREE.Box3().setFromObject(inner);
    const s = height / Math.max(0.01, bb.max.y - bb.min.y);
    inner.scale.multiplyScalar(s);
    inner.position.y = -bb.min.y * s;
  }
  outer.add(inner);
  shadows(outer);
  outer.traverse(o => { if (o.name === 'col' || o.name === 'lod1') o.visible = false; });
  outer.userData.inner = inner;
  outer.userData.part = (n) => inner.getObjectByName(n);
  if (anim) {
    const base = inner.position.y;
    outer.userData.play = anim.play;
    outer.userData.setFace = anim.setFace;
    outer.userData.animate = (t, mood) => {
      anim.animate(t, mood);
      if (!anim.hasClips) inner.position.y = base + Math.abs(Math.sin(t * (mood ? 10 : 3))) * (mood ? 0.1 : 0.02);
    };
  } else {
    const base = inner.position.y;
    outer.userData.animate = (t, mood) => {
      const fast = mood === 'walk' ? 14 : mood ? 10 : 3;
      inner.position.y = base + Math.abs(Math.sin(t * fast)) * (mood ? 0.12 : 0.02);
    };
  }
  // Show the detailed copy up close and the simple one far away.
  const lod0 = inner.getObjectByName('lod0'), lod1 = inner.getObjectByName('lod1');
  outer.userData.lod = (dist) => { if (lod0 && lod1) { const near = dist < 38; lod0.visible = near; lod1.visible = !near; } };
  return outer;
}

// ---------- Stand-ins for models that did not load ----------

function standIn(name) {
  const id = fileOf(name).split('/').pop();
  const ch = (typeof CHARACTERS !== 'undefined') && CHARACTERS.find(c => c.id === id);
  const g = new THREE.Group();
  const color = ch ? ch.color : { dragon: '#e03c31', snowgun: '#ffffff', yoyo: '#ff5fa2', wizard: '#7b3fc4', ghost: '#ffffff', 'tall-robot': '#8b96a8' }[id] || '#cccccc';
  g.add(ball(0.35, color, 0, 0.4, 0, 1, 1.1, 0.9), ball(0.3, color, 0, 0.95, 0.05));
  for (const s of [-1, 1]) { g.add(ball(0.09, '#ffffff', s * 0.13, 1.02, 0.27)); g.add(ball(0.05, '#222222', s * 0.13, 1.02, 0.34)); }
  return g;
}

// ---------- Vehicles ----------
// One vehicle per world. Each handles a little differently:
//   speed: top speed compared to normal   grip: how fast it turns and stops
//   iceGrip: grip on ice (lower slides more)   hover: floats this high
export const VEHICLES = {
  kart:       { name: 'Robo-Kart',     speed: 1,    grip: 3.2, iceGrip: 0.3, hover: 0 },
  snowmobile: { name: 'Snow Zoomer',   speed: 1.05, grip: 3.0, iceGrip: 0.55, hover: 0 },
  buggy:      { name: 'Boing Buggy',   speed: 1.1,  grip: 2.7, iceGrip: 0.3, hover: 0, bouncy: true },
  glider:     { name: 'Moth Glider',   speed: 0.95, grip: 2.8, iceGrip: 0.3, hover: 0.7, light: true },
  tractor:    { name: 'Lava Tractor',  speed: 0.95, grip: 4,   iceGrip: 0.3, hover: 0 },
  carpet:     { name: 'Magic Carpet',  speed: 1.05, grip: 2.5, iceGrip: 0.3, hover: 0.9 },
};

// kind: one of the VEHICLES names. ch: the driver (for the paint color).
// userData.seat is where the driver goes. userData.animate(t, speed, steer)
// spins wheels, turns the front wheels, flaps wings and bounces the body.
export function makeVehicle(kind, ch) {
  const file = 'vehicles/' + kind, info = VEHICLES[kind] || VEHICLES.kart;
  const g = new THREE.Group();
  let inner, parts = {}, anim = null, seat;
  if (loaded[file]) {
    const c = copyOf(file);
    inner = c.root;
    anim = c.animations.length ? animator(inner, c.animations) : null;
    for (const n of ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'steer_FL', 'steer_FR', 'steer', 'body', 'wing_L', 'wing_R',
      'spring_FL', 'spring_FR', 'spring_RL', 'spring_RR', 'ski_L', 'ski_R', 'antenna']) {
      const o = inner.getObjectByName(n); if (o) parts[n] = { obj: o, rot: o.rotation.clone(), pos: o.position.clone(), scale: o.scale.clone() };
    }
    seat = inner.getObjectByName('seat');
  } else {
    inner = new THREE.Group();
    inner.add(box(1.6, 0.55, 2.6, ch.color, 0, 0.55, 0));
    seat = new THREE.Group(); seat.position.set(0, 0.7, -0.1); inner.add(seat);
  }
  g.add(inner);
  shadows(g);
  // Paint takes the driver's color; Zazz's shifts through the rainbow.
  const paints = [];
  inner.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.name === 'paint') { o.material.color.set(ch.color); paints.push(o.material); }
  });
  const belt = beltMap(inner), belts = belt ? [belt] : [];
  if (ch.look === 'chameleon') g.userData.rainbow = paints;
  const driverSpot = new THREE.Group();
  seat.add(driverSpot);
  g.userData.seat = driverSpot;
  let roll = 0, steerNow = 0;
  g.userData.animate = (t, speed, steer) => {
    roll += speed * 0.05;
    steerNow += ((steer || 0) - steerNow) * 0.2;
    const P = parts;
    for (const w of ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR']) if (P[w]) P[w].obj.rotation.x = P[w].rot.x + roll;
    for (const s of ['steer_FL', 'steer_FR', 'steer']) if (P[s]) P[s].obj.rotation.y = P[s].rot.y + steerNow * 0.5;
    const flap = Math.sin(t * 10) * 0.35;
    if (P.wing_L) P.wing_L.obj.rotation.z = P.wing_L.rot.z + flap;
    if (P.wing_R) P.wing_R.obj.rotation.z = P.wing_R.rot.z - flap;
    const bounce = Math.abs(Math.sin(t * 9)) * Math.min(1, speed / 6);
    for (const s of ['spring_FL', 'spring_FR', 'spring_RL', 'spring_RR']) if (P[s]) P[s].obj.scale.y = P[s].scale.y * (1 - bounce * 0.25);
    for (const s of ['ski_L', 'ski_R']) if (P[s]) P[s].obj.rotation.x = P[s].rot.x + Math.sin(t * 7 + (s === 'ski_L' ? 0 : 1)) * 0.05 * Math.min(1, speed / 4);
    if (P.antenna) P.antenna.obj.rotation.z = P.antenna.rot.z + Math.sin(t * 6) * 0.15 * Math.min(1, speed / 4 + 0.2);
    if (P.body) P.body.obj.position.y = P.body.pos.y + bounce * (info.bouncy ? 0.12 : 0.03);
    belts.forEach(b => { b.offset.y -= speed * 0.004; });
    if (anim) anim.animate(t, 'ripple');
    const lift = info.hover ? info.hover + Math.sin(t * 3) * 0.12 : 0;
    inner.position.y = lift;
  };
  return g;
}

// The texture on a model's 'belt' material, but only when the belt has that
// image to itself. If the belt shares an atlas with the rest of the model
// (the loader then hands every material the same texture object), scrolling
// it would slide the colors across the whole body, so we leave it still.
export function beltMap(root) {
  let map = null;
  const others = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m.map) continue;
      if (m.name === 'belt') map = m.map;
      else { others.add(m.map); others.add(m.map.source); }
    }
  });
  if (!map || others.has(map) || others.has(map.source)) return null;
  return map;
}

// ---------- Prize items ----------

const ITEM_FILES = { key: 'item_key', boots: 'item_boots', string: 'item_string', hat: 'item_hat', scale: 'item_scale', map: 'item_map' };
export function makeItem(kind) {
  const m = makeModel('items/' + (ITEM_FILES[kind] || 'item_key'));
  m.userData.inner.scale.multiplyScalar(1.8);
  return m;
}

// ---------- Lots of scenery, drawn cheaply ----------
// Many copies of the same model become one "instanced" draw per material.
// Copies near the car use the detailed lod0; far ones use lod1.
// spots: [{ x, y, z, rot, scale }]. Returns { group, radius, update(carX, carZ, hideFn) }.

export function makeScatter(name, spots, opts) {
  opts = opts || {};
  const file = fileOf(name), group = new THREE.Group();
  if (!loaded[file] || !spots.length) return { group, radius: 1, update() {} };
  const src = loaded[file].scene;
  src.updateMatrixWorld(true);
  const lod0 = src.getObjectByName('lod0'), lod1 = src.getObjectByName('lod1'), col = src.getObjectByName('col');
  const inside = (o, parent) => { for (let p = o; p; p = p.parent) if (p === parent) return true; return false; };
  const meshesUnder = (root, skip) => { const out = []; root.traverse(o => { if (o.isMesh && !skip.some(s => inside(o, s))) out.push(o); }); return out; };
  // Collision size from the col box (or the whole model).
  const cb = new THREE.Box3().setFromObject(col || lod0 || src);
  const radius = Math.max(cb.max.x - cb.min.x, cb.max.z - cb.min.z) / 2;
  const levels = [lod0 ? meshesUnder(lod0, []) : meshesUnder(src, [col, lod1].filter(Boolean)), lod1 ? meshesUnder(lod1, []) : null];
  const n = spots.length;
  const mats = spots.map(s => new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot || 0), s.scale instanceof THREE.Vector3 ? s.scale : new THREE.Vector3(s.scale || 1, s.scale || 1, s.scale || 1)));
  const make = (meshes, ghost) => meshes ? meshes.map(m => {
    let material = m.material;
    if (ghost) { material = material.clone(); material.transparent = true; material.opacity = 0.28; material.depthWrite = false; }
    const im = new THREE.InstancedMesh(m.geometry, material, n);
    im.userData.local = m.matrixWorld.clone();
    im.castShadow = !ghost && opts.shadows !== false; im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = 0;
    group.add(im);
    return im;
  }) : null;
  const sets = [make(levels[0]), make(levels[1]), opts.seeThrough ? make(levels[0], true) : null];
  const tmp = new THREE.Matrix4();
  const fill = (ims, list) => { if (!ims) return; ims.forEach(im => { list.forEach((k, i) => im.setMatrixAt(i, tmp.multiplyMatrices(mats[k], im.userData.local))); im.count = list.length; im.instanceMatrix.needsUpdate = true; }); };
  let lastKey = '';
  return {
    group, radius,
    // Sort copies into near, far and see-through. Cheap enough to run a few times a second.
    update(cx, cz, hide) {
      const near = [], far = [], ghost = [];
      spots.forEach((s, k) => {
        if (hide && hide(s)) { ghost.push(k); return; }
        (Math.hypot(s.x - cx, s.z - cz) < (opts.lodDistance || 38) || !sets[1] ? near : far).push(k);
      });
      const key = near.length + '/' + far.length + '/' + ghost.join(',') + '/' + near[0] + '/' + far[0];
      if (key === lastKey) return;
      lastKey = key;
      fill(sets[0], near); fill(sets[1], far); fill(sets[2], ghost);
    },
  };
}
