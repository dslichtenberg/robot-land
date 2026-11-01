// tools/check-models.mjs
// Checks .glb files against docs/MODEL_SPEC.md and prints a report.
//
//   node tools/check-models.mjs assets/models          (a folder, searched inside)
//   node tools/check-models.mjs path/to/tyler.glb      (one or more files)
//
// It needs only Node (no npm installs). It reads the glTF JSON inside each
// .glb, and the image headers for texture sizes. The kind of model (friend,
// vehicle, scenery...) comes from the file name, as listed in the spec.
// FAIL means the spec is broken; WARN means please look at it.

import fs from 'node:fs';
import path from 'node:path';

// ---------- What the spec asks for ----------

const FRIENDS = ['tyler', 'skyler', 'nick', 'pip', 'mo', 'zazz'];
const VILLAINS = ['dragon', 'snowgun', 'yoyo', 'wizard'];
const VEHICLES = ['kart', 'snowmobile', 'buggy', 'glider', 'tractor', 'carpet'];
const PIECES = ['button', 'gate', 'drawbridge_leaf', 'stepping_stone', 'spring_pad', 'teleport_pad', 'portal', 'star_pickup', 'conveyor', 'gear_roller', 'boulder'];

const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head',
  ...['L', 'R'].flatMap(s => [`shoulder_${s}`, `upper_arm_${s}`, `forearm_${s}`, `hand_${s}`, `fingers_${s}`, `thigh_${s}`, `shin_${s}`, `foot_${s}`, `toes_${s}`])];
const FRIEND_CLIPS = { idle: 2.0, walk: 0.8, hop: 0.4, drive: 2.0, drive_left: 0, drive_right: 0, cheer: 1.5, wave: 1.5, oops: 0.8, dizzy: 1.0, victory: 2.0 };
const VILLAIN_CLIPS = {
  dragon: ['idle', 'fly', 'puff', 'taunt', 'hurt', 'spin_out'],
  snowgun: ['idle', 'aim', 'fire', 'taunt', 'hurt', 'melt'],
  yoyo: ['idle', 'roll', 'bounce', 'taunt', 'hurt', 'unwind'],
  wizard: ['idle', 'teleport', 'cast', 'taunt', 'hurt', 'poof'],
  ghost: ['float', 'wave', 'boo', 'cheer'],
  'tall-robot': ['idle', 'wave', 'talk', 'beep'],
};
const VILLAIN_PARTS = {
  dragon: ['wing_L', 'wing_R', 'nose'], snowgun: ['cannon', 'muzzle'], yoyo: ['spin', 'string_attach'],
  wizard: ['hat_tip', 'wand', 'wand_tip'], ghost: [], 'tall-robot': ['antenna', 'head'],
};
const VEHICLE_PARTS = {
  kart: ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'steer_FL', 'steer_FR', 'body', 'seat', 'antenna'],
  buggy: ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'steer_FL', 'steer_FR', 'body', 'seat', 'spring_FL', 'spring_FR', 'spring_RL', 'spring_RR'],
  tractor: ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR', 'steer_FL', 'steer_FR', 'body', 'seat', 'exhaust'],
  snowmobile: ['ski_L', 'ski_R', 'track', 'steer', 'body', 'seat'],
  glider: ['wing_L', 'wing_R', 'body', 'seat'],
  carpet: ['body', 'seat', 'carpet_1', 'carpet_5', 'tassel_FL', 'tassel_FR', 'tassel_RL', 'tassel_RR'],
};
// Section 12: exact materials. A list of alternatives means "one of these sets".
const MATERIALS = {
  friend: (id) => id === 'zazz' ? [['zazz_main', 'skin_tint', 'eyes', 'mouth']] : id === 'mo' ? [['mo_main', 'eyes', 'mouth'], ['mo_main', 'mo_alpha', 'eyes', 'mouth']] : [[`${id}_main`, 'eyes', 'mouth'], [`${id}_main`, `${id}_alpha`, 'eyes', 'mouth']],
  villain: (id) => [[`${id}_main`, 'eyes', 'mouth'], [`${id}_main`, `${id}_alpha`, 'eyes', 'mouth']],
  ghost: () => [['ghost_main', 'eyes', 'mouth']],
  'tall-robot': () => [['robot_main', 'robot_glow', 'eyes']],
  vehicle: (id) => id === 'snowmobile' ? [['snowmobile_main', 'paint', 'belt']] : id === 'carpet' ? [['carpet_main', 'carpet_alpha', 'paint']] : [[`${id}_main`, 'paint']],
};
// Budgets from section 3: [min triangles, max triangles, material cap, max MB]
const BUDGET = {
  friend: [8000, 12000, 4, 3], villain: [10000, 16000, 4, 4], ghost: [4000, 8000, 4, 2], 'tall-robot': [5000, 8000, 4, 2],
  vehicle: [5000, 9000, 3, 3], house: [6000, 10000, 2, 4], landmark: [4000, 8000, 2, 3], piece: [500, 2500, 2, 1],
  item: [1000, 2000, 1, 1], scenery: [10, 3000, 2, 1], room: [50, 1500, 2, 0.5],
};
const TEXTURE_MAX = { friend: 1024, villain: 1024, ghost: 512, 'tall-robot': 512, vehicle: 1024, house: 1024, landmark: 1024, piece: 512, item: 512, scenery: 1024, room: 512 };

