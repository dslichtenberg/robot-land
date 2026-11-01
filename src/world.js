// world.js
// Builds a world from its layout in worlds.js, using the 3D models in
// assets/models/, and runs everything that moves.
//
// The ground has real hills and mountains: heightAt(x, z) says how high it is.
// Collisions are flat (seen from above): the car is a circle, and solid things
// are boxes or circles. resolve(world, pos, r) pushes the car out of them.
//
// Each world has a "kit" (KITS below): which scenery models to use, the ground
// texture, and what the walls and yard fences are made of.

import * as THREE from 'three';
import { makeModel, makeScatter, CORE_MODELS } from './models.js';

const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85 }, extra));
export const inBox = (x, z, [x1, z1, x2, z2]) => x > x1 && x < x2 && z > z1 && z < z2;
function seeded(text) {
  let s = 7;
  for (const ch of text) s = (s * 31 + ch.charCodeAt(0)) % 2147483647;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const texLoader = new THREE.TextureLoader();
function texture(file, repeatX, repeatY) {
  const t = texLoader.load('assets/textures/' + file + '.webp');
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(repeatX || 1, repeatY || 1);
  return t;
}

// ---------- What each world is made of ----------
// styles: the scatter styles in worlds.js -> scenery models.
// decor: extra scenery sprinkled around (collide: the car bumps into it).
// walls: wall styles in worlds.js -> a model tiled along the wall.

const S = (key, ...names) => names.map(n => 'scenery/' + key + '/' + n);
export const KITS = {
  'gear-city': {
    key: 'gear', ground: 'plates', road: 'road_gear', buildings: S('gear', 'building_a', 'building_b', 'building_c', 'building_d'),
    styles: {}, walls: { crate: S('gear', 'crate_a', 'crate_b') }, yard: S('gear', 'fence_metal')[0],
    decor: [
      { models: S('gear', 'street_lamp'), count: 26, collide: true, nearStreets: true },
      { models: S('gear', 'robot_tree'), count: 12, collide: true },
      { models: S('gear', 'crate_a', 'crate_b', 'barrel'), count: 22, collide: true },
      { models: S('gear', 'gear_small', 'pipe_bend'), count: 18 },
      { models: S('gear', 'grass_tuft_a', 'grass_tuft_b'), count: 180, small: true },
    ],
  },
  frosty: {
    key: 'frosty', ground: 'snow', road: 'road_frosty',
    styles: { pine: S('frosty', 'tree_pine_a', 'tree_pine_b', 'tree_pine_c'), icerock: S('frosty', 'ice_rock_a', 'ice_rock_b') },
    walls: {}, yard: null,
    decor: [
      { models: S('frosty', 'rock_snow_a', 'rock_snow_b', 'rock_snow_c'), count: 18, collide: true },
      { models: S('frosty', 'igloo'), count: 3, collide: true },
      { models: S('frosty', 'snowdrift'), count: 30 },
      { models: S('frosty', 'grass_tuft_a', 'grass_tuft_b'), count: 120, small: true },
    ],
  },
  bouncy: {
    key: 'bouncy', ground: 'grass', road: 'road_bouncy',
    styles: { tree: S('bouncy', 'tree_round_a', 'tree_round_b', 'tree_round_c') },
    walls: { hedge: S('bouncy', 'hedge') }, yard: S('bouncy', 'fence_wood')[0],
    decor: [
      { models: S('bouncy', 'bush_a', 'bush_b'), count: 26, collide: true },
      { models: S('bouncy', 'mushroom_bouncy'), count: 12, collide: true },
      { models: S('bouncy', 'windmill_small'), count: 4, collide: true },
      { models: S('bouncy', 'flower_patch'), count: 90 },
      { models: S('bouncy', 'grass_tuft_a', 'grass_tuft_b'), count: 220, small: true },
    ],
  },
  starry: {
    key: 'starry', ground: 'night', road: 'road_starry',
    styles: { mushroom: S('starry', 'mushroom_glow_a', 'mushroom_glow_b', 'mushroom_glow_c') },
    walls: { hedge: S('starry', 'hedge_dark') }, yard: S('starry', 'hedge_dark')[0],
    decor: [
      { models: S('starry', 'tree_crooked_a', 'tree_crooked_b', 'tree_crooked_c'), count: 26, collide: true },
      { models: S('starry', 'log'), count: 10, collide: true },
      { models: S('starry', 'firefly_jar'), count: 10, collide: true },
      { models: S('starry', 'fern'), count: 70 },
      { models: S('starry', 'grass_tuft_a', 'grass_tuft_b'), count: 140, small: true },
    ],
  },
  lava: {
    key: 'lava', ground: 'ash', road: 'road_lava',
    styles: { lavarock: S('lava', 'rock_volcanic_a', 'rock_volcanic_b', 'rock_volcanic_c') },
    walls: {}, yard: null,
    decor: [
      { models: S('lava', 'tree_dead_a', 'tree_dead_b'), count: 16, collide: true },
      { models: S('lava', 'bones_silly'), count: 14 },
      { models: S('lava', 'lava_crack'), count: 34 },
      { models: S('lava', 'steam_vent'), count: 8 },
      { models: S('lava', 'grass_tuft_a', 'grass_tuft_b'), count: 80, small: true },
    ],
  },
  tower: {
    key: 'tower', ground: 'stone', road: 'road_tower',
    styles: { crystal: S('tower', 'crystal_a', 'crystal_b', 'crystal_c') },
    walls: { stone: S('tower', 'wall_stone') }, yard: S('tower', 'wall_stone')[0],
    decor: [
      { models: S('tower', 'torch_stand'), count: 16, collide: true },
      { models: S('tower', 'book_pile'), count: 10, collide: true },
      { models: S('tower', 'banner'), count: 8, collide: true },
      { models: S('tower', 'grass_tuft_a', 'grass_tuft_b'), count: 100, small: true },
    ],
  },
};
// The pieces each haunted house room is built from.
const R = (...names) => names.map(n => 'rooms/' + n);
const ROOM_MODELS = {
  lava1: R('hex_stone', 'room_wall_lava', 'room_floor_stone', 'room_torch', 'cobweb_corner'),
  lava2: R('hex_stone', 'room_wall_lava', 'room_floor_stone', 'room_torch', 'cobweb_corner'),
  ice: R('ice_rock', 'snowflake_pickup', 'room_wall_ice', 'room_floor_ice', 'room_torch', 'cobweb_corner'),
  levers: R('lever', 'room_wall_lever', 'room_floor_wood', 'room_torch', 'cobweb_corner'),
  mirrors1: R('mirror_stand', 'crystal_target', 'beam_emitter', 'candle_big', 'room_wall_mirror', 'room_floor_magic', 'room_torch', 'cobweb_corner'),
  mirrors2: R('mirror_stand', 'crystal_target', 'beam_emitter', 'candle_big', 'room_wall_mirror', 'room_floor_magic', 'room_torch', 'cobweb_corner'),
};
const LANDMARKS = { gear: 'landmarks/landmark_gear', crystal: 'landmarks/landmark_crystal', yoyoTower: 'landmarks/landmark_yoyo', volcano: 'landmarks/landmark_volcano' };

// Every model file a world needs, so main.js can load them before building it.
export function worldModels(w) {
  const kit = KITS[w.id];
  const list = new Set([...CORE_MODELS, 'vehicles/' + w.vehicle, 'houses/house_' + kit.key, 'pieces/portal', 'items/item_' + w.item.kind, ...(ROOM_MODELS[w.room] || [])]);
  Object.values(kit.styles).flat().forEach(n => list.add(n));
  Object.values(kit.walls).flat().forEach(n => list.add(n));
  kit.decor.forEach(d => d.models.forEach(n => list.add(n)));
  (kit.buildings || []).forEach(n => list.add(n));
  if (kit.yard) list.add(kit.yard);
  if (w.landmark && LANDMARKS[w.landmark.kind]) list.add(LANDMARKS[w.landmark.kind]);
  if ((w.switches || []).some(s => s.kind === 'button')) list.add('pieces/button');
  if ((w.switches || []).some(s => s.kind === 'star')) list.add('pieces/star_pickup');
  if ((w.gates || []).length) list.add('pieces/gate');
  if ((w.bridges || []).some(b => b.kind === 'draw' || b.kind === 'broken')) list.add('pieces/drawbridge_leaf');
  if ((w.bridges || []).some(b => b.kind === 'stones')) list.add('pieces/stepping_stone');
  if ((w.jumpPads || []).length) list.add('pieces/spring_pad');
  if ((w.teleports || []).length) list.add('pieces/teleport_pad');
  if ((w.conveyors || []).length) list.add('pieces/conveyor');
  (w.rollers || []).forEach(r => { if (r.kind === 'gear') list.add('pieces/gear_roller'); if (r.kind === 'boulder') list.add('pieces/boulder'); });
  return [...list];
}

// ---------- Building the world ----------

export function buildWorld(scene, w, flags) {
  const theme = w.theme, kit = KITS[w.id], rnd = seeded(w.id);
  const doneSwitches = new Set(flags.switches || []);
  const world = {
    data: w, kit, boxes: [], circles: [], robots: [], hazards: [], shots: [], belts: [], pads: [],
    teleports: [], switches: [], gates: [], bridges: [], scatters: [], lods: [], spinners: [],
    houseDone: !!flags.houseDone, scene,
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
  const peak = new THREE.Color(theme.ground === 'ash' ? '#5a3a30' : theme.ground === 'night' || theme.ground === 'stone' ? '#9a96b8' : '#ffffff');
  for (let i = 0; i < pos.count; i++) {
    const h = heightAt(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    const c = new THREE.Color('#ffffff').lerp(peak, Math.min(1, Math.max(0, (h - 5) / 8)));
    const shade = 1 - Math.min(0.25, Math.max(0, h - 1) * 0.02);
    colors.push(c.r * shade, c.g * shade, c.b * shade);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, mat('#ffffff', { map: texture('ground_' + kit.ground, size / 8, size / 8), vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // A flat strip that hugs the ground (roads, ice, water).
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
  const keep = (m) => { world.lods.push(m); return m; };

  (w.streets || []).forEach(b => {
    const len = Math.max(b[2] - b[0], b[3] - b[1]), across = b[2] - b[0] >= b[3] - b[1];
    const t = texture(kit.road, across ? len / 6 : 1, across ? 1 : len / 6);
    groundStrip(b, mat('#ffffff', { map: t }));
  });

  // The edge of the world (hidden behind the mountains)
  for (const [x1, z1, x2, z2] of [[-H - 2, -H - 2, H + 2, -H], [-H - 2, H, H + 2, H + 2], [-H - 2, -H, -H, H], [H, -H, H + 2, H]]) solid(x1, z1, x2, z2);

  // ----- Placing scenery models (many copies drawn as one) -----
  // spots grouped by model; each model becomes one instanced scatter.
  const spotsByModel = {};
  const addSpot = (name, spot) => { (spotsByModel[name] = spotsByModel[name] || []).push(spot); };
  // A spot for a model whose box should land centered on (cx, cz), scaled to fit sx, sy, sz meters.
  const boxes = {};
  function modelBox(name) {
    if (!boxes[name]) {
      const m = makeModel(name);
      const lod0 = m.getObjectByName('lod0');
      boxes[name] = new THREE.Box3().setFromObject(lod0 || m);
    }
    return boxes[name];
  }
  function fitSpot(name, cx, cz, rot, sx, sy, sz, y) {
    const b = modelBox(name), size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const scale = new THREE.Vector3(sx ? sx / size.x : 1, sy ? sy / size.y : 1, sz ? sz / size.z : 1);
    const off = new THREE.Vector3(c.x * scale.x, 0, c.z * scale.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    return { x: cx - off.x, y: (y === undefined ? heightAt(cx, cz) : y) - b.min.y * scale.y, z: cz - off.z, rot, scale, cx, cz };
  }

  // ----- Walls: a model tiled along each wall box -----
  function tileWall([x1, z1, x2, z2], h, names, fill) {
    const along = x2 - x1 >= z2 - z1, len = along ? x2 - x1 : z2 - z1, thick = along ? z2 - z1 : x2 - x1;
    const rot = along ? 0 : Math.PI / 2, base = Math.min(heightAt(x1, z1), heightAt(x2, z2), heightAt((x1 + x2) / 2, (z1 + z2) / 2));
    if (fill) {   // crates: fill the whole area with big crates
      const n = Math.max(1, Math.round(len / 2)), m = Math.max(1, Math.round(thick / 2));
      for (let i = 0; i < n; i++) for (let k = 0; k < m; k++) {
        const u = (i + 0.5) / n, v = (k + 0.5) / m;
        const cx = along ? x1 + u * len : x1 + v * thick, cz = along ? z1 + v * thick : z1 + u * len;
        addSpot(names[(i + k) % names.length], fitSpot(names[(i + k) % names.length], cx, cz, Math.floor(rnd() * 4) * Math.PI / 2, len / n * 0.98, h * (0.8 + rnd() * 0.4), thick / m * 0.98, base));
      }
      return;
    }
    const n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, cx = along ? x1 + u * len : (x1 + x2) / 2, cz = along ? (z1 + z2) / 2 : z1 + u * len;
      const name = names[i % names.length];
      addSpot(name, fitSpot(name, cx, cz, rot, len / n * 1.02, h, Math.max(0.3, thick), base));
    }
  }
  const boxWall = ([x1, z1, x2, z2], h, look) => {
    const base = Math.min(heightAt(x1, z1), heightAt(x2, z2), heightAt((x1 + x2) / 2, (z1 + z2) / 2));
    const m = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, h + 2, z2 - z1), look);
    m.position.set((x1 + x2) / 2, base - 2 + (h + 2) / 2, (z1 + z2) / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  (w.walls || []).forEach(wl => {
    solid(...wl.box);
    if (wl.style === 'hidden') return;
    const names = kit.walls[wl.style];
    if (names) tileWall(wl.box, wl.h || 3, names, wl.style === 'crate');
    else boxWall(wl.box, wl.h || 3, mat(wl.style === 'ice' ? '#9fd6ff' : '#5a4f78'));
  });
  (w.yardWalls || []).forEach(b => {
    solid(...b);
    if (kit.yard) tileWall(b, 2.6, [kit.yard]);
    else boxWall(b, 3, mat(theme.edge));
  });

  // ----- Gear City's buildings: rows of building models in each block -----
  const buildingSpots = [];
  if (w.cityBlocks) {
    w.cityBlocks.xs.forEach(([bx1, bx2]) => w.cityBlocks.zs.forEach(([bz1, bz2]) => {
      const x1 = bx1 + 1.5, x2 = bx2 - 1.5, z1 = bz1 + 1.5, z2 = bz2 - 1.5;
      solid(x1, z1, x2, z2);
      const nx = Math.max(1, Math.floor((x2 - x1) / 4.4)), nz = Math.max(1, Math.floor((z2 - z1) / 4.4));
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const name = kit.buildings[Math.floor(rnd() * kit.buildings.length)];
        const cx = x1 + (x2 - x1) * (i + 0.5) / nx, cz = z1 + (z2 - z1) * (k + 0.5) / nz;
        const sp = fitSpot(name, cx, cz, 0, (x2 - x1) / nx * 0.96, null, (z2 - z1) / nz * 0.96);
        sp.scale.y = (sp.scale.x + sp.scale.z) / 2;
        sp.building = true;
        addSpot(name, sp);
      }
    }));
  }

  // ----- Trees, rocks, mushrooms, crystals and other scenery -----
  const keepAway = [w.start, w.portal, ...(w.switches || []).map(s => s.at), ...(w.robots || []).map(r => r.at),
    ...(w.jumpPads || []).flatMap(p => [p.at, p.to]), ...(w.teleports || []).flatMap(t => [t.a, t.b]),
    w.house ? [w.house.x, w.house.z] : null].filter(Boolean);
  const onStreet = (x, z, pad) => (w.streets || []).some(b => inBox(x, z, [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]));
  const blocked = (x, z, r) => world.boxes.some(b => x > b.x1 - r && x < b.x2 + r && z > b.z1 - r && z < b.z2 + r) ||
    world.circles.some(c => Math.hypot(c.x - x, c.z - z) < c.r + r);
  function sprinkle(names, count, box, opts) {
    for (let i = 0, tries = 0; i < count && tries < count * 25; tries++) {
      let x, z;
      if (opts.nearStreets && w.streets) {
        const st = w.streets[Math.floor(rnd() * w.streets.length)], side = rnd() < 0.5;
        const across = st[2] - st[0] >= st[3] - st[1];
        x = across ? st[0] + rnd() * (st[2] - st[0]) : (side ? st[0] - 1.2 : st[2] + 1.2);
        z = across ? (side ? st[1] - 1.2 : st[3] + 1.2) : st[1] + rnd() * (st[3] - st[1]);
      } else {
        x = box[0] + rnd() * (box[2] - box[0]); z = box[1] + rnd() * (box[3] - box[1]);
      }
      const r = opts.small ? 0.4 : 1.6;
      if (Math.abs(x) > 58 || Math.abs(z) > 58) continue;
      if (keepAway.some(p => Math.hypot(p[0] - x, p[1] - z) < (opts.small ? 3 : 5))) continue;
      if (!opts.nearStreets && onStreet(x, z, opts.small ? 0.3 : 1.5)) continue;
      // Not on belts, ice, rivers or canyons.
      if ((w.conveyors || []).some(c => inBox(x, z, [c.box[0] - 1, c.box[1] - 1, c.box[2] + 1, c.box[3] + 1]))) continue;
      if ((w.ice || []).some(b => inBox(x, z, b)) && !opts.allowIce) continue;
      if ((w.water || []).some(wt => inBox(x, z, [wt.box[0] - 1, wt.box[1] - 1, wt.box[2] + 1, wt.box[3] + 1]))) continue;
      if ((w.bridges || []).some(br => inBox(x, z, [br.box[0] - 3, br.box[1] - 4, br.box[2] + 3, br.box[3] + 4]))) continue;
      if (blocked(x, z, r)) continue;
      if (!opts.small && heightAt(x, z) > 5) continue;
      const name = names[Math.floor(rnd() * names.length)], scale = opts.small ? 0.8 + rnd() * 0.6 : 0.85 + rnd() * 0.35;
      const sp = { x, y: heightAt(x, z), z, rot: rnd() * Math.PI * 2, scale };
      addSpot(name, sp);
      if (opts.collide) world.circles.push(sp.circle = { x, z, r: 1, name, scale });
      i++;
    }
  }
  const STYLE_COLLIDE = { pine: 1, icerock: 1, tree: 1, lavarock: 1, mushroom: 1, crystal: 1 };
  (w.scatter || []).forEach(sc => { const names = kit.styles[sc.style]; if (names) sprinkle(names, sc.count, sc.box, { collide: STYLE_COLLIDE[sc.style], allowIce: true }); });
  kit.decor.forEach(d => sprinkle(d.models, d.count, [-58, -58, 58, 58], d));

  // Turn all the spots into instanced scenery, and give bumpable things their real size.
  for (const [name, spots] of Object.entries(spotsByModel)) {
    const isBuilding = spots.some(s => s.building);
    const sc = makeScatter(name, spots, { seeThrough: isBuilding, shadows: !name.includes('grass_tuft') && !name.includes('flower') && !name.includes('fern') });
    scene.add(sc.group);
    world.scatters.push({ sc, spots, building: isBuilding });
    spots.forEach(s => { if (s.circle) s.circle.r = Math.max(0.5, sc.radius * s.scale * 0.85); });
  }

  // ----- Rivers, lava and canyons -----
  world.flowing = [];
  // The water (or lava) surface for a box. Textures line up across boxes, so
  // the strips beside and under a bridge look like one river.
  function liquid(box, style) {
    const [x1, z1, x2, z2] = box;
    let m;
    if (style === 'chasm') m = mat('#1a1530');
    else {
      const t = texture(style === 'lava' ? 'lava' : 'water', (x2 - x1) / 8, (z2 - z1) / 8);
      t.offset.set(x1 / 8, -z1 / 8);
      m = style === 'lava' ? mat('#ffffff', { map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.9 }) : mat('#ffffff', { map: t, roughness: 0.15, metalness: 0.1 });
      world.flowing.push({ t, lava: style === 'lava', m });
    }
    groundStrip(box, m, style === 'chasm' ? 0.02 : 0.05);
  }
  (w.water || []).forEach(wt => {
    const [x1, z1, x2, z2] = wt.box, style = wt.style || 'water';
    liquid(wt.box, style);
    if (style === 'chasm') for (const z of [z1, z2]) { const lip = new THREE.Mesh(new THREE.BoxGeometry(x2 - x1, 0.3, 0.4), mat('#5a4a3a')); at(lip, (x1 + x2) / 2, z, 0.1); scene.add(lip); }
    solid(x1, z1, x2, z2);
  });
  // Under each bridge: the same river as the strips beside it (seen when the bridge lifts or the stones sink).
  (w.bridges || []).forEach(br => {
    if (br.kind === 'broken') return;
    const beside = (w.water || []).find(wt => wt.box[1] === br.box[1] && wt.box[3] === br.box[3]);
    liquid(br.box, (beside && beside.style) || 'water');
  });

  // ----- Bridges: drawbridges lift, stepping stones sink, broken ones are decoys -----
  const ownMaterials = (m) => { m.traverse(o => { if (o.isMesh) o.material = o.material.clone(); }); return m; };
  (w.bridges || []).forEach(br => {
    const [x1, z1, x2, z2] = br.box, cx = (x1 + x2) / 2, width = x2 - x1, len = z2 - z1;
    const leaf = (hingeZ, south, lift) => {
      const pivot = new THREE.Group(); pivot.position.set(cx, 0.2, hingeZ);
      const m = makeModel('pieces/drawbridge_leaf');
      m.scale.set(width / 6, 1, (len / 2) / 3.5);
      if (south) m.rotation.y = Math.PI;
      pivot.add(m); scene.add(pivot);
      if (lift) pivot.rotation.x = lift;
      return pivot;
    };
    if (br.kind === 'broken') { leaf(z2, true, -0.2).scale.z = 0.45; leaf(z1, false, 0.2).scale.z = 0.45; return; }
    const bridge = { box: br.box, cycle: br.cycle || 8, offset: br.offset || 0, kind: br.kind, gap: solid(x1, z1, x2, z2), parts: [], lamps: [] };
    bridge.gap.kind = 'bridge';
    if (br.kind === 'draw') {
      // Positive turns lift the south half (it reaches north); the north half turns the other way.
      bridge.parts.push({ pivot: leaf(z2, true), dir: 1 }, { pivot: leaf(z1, false), dir: -1 });
    } else {
      for (let k = 0; k < 3; k++) {
        const stone = ownMaterials(makeModel('pieces/stepping_stone'));
        stone.scale.set(width * 0.42, 1.6, len / 3 * 0.42);
        stone.position.set(cx, 0.15, z1 + len * (k + 0.5) / 3);
        scene.add(stone);
        const mats = []; stone.traverse(o => { if (o.isMesh) mats.push(o.material); });
        bridge.parts.push({ stone, mats });
      }
    }
    for (const z of [z2 + 1, z1 - 1]) for (const x of [x1 - 0.6, x2 + 0.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.6, 10), mat('#4b5263', { metalness: 0.5, roughness: 0.4 }));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), mat('#550000'));
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
  (w.conveyors || []).forEach(c => {
    const [x1, z1, x2, z2] = c.box, rot = Math.atan2(c.push[0], c.push[1]), spots = [];
    for (let x = x1 + 2; x < x2; x += 4) for (let z = z1 + 2; z < z2; z += 4) spots.push({ x, y: heightAt(x, z) + 0.02, z, rot, scale: 1 });
    const sc = makeScatter('pieces/conveyor', spots, { shadows: false });
    scene.add(sc.group); sc.update(0, 0);
    let beltTex = null; sc.group.traverse(o => { if (o.isMesh && o.material.name === 'belt') beltTex = o.material.map; });
    world.belts.push({ box: c.box, push: c.push, tex: beltTex });
  });
  (w.ice || []).forEach(b => groundStrip(b, mat('#cfefff', { roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8 }), 0.04));
  world.pushAt = (x, z) => { const b = world.belts.find(b => inBox(x, z, b.box)); return b ? b.push : null; };
  world.iceAt = (x, z) => (w.ice || []).some(b => inBox(x, z, b));

  // ----- Spring pads and magic teleport pads -----
  (w.jumpPads || []).forEach(p => {
    const m = makeModel('pieces/spring_pad');
    m.rotation.y = Math.atan2(p.to[0] - p.at[0], p.to[1] - p.at[1]);
    scene.add(at(m, p.at[0], p.at[1]));
    const spring = m.userData.part('spring');
    world.pads.push({ at: p.at, to: p.to, spring, base: spring ? spring.scale.y : 1 });
  });
  (w.teleports || []).forEach(tp => {
    const ends = [tp.a, tp.b].map(p => {
      const m = makeModel('pieces/teleport_pad');
      m.traverse(o => { if (o.isMesh && o.material.name === 'pad_glow') { o.material.color.set(tp.color); o.material.emissive = new THREE.Color(tp.color); } });
      scene.add(at(m, p[0], p[1]));
      return m;
    });
    world.teleports.push({ a: tp.a, b: tp.b, meshes: ends });
  });
  // Textures the game spins (portal and teleport swirls).
  world.swirls = new Set();
  const findSwirls = (m) => m.traverse(o => { if (o.isMesh && o.material.name === 'swirl' && o.material.map) { o.material.map.center.set(0.5, 0.5); world.swirls.add(o.material.map); } });
  world.teleports.forEach(t => t.meshes.forEach(findSwirls));

  // ----- Landmark you can see from far away -----
  const lm = w.landmark;
  if (lm) {
    const [lx, lz] = lm.at;
    if (lm.kind === 'moon') {
      const moon = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff3c4', fog: false }));
      moon.position.set(lx, 45, lz); scene.add(moon);
    } else {
      const m = keep(makeModel(LANDMARKS[lm.kind]));
      scene.add(at(m, lx, lz));
      const gear = m.userData.part('gear'), yo = m.userData.part('yoyo');
      if (gear) world.spinners.push({ obj: gear, axis: 'z', speed: 0.6 });
      if (yo) world.spinners.push({ obj: yo, axis: 'bob', speed: 1.2, base: yo.position.y });
      m.traverse(o => { if (o.isMesh && o.material.name === 'lava') world.flowing.push({ m: o.material, lava: true, pulseOnly: true }); });
      if (lm.kind === 'gear') solid(lx - 1.6, lz - 1.3, lx + 1.6, lz + 1.3);
      if (lm.kind === 'volcano') {
        world.circles.push({ x: lx, z: lz, r: 10 });
        const smoke = m.userData.part('smoke');
        m.updateMatrixWorld(true);
        const sp = smoke ? smoke.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(lx, 18, lz);
        world.smoke = { x: sp.x, y: sp.y, z: sp.z, puffs: [] };
      }
    }
  }

  // ----- Buttons and stars, and the gates they open -----
  (w.switches || []).forEach((sw, i) => {
    const done = doneSwitches.has(i);
    let g, top;
    if (sw.kind === 'star') {
      g = new THREE.Group();
      top = makeModel('pieces/star_pickup');
      top.scale.setScalar(1.8); top.position.y = 1.2;
      g.add(top);
      const glow = new THREE.PointLight('#ffe14d', 10, 10); glow.position.y = 2; g.add(glow);
    } else {
      g = makeModel('pieces/button');
      top = g.userData.part('cap') || g;
      if (done && top !== g) top.position.y -= 0.35;
    }
    scene.add(at(g, sw.at[0], sw.at[1]));
    if (done && sw.kind === 'star') g.visible = false;
    world.switches.push({ at: sw.at, kind: sw.kind, done, group: g, top, topY: top.position.y });
  });
  (w.gates || []).forEach(gt => {
    const needs = gt.needs || world.switches.map((s, k) => k);
    const [x1, z1, x2, z2] = gt.box, along = x2 - x1 >= z2 - z1;
    const m = makeModel('pieces/gate');
    m.rotation.y = along ? 0 : Math.PI / 2;
    m.scale.set((along ? x2 - x1 : z2 - z1) / 6, 1.1, Math.max(0.5, along ? z2 - z1 : x2 - x1));
    scene.add(at(m, (x1 + x2) / 2, (z1 + z2) / 2));
    const gate = { box: gt.box, needs, mesh: m, solid: solid(...gt.box), open: false, sink: 0 };
    gate.solid.kind = 'gate';
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
  const hs = w.house.size, hx = w.house.x, hz = w.house.z;
  const doorDir = { west: [-1, 0], east: [1, 0], south: [0, 1], north: [0, -1] }[w.house.door];
  const house = keep(makeModel('houses/house_' + kit.key));
  house.scale.setScalar(hs / 7.3);
  house.rotation.y = Math.atan2(doorDir[0], doorDir[1]);
  scene.add(at(house, hx, hz));
  house.updateMatrixWorld(true);
  solid(hx - hs / 2, hz - hs / 2, hx + hs / 2, hz + hs / 2);
  world.doorSpot = new THREE.Vector3(hx + doorDir[0] * (hs / 2 + 1.6), 0, hz + doorDir[1] * (hs / 2 + 1.6));
  const markerAt = (name, fallback) => { const o = house.userData.part(name); return o ? o.getWorldPosition(new THREE.Vector3()) : fallback; };
  const signCanvas = document.createElement('canvas'); signCanvas.width = signCanvas.height = 128;
  const sg = signCanvas.getContext('2d');
  sg.fillStyle = '#ffe066'; sg.beginPath(); sg.arc(64, 64, 60, 0, Math.PI * 2); sg.fill();
  sg.fillStyle = '#3f3168'; sg.font = 'bold 84px sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
  sg.fillText(String(worldNumber), 64, 70);
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace;
  const num = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex })); num.scale.set(1.8, 1.8, 1.8);
  num.position.copy(markerAt('sign', new THREE.Vector3(hx + doorDir[0] * (hs / 2 + 0.5), house.position.y + 6, hz + doorDir[1] * (hs / 2 + 0.5))));
  num.position.addScaledVector(new THREE.Vector3(doorDir[0], 0, doorDir[1]), 0.3);
  scene.add(num);
  const roofGhost = makeModel('ghost', 1.4);
  roofGhost.position.copy(markerAt('roof_peek', new THREE.Vector3(hx + 1.5, house.position.y + 7, hz + 1.5)));
  roofGhost.rotation.y = house.rotation.y;
  scene.add(roofGhost);
  world.roofGhost = roofGhost;
  world.houseDoor = house.userData.part('door');

  // ----- Portal (appears after you beat the house) -----
  const portal = makeModel('pieces/portal');
  at(portal, w.portal[0], w.portal[1]);
  portal.visible = world.houseDone;
  scene.add(portal);
  findSwirls(portal);
  world.portal = portal;
  world.portalSpot = new THREE.Vector3(w.portal[0], 0, w.portal[1]);

  // ----- Robots -----
  (w.robots || []).forEach(r => {
    const m = makeModel('robot', 2.6);
    scene.add(at(m, r.at[0], r.at[1]));
    world.robots.push({ mesh: m, data: r, x: r.at[0], z: r.at[1] });
    world.circles.push({ x: r.at[0], z: r.at[1], r: 0.9 });
  });

  // ----- Things that bump you -----
  // A model wrapped so it spins around its middle (its file origin is at the bottom).
  const centered = (name, height) => {
    const m = makeModel(name), g = new THREE.Group(); g.add(m);
    const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -c.y, -c.z);
    return { g, y: c.y, r: Math.max(b.max.x - b.min.x, b.max.y - b.min.y) / 2 };
  };
  const rollerLook = {
    gear: () => { const c = centered('pieces/gear_roller'); return { mesh: c.g, y: c.y, r: c.r, spin: true }; },
    boulder: () => { const c = centered('pieces/boulder'); return { mesh: c.g, y: c.y, r: c.r, spin: true }; },
    fireball: () => ({ mesh: new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 14), mat('#ffb000', { emissive: '#ff4000', emissiveIntensity: 1.2 })), y: 1.4, r: 1.5, spin: true }),
    yoyo: () => ({ mesh: makeModel('yoyo', 2.2), y: 0.2, r: 1.5, string: true }),
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
    const m = makeModel('snowgun', 2.2);
    m.rotation.y = Math.atan2(cn.dir[0], cn.dir[1]);
    scene.add(at(m, cn.at[0], cn.at[1]));
    world.circles.push({ x: cn.at[0], z: cn.at[1], r: 1 });
    world.hazards.push({ kind: 'cannon', data: cn, mesh: m, timer: cn.offset || 0, fired: 0, x: cn.at[0], z: cn.at[1], r: 0, guard: cn.guard });
  });
  (w.wizards || []).forEach(wz => {
    const m = makeModel('wizard', 2.2);
    scene.add(at(m, wz.home[0], wz.home[1]));
    world.hazards.push({ kind: 'wizard', data: wz, mesh: m, timer: 0, cast: 1.5, mood: 0, x: wz.home[0], z: wz.home[1], r: 1.2, guard: wz.guard });
  });

  const shotGeo = { snow: new THREE.SphereGeometry(0.6, 14, 10), sparkle: new THREE.OctahedronGeometry(0.6) };
  const shotMat = { snow: mat('#ffffff', { roughness: 0.5 }), sparkle: mat('#ffe14d', { emissive: '#ffb300' }) };
  function shoot(kind, x, z, dx, dz, speed, range) {
    const m = new THREE.Mesh(shotGeo[kind], shotMat[kind]);
    scene.add(m);
    world.shots.push({ kind, mesh: m, x, z, vx: dx * speed, vz: dz * speed, left: range / speed, r: 0.7 });
  }
  const freeSpot = (x, z) => !world.boxes.some(b => b.on && x > b.x1 - 1.3 && x < b.x2 + 1.3 && z > b.z1 - 1.3 && z < b.z2 + 1.3) &&
    !world.circles.some(c => Math.hypot(c.x - x, c.z - z) < c.r + 1.3) && heightAt(x, z) < 4;
  world.freeSpot = freeSpot;

  // ----- Moving everything, every frame -----
  let sortTimer = 0;
  world.update = (dt, t, car, speed) => {
    world.bridges.forEach(b => {
      const s = bridgeState(b, t), warn = ((t + b.offset) % b.cycle) > b.cycle * 0.56 - 1;
      b.gap.on = s > 0.05;
      if (b.kind === 'draw') b.parts.forEach(p => { p.pivot.rotation.x = p.dir * s * 1.1; });
      else b.parts.forEach((p, k) => { p.stone.position.y = 0.15 - s * 1.4 + Math.sin(t * 3 + k) * 0.05; p.mats.forEach(m => m.emissive.set(warn && s < 0.05 && Math.floor(t * 4) % 2 ? '#801000' : '#000000')); });
      const blink = warn && Math.floor(t * 4) % 2 === 0;
      b.lamps.forEach(l => l.material.emissive.set(blink ? '#ff2020' : s > 0 ? '#aa0000' : '#00aa33'));
      const [, z1, , z2] = b.box;
      if (b.gap.on && inBox(car.x, car.z, b.box)) { car.z = car.z > (z1 + z2) / 2 ? z2 + 1.4 : z1 - 1.4; world.slid = b.kind; }
    });
    // Scenery: near copies detailed, far ones simple; buildings in front of the car see-through.
    sortTimer -= dt;
    if (sortTimer <= 0) {
      sortTimer = 0.25;
      const hideBuilding = (s) => s.cz > car.z + 1 && s.cz < car.z + 16 && Math.abs(s.cx - car.x) < 6;
      world.scatters.forEach(o => o.sc.update(car.x, car.z, o.building ? hideBuilding : null));
      world.lods.forEach(m => m.userData.lod(Math.hypot(m.position.x - car.x, m.position.z - car.z)));
    }
    world.belts.forEach(b => { if (b.tex) b.tex.offset.y -= dt * Math.hypot(...b.push) / 4; });
    world.flowing.forEach(f => {
      if (f.t) { f.t.offset.x += dt * (f.lava ? 0.02 : 0.03); f.t.offset.y += dt * 0.01; }
      if (f.lava && f.m.emissiveIntensity !== undefined) f.m.emissiveIntensity = 0.8 + Math.sin(t * 2) * 0.15;
    });
    world.swirls.forEach(s => { s.rotation += dt * 1.5; });
    world.spinners.forEach(s => { if (s.axis === 'bob') s.obj.position.y = s.base + Math.sin(t * s.speed) * 2; else s.obj.rotation[s.axis] += dt * s.speed; });
    world.pads.forEach(p => { if (p.spring) p.spring.scale.y = p.base * (0.85 + Math.abs(Math.sin(t * 4)) * 0.3); });
    world.switches.forEach(sw => {
      if (sw.kind === 'star') { sw.top.rotation.y += dt * 2; sw.top.position.y = 1.2 + Math.sin(t * 2) * 0.3; }
      else if (sw.done && sw.top !== sw.group) sw.top.position.y = Math.max(sw.topY - 0.35, sw.top.position.y - dt);
    });
    world.gates.forEach(g => { if (g.open && g.mesh.visible) { g.sink += dt * 2; g.mesh.position.y -= dt * 2; if (g.sink > 6) g.mesh.visible = false; } });
    roofGhost.userData.animate(t, 'idle');
    world.robots.forEach(r => {
      const near = Math.hypot(car.x - r.x, car.z - r.z) < 9;
      r.mesh.userData.animate(t, near ? 'wave' : 'idle');
      r.mesh.rotation.y = Math.atan2(car.x - r.x, car.z - r.z);
    });
    if (world.smoke && Math.random() < dt * 3) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), mat('#777777', { transparent: true, opacity: 0.6 }));
      puff.position.set(world.smoke.x, world.smoke.y, world.smoke.z);
      scene.add(puff); world.smoke.puffs.push({ mesh: puff, life: 4 });
    }
    if (world.smoke) world.smoke.puffs = world.smoke.puffs.filter(p => {
      p.life -= dt; p.mesh.position.y += dt * 2; p.mesh.scale.multiplyScalar(1 + dt * 0.3); p.mesh.material.opacity = p.life / 6;
      if (p.life <= 0) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
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
        else { h.mesh.userData.animate(t, 'roll'); h.mesh.rotation.y = Math.atan2(car.x - h.x, car.z - h.z); }
        if (h.string) {
          const p = h.string.geometry.attributes.position;
          p.setXYZ(0, h.anchor.x, h.anchor.y, h.anchor.z); p.setXYZ(1, h.x, h.mesh.position.y + 2, h.z); p.needsUpdate = true;
        }
      } else if (h.kind === 'patrol') {
        const L = h.data;
        h.angle += dt * L.speed * speed / L.r;
        h.x = L.x + Math.cos(h.angle) * L.r; h.z = L.z + Math.sin(h.angle) * L.r;
        h.mesh.position.set(h.x, heightAt(h.x, h.z) + 0.6 + Math.sin(t * 3) * 0.3, h.z);
        h.mesh.rotation.y = Math.atan2(-Math.sin(h.angle), Math.cos(h.angle));
        h.mesh.userData.animate(t, 'fly');
      } else if (h.kind === 'cannon') {
        h.timer += dt * speed; h.fired -= dt;
        h.mesh.userData.animate(t, h.fired > 0 ? 'fire' : 'idle');
        if (h.timer >= h.data.every) {
          h.timer = 0; h.fired = 0.6;
          const [dx, dz] = h.data.dir;
          shoot('snow', h.x + dx * 1.5, h.z + dz * 1.5, dx, dz, h.data.speed * speed, h.data.range);
        }
      } else if (h.kind === 'wizard') {
        h.timer += dt; h.cast -= dt; h.mood -= dt;
        h.mesh.userData.animate(t, h.mood > 0 ? h.moodName : 'idle');
        h.mesh.rotation.y = Math.atan2(car.x - h.x, car.z - h.z);
        if (h.timer > 3) {
          h.timer = 0;
          for (let k = 0; k < 20; k++) {
            const a = rnd() * Math.PI * 2, d = rnd() * h.data.radius;
            const nx = h.data.home[0] + Math.cos(a) * d, nz = h.data.home[1] + Math.sin(a) * d;
            if (freeSpot(nx, nz) && Math.hypot(nx - car.x, nz - car.z) > 5) { h.x = nx; h.z = nz; break; }
          }
          h.mesh.position.set(h.x, heightAt(h.x, h.z), h.z);
          h.mood = 0.6; h.moodName = 'teleport';
        }
        if (h.cast <= 0) {
          h.cast = 3;
          const dx = car.x - h.x, dz = car.z - h.z, d = Math.hypot(dx, dz);
          if (d < 16 && d > 1) { shoot('sparkle', h.x, h.z, dx / d, dz / d, 6 * speed, 20); h.mood = 0.8; h.moodName = 'cast'; }
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
  };

  // After the house is beaten, its guard villains go home.
  world.removeGuards = () => {
    world.hazards = world.hazards.filter(h => { if (h.guard) { scene.remove(h.mesh); if (h.string) scene.remove(h.string); } return !h.guard; });
  };
  return world;
}

// The house number on the sign. Set by main.js before building.
let worldNumber = 1;
export function setWorldNumber(n) { worldNumber = n; }

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