function kindOf(id) {
  if (FRIENDS.includes(id)) return 'friend';
  if (VILLAINS.includes(id)) return 'villain';
  if (id === 'ghost' || id === 'tall-robot') return id;
  if (VEHICLES.includes(id)) return 'vehicle';
  if (id.startsWith('house_')) return 'house';
  if (id.startsWith('landmark_')) return 'landmark';
  if (PIECES.includes(id)) return 'piece';
  if (id.startsWith('item_')) return 'item';
  if (['room_', 'hex_stone', 'ice_rock', 'snowflake_pickup', 'lever', 'mirror_stand', 'crystal_target', 'beam_emitter', 'candle_big', 'cobweb_corner'].some(p => id.startsWith(p))) return 'room';
  return 'scenery';
}

// ---------- Reading a .glb ----------

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a .glb file');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen + 8;
  return { json, bin: buf.subarray(binStart), size: buf.length };
}
function imageSize(data) {
  if (data[0] === 0x89 && data[1] === 0x50) return [data.readUInt32BE(16), data.readUInt32BE(20)];
  if (data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i < data.length && data[i] === 0xff) {
      const m = data[i + 1], len = data.readUInt16BE(i + 2);
      if (m === 0xc0 || m === 0xc2) return [data.readUInt16BE(i + 7), data.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}

// ---------- Checking one file ----------

function check(file) {
  const id = path.basename(file, '.glb'), kind = kindOf(id), out = [];
  const fail = (m) => out.push('FAIL ' + m), warn = (m) => out.push('WARN ' + m), ok = (m) => out.push('ok   ' + m);
  let g;
  try { g = readGlb(file); } catch (e) { return { id, kind, out: ['FAIL cannot read: ' + e.message] }; }
  const { json: j, bin, size } = g;
  const nodes = j.nodes || [], names = nodes.map(n => n.name || '');
  const nameSet = new Set(names);

  // Format
  const exts = j.extensionsUsed || [];
  const badExt = exts.filter(e => !['KHR_materials_emissive_strength', 'KHR_texture_transform'].includes(e));
  badExt.length ? fail('extensions not allowed: ' + badExt.join(', ')) : ok('extensions');
  if (j.buffers && j.buffers.some(b => b.uri)) fail('uses an external .bin file; everything must be embedded');
  if ((j.images || []).some(im => im.uri)) fail('uses external image files; embed them');

  // Triangles and draw calls
  let tris = 0, prims = 0, noUV = [];
  for (const m of j.meshes || []) for (const p of m.primitives) {
    prims++;
    const count = p.indices !== undefined ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count;
    tris += Math.floor(count / 3);
    if (!p.attributes.TEXCOORD_0) noUV.push(m.name);
    if (!p.attributes.NORMAL) fail(`mesh ${m.name} has no normals`);
  }
  const [tmin, tmax, matCap, mb] = BUDGET[kind];
  if (tris > tmax) fail(`triangles ${tris} over budget (${tmin} to ${tmax})`);
  else if (tris < tmin) warn(`triangles ${tris} under the target (${tmin} to ${tmax}); round shapes may look faceted`);
  else ok(`triangles ${tris} (${tmin} to ${tmax})`);
  noUV.length ? fail('meshes without UVs: ' + [...new Set(noUV)].join(', ')) : ok('UVs on every mesh');
  const mbSize = size / 1048576;
  mbSize > mb ? fail(`file ${mbSize.toFixed(2)} MB over ${mb} MB`) : ok(`file ${mbSize.toFixed(2)} MB`);

  // Names
  const dups = [...new Set(names.filter((n, i) => n && names.indexOf(n) !== i))];
  dups.length ? fail('repeated node names: ' + dups.join(', ')) : ok('node names unique');
  const badNames = names.filter(n => n && !/^[a-z0-9]+(_([a-z0-9]+|L|R|FL|FR|RL|RR))*$/.test(n) && n !== 'tall-robot');
  if (badNames.length) warn('names not in the spec format (lowercase words, uppercase side suffix): ' + badNames.slice(0, 12).join(', '));

  // Materials (section 12)
  const mats = (j.materials || []).map(m => m.name);
  if (mats.length > matCap) fail(`${mats.length} materials, cap is ${matCap}: ${mats.join(', ')}`);
  const expectFn = MATERIALS[kind] || MATERIALS[id];
  if (expectFn) {
    const sets = expectFn(id), have = [...mats].sort().join(',');
    if (sets.some(s => [...s].sort().join(',') === have)) ok('materials ' + mats.join(', '));
    else fail(`materials are [${mats.join(', ')}], spec wants ${sets.map(s => '[' + s.join(', ') + ']').join(' or ')}`);
  } else ok('materials ' + mats.join(', '));
  for (const m of j.materials || []) {
    if (m.alphaMode === 'BLEND' && !['ghost_main', 'water'].includes(m.name)) warn(`material ${m.name} uses alpha BLEND; only the ghost and water should`);
    const pbr = m.pbrMetallicRoughness || {};
    if (!pbr.baseColorTexture && !['eyes', 'mouth'].includes(m.name)) warn(`material ${m.name} has no base color texture (flat color only)`);
  }

  // Textures
  const maxTex = TEXTURE_MAX[kind];
  (j.images || []).forEach((im, i) => {
    const bv = j.bufferViews[im.bufferView];
    const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const s = imageSize(data);
    if (!s) { warn(`image ${im.name || i}: unknown format`); return; }
    const pow2 = (n) => (n & (n - 1)) === 0;
    if (!pow2(s[0]) || !pow2(s[1])) fail(`image ${im.name || i} is ${s[0]}x${s[1]}, not a power of two`);
    else if (Math.max(...s) > maxTex && !/eyes|mouth/.test(im.name || '')) warn(`image ${im.name || i} is ${s[0]}x${s[1]}, spec size for ${kind} is ${maxTex}`);
  });

  // Rig and clips
  const skinBones = (j.skins || []).flatMap(s => s.joints.map(k => nodes[k].name));
  const clips = Object.fromEntries((j.animations || []).map(a => [a.name, Math.max(0, ...a.samplers.map(s => j.accessors[s.input].max[0]))]));
  if (kind === 'friend') {
    const missing = BONES.filter(b => !skinBones.includes(b));
    missing.length ? fail('missing bones: ' + missing.join(', ')) : ok(`${skinBones.length} bones`);
    if (skinBones.length > 45) fail(`${skinBones.length} bones, max 45`);
    if (!['pip'].includes(id) && !skinBones.includes('tail_1')) fail('missing tail bones');
    for (const [c, len] of Object.entries(FRIEND_CLIPS)) {
      if (!(c in clips)) fail('missing clip ' + c);
      else if (len && Math.abs(clips[c] - len) > 0.05) warn(`clip ${c} is ${clips[c].toFixed(2)} s, spec says ${len} s`);
    }
    for (const m of ['head_top', 'hand_R_grip']) nameSet.has(m) ? 0 : fail('missing marker ' + m);
  }
  if (VILLAIN_CLIPS[id]) {
    if (!skinBones.length) fail('no skeleton');
    VILLAIN_CLIPS[id].forEach(c => { if (!(c in clips)) fail('missing clip ' + c); });
    VILLAIN_PARTS[id].forEach(p => { if (!nameSet.has(p)) fail('missing part or marker ' + p); });
  }
  if ((j.meshes || []).some(m => m.primitives.some(p => p.attributes.JOINTS_1))) fail('more than 4 bone weights per vertex');
  if (kind === 'vehicle') {
    (VEHICLE_PARTS[id] || []).forEach(p => { if (!nameSet.has(p)) fail('missing part or marker ' + p); });
    if (!names.some(n => /^headlight_[LR]$/.test(n))) warn('no headlight_L / headlight_R markers');
  }

  // Root transform
  const roots = (j.scenes || [])[j.scene || 0]?.nodes || [];
  roots.forEach(k => { const n = nodes[k]; if (n.scale && n.scale.some(v => Math.abs(v - 1) > 1e-4)) fail(`root node ${n.name} has scale ${n.scale.join(',')}; freeze it`); });

  // Bounding box of the raw positions (rough size check)
  return { id, kind, out, tris, prims, mats: mats.length, clips: Object.keys(clips).length, bones: skinBones.length };
}

// ---------- Run ----------

const args = process.argv.slice(2);
if (!args.length) { console.log('usage: node tools/check-models.mjs <folder or .glb files>'); process.exit(1); }
const files = [];
const walk = (p) => { const st = fs.statSync(p); if (st.isDirectory()) fs.readdirSync(p).forEach(f => walk(path.join(p, f))); else if (p.endsWith('.glb')) files.push(p); };
args.forEach(walk);
let fails = 0, warns = 0;
const rows = [];
for (const f of files.sort()) {
  const r = check(f);
  const nf = r.out.filter(l => l.startsWith('FAIL')).length, nw = r.out.filter(l => l.startsWith('WARN')).length;
  fails += nf; warns += nw;
  console.log(`\n${r.id}  (${r.kind})  ${nf ? 'FAIL' : nw ? 'WARN' : 'PASS'}`);
  r.out.filter(l => !l.startsWith('ok')).forEach(l => console.log('  ' + l));
  rows.push([r.id, r.kind, nf ? 'FAIL' : nw ? 'WARN' : 'PASS', r.tris, r.prims, r.mats, r.bones, r.clips]);
}
console.log('\nSummary: ' + files.length + ' files, ' + fails + ' failures, ' + warns + ' warnings');
console.log('file | kind | result | triangles | draw calls | materials | bones | clips');
rows.forEach(r => console.log(r.join(' | ')));
process.exit(fails ? 1 : 0);
