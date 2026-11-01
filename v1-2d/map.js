// map.js
// The world map and everything about places in it.
//
// The map is a list of strings. Each letter is one tile (48 x 48 pixels).
// Edit the letters below to change the world. The legend:
//
//   .  grass            =  road             ~  water
//   R  rock             T  tree             F  fence
//   *  flowers (you can drive on them, like grass)
//   H  haunted house wall (part of a 3x3 building)
//   1-6  haunted house doors (the bottom middle of each building)
//   b c d e f  gates. Gate b opens after house 1, c after house 2, and so on
//   G  the Gecko Land gate (opens after house 6, drive in to win)
//   r  a robot that gives hints     S  the start pad
//
// The map is 96 tiles wide (6 screens) and 48 tiles tall (4 screens).
// This file also knows how to draw tiles and houses, and how to find a
// path so the robots can give good directions.

const TILE = 48;
const VIEW_W = 16 * TILE, VIEW_H = 12 * TILE;   // one screen: 768 x 576 pixels
const MAP = [
  'TTTTTTTTTTTTTTTTTTTTTTTTFTTTTTTTTTTTTTTTTTTTTTT~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T.......................F......................~~.......................T..............HHH.....T',
  'T.......................F......................~~.......................T.T............HHH.....T',
  'T.......................F...........~~~........~~......T..T.............T..............H4H.....T',
  'T...S...........~~~.....F...........~~~.....T..~~.............=.T.....R.T.......=============..T',
  'T...=.R.T.......~~~.....F...R..................~~.............=.........T.......=...........=..T',
  'T...=......R..=.........F.........R.......======c======...R...=.........T.......=...........=..T',
  'T...=.........=.........F.................=....~~.....=.......=.........T.....r.=...........=..T',
  'T...=.........=.....====b======...........=....~~.....=.r.....=.........T...T...=.........T.=..T',
  'T...=.r.......=.....=...F.....=......T....=..T.~~.....=.......=.........T.......=...........=..T',
  'T...=.........=.....=...F.....=...T.......=....~~.....=..T....=...======d========.....=======..T',
  'T...=.........=..R..=...F...r.=...........=..T.~~.....=.......=...=.....T...........T.......=..T',
  'T...===========.....=...F.....=...........=....~~.....=========...=.....T.....T.......R.T...=..T',
  'T...=...............=...F.....=....HHH....=....~~.....=...........=.....T...................=..T',
  'T...=...............=...F.....=....HHH....=....~~.....=...........=.....T...........T.......=..T',
  'T...=...............=...F.....=....H2H....=....~~.....=....HHH....=.....T.R.................=..T',
  'T...=......HHH......=...F.....=============....~~.....=....HHH....=.T...T...........=========..T',
  'T...=......HHH......=...F.....=................~~.....=....H3H....=.....T.....T.R...=..........T',
  'T...=......H1H......=...F.....=.....T..........~~.....=============.T...T...........=..........T',
  'T...=================...F.....=................~~...T...................T.......T...=..........T',
  'T.......................F.....=...........T....~~.......................T..T........=.....~~...T',
  'T.......................F.....===========......~~.............~~~~......T...........=.....~~...T',
  'T.......................F......................~~...................T...T...T.......=..........T',
  'T.......................F......................~~.......................T...........=..........T',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTRRRRRRRRRRRRRRRRRRRRRR~~TTTTTTTTTTTeTTTTTTTTTTT',
  'T.*........*..*.........*..*......**...**..*....T......................~~...........=..........T',
  'T.T.**..*...........T****.*.*..*.*...*....*.T*T.T..T..............=....~~.....T.....=...*......T',
  'T......**..*.*~~~~*..*...*.*..*.*...*....*..*..*T........HHH......=....~~...........=..........T',
  'T*.*..........~~~~.*.......**....*.*..=**...*.*.T.....T..HHH......=..T.~~..T........=..........T',
  'T....**....T..*...*..*..*.*..*..*.*.*.=..T**..*.T........H6H......=....~~.......T...=........T.T',
  'T...*.**.....**.T*.T...*..*....**.....=......**.T.T...=============....~~...........=.r..*.....T',
  'T*T.*.*.**.....**...*...*.*...........=....***.*T.....=...........=....~~.......T...=..........T',
  'T**...*...=============================..*.*....T.....=.T...T.....=....~~..T........=....*.T...T',
  'T.*.......=..*....*.*...=.**.....**.*.***...*.*.T.T...=.........r.=....~~...........=..........T',
  'T..*.***.*=*..***.T.*...=*....*.*.*.***.....*..*T.....=......T....=....~~...*.......=..........T',
  'T.*.**.**.=*..*.......*.=*..*....*....**........T.....=....T......=....~~...........=.HHH....*.T',
  'T..*.*..*.=....**..*T*..=......*...*T.*...*...**T.T...=.T.....*...======f======.....=.HHH......T',
  'T.........=*.....**..**.=.*.**.......*.*..*.....T.....=................~~.....=.....=.H5H......T',
  'T.*..**...=*...*.*..T...=...*..T..*..*.*..*...**T.....=..........*.....~~.....=============..*.T',
  'T..T...*..=..T.*.*..*.*.=...........*.**..*..*..T.....=.......T........~~..T..=................T',
  'T....*.*..=..*.*..*.*...========================G======.........*.T....~~.....=..............T.T',
  'T***...T..=...**.*...**.**.*..*.*...**..........T.........T............~~.....=.....*......T...T',
  'T.*.**....=...*.....****..***.*..*.**.**.*..**.*T...........~~~~.....T.~~.....=.T..............T',
  'T...*.*.*.=*...*.****..T.*.**........*...*.*....T...........~~~~..T....~~...*.=................T',
  'T**.*..**.=....*..**T*.*...*..~~~~.......***..*.T......T.*.............~~.....===============..T',
  'T*...*T.*..**.**.*..*...*.**.**..*..*....*..*.*.T.................T..T.~~...*..................T',
  'T..**......*....***..........*..**...*.*...**...T......................~~......................T',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~TTTTTTTTTTTTTTTTTTTTTTT',
];
const MAP_W = MAP[0].length;
const MAP_H = MAP.length;

// The six haunted houses, in the order you must beat them.
// door: the door tile. front: where the car parks (just below the door).
const HOUSES = [
  { n: 1, door: [12, 18], villain: 'dragon',  item: 'Robot Key',      icon: '🔑',
    taunt: 'You will never get past my puzzle, little gecko!' },
  { n: 2, door: [36, 15], villain: 'snowgun', item: 'Snow Boots',     icon: '🥾',
    taunt: 'Brrr! My puzzle is so cool, you will be frozen solid!' },
  { n: 3, door: [60, 17], villain: 'yoyo',    item: 'Yo-yo String',   icon: '🧵',
    taunt: 'Up and down, round and round! You cannot beat me!' },
  { n: 4, door: [88, 3],  villain: 'wizard',  item: 'Wizard Hat',     icon: '🎩',
    taunt: 'Abracadabra! My magic words will trick you!' },
  { n: 5, door: [87, 37], villain: 'dragon',  item: 'Dragon Scale',   icon: '🐲',
    taunt: 'I am back, and my numbers are even HOTTER now!' },
  { n: 6, door: [58, 29], villain: 'wizard',  item: 'Gecko Land Map', icon: '🗺️',
    taunt: 'My last riddles are the trickiest of all! Hee hee!' },
];
HOUSES.forEach(h => { h.front = [h.door[0], h.door[1] + 1]; });

// Where each house's villain hangs out on the road.
//   dragon: flies around a loop of corner points
//   snowgun: stands still and shoots snowballs in one direction
//   yoyo: bounces between two points on a string
//   wizard: teleports around a home tile
const ROAD_VILLAINS = [
  { house: 1, kind: 'dragon',  loop: [[8, 14], [17, 14], [17, 21], [8, 21]] },
  { house: 2, kind: 'snowgun', at: [43, 16], aim: 'left' },
  { house: 3, kind: 'yoyo',    from: [50, 14], to: [59, 14] },
  { house: 4, kind: 'wizard',  home: [84, 7] },
  { house: 5, kind: 'dragon',  loop: [[81, 32], [92, 32], [92, 41], [81, 41]] },
  { house: 6, kind: 'wizard',  home: [62, 34] },
];

// Gates: the letter, and how many houses you need to have beaten.
const GATE_NEEDS = { b: 1, c: 2, d: 3, e: 4, f: 5, G: 6 };
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const DIR_WORDS = { up: 'north', down: 'south', left: 'west', right: 'east' };

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return 'T';
  return MAP[y][x];
}

// Find the tile position of a letter, for example the start pad 'S'.
function findTiles(letter) {
  const out = [];
  for (let y = 0; y < MAP_H; y++)
    for (let x = 0; x < MAP_W; x++) if (MAP[y][x] === letter) out.push([x, y]);
  return out;
}
const START = findTiles('S')[0];
const ROBOTS = findTiles('r');
const GATES = Object.keys(GATE_NEEDS).map(k => ({ letter: k, pos: findTiles(k)[0], needs: GATE_NEEDS[k] }));

function gateOpen(letter, housesDone) { return housesDone >= GATE_NEEDS[letter]; }

// Can the car drive onto this tile?
function canDrive(x, y, housesDone) {
  const c = tileAt(x, y);
  if (c === '.' || c === '=' || c === '*' || c === 'S') return true;
  if (c in GATE_NEEDS && c !== 'G') return gateOpen(c, housesDone);
  return false;
}

// Which part of the world a tile is in: 0 is deep Robot Land, 6 is Gecko Land.
function regionAt(x, y) {
  if (y < 24) return Math.min(3, Math.floor(x / 24));
  if (x >= 72) return 4;
  if (x >= 48) return 5;
  return 6;
}

// ---------- Pathfinding and robot hints ----------

// Shortest drive from one tile to another. Roads are "cheaper" than grass,
// so the robots tell you to follow the road. Returns a list of [x, y].
function findPath(sx, sy, tx, ty, housesDone) {
  const N = MAP_W * MAP_H, dist = new Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
  const start = sy * MAP_W + sx, goal = ty * MAP_W + tx;
  const buckets = [[start]];
  dist[start] = 0;
  for (let cost = 0; cost < buckets.length; cost++) {
    for (const i of buckets[cost] || []) {
      if (dist[i] !== cost) continue;
      if (i === goal) {
        const path = [];
        for (let k = goal; k !== -1; k = prev[k]) path.unshift([k % MAP_W, Math.floor(k / MAP_W)]);
        return path;
      }
      const x = i % MAP_W, y = Math.floor(i / MAP_W);
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = x + dx, ny = y + dy;
        if (!canDrive(nx, ny, housesDone)) continue;
        const j = ny * MAP_W + nx, c = tileAt(nx, ny);
        const nd = cost + (c === '=' || c in GATE_NEEDS ? 1 : 3);
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; (buckets[nd] = buckets[nd] || []).push(j); }
      }
    }
  }
  return null;
}

// Turn a path into a short list of legs like { dir: 'up', len: 5, road: true }.
function pathLegs(path) {
  const legs = [];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i - 1][0], dy = path[i][1] - path[i - 1][1];
    const dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    const onRoad = tileAt(path[i][0], path[i][1]) === '=';
    const last = legs[legs.length - 1];
    if (last && last.dir === dir) { last.len++; last.roadTiles += onRoad ? 1 : 0; last.end = i; }
    else legs.push({ dir, len: 1, roadTiles: onRoad ? 1 : 0, start: i, end: i });
  }
  // Ignore tiny wiggles of one tile so the hint stays simple.
  const big = legs.filter(l => l.len >= 2);
  return big.length ? big : legs;
}

// Is there something easy to spot next to this part of the path?
function landmarkNear(path, from, to) {
  for (let i = from; i <= to && i < path.length; i++) {
    const [x, y] = path[i];
    if (tileAt(x, y) in GATE_NEEDS) return 'through the open gate';
    for (const [dx, dy] of Object.values(DIRS)) {
      const c = tileAt(x + dx, y + dy);
      if (c === 'R') return 'past the big rock';
      if (c === '~') return 'by the water';
      if (c === 'r') return 'past a robot friend';
    }
  }
  return '';
}

// Build the robot's hint toward the next house. detailed adds a second sentence.
function makeHint(carX, carY, housesDone, detailed) {
  const hellos = ['Beep boop!', 'Bzzt! Hi friend!', 'Whirr click!', 'Boop beep!'];
  const hello = hellos[Math.floor(Math.random() * hellos.length)];
  const allDone = housesDone >= HOUSES.length;
  const gate = GATES.find(g => g.letter === 'G').pos;
  const target = allDone ? [gate[0] + 1, gate[1]] : HOUSES[housesDone].front;
  const name = allDone ? 'the Gecko Land gate' : 'haunted house ' + (housesDone + 1);
  const path = findPath(carX, carY, target[0], target[1], housesDone);
  if (!path) return hello + ' Hmm, try driving back to the road.';
  if (path.length <= 1) {
    return hello + (allDone ? ' Drive west through the flower gate to go home!'
                            : ' You are right at the door! Drive up into it!');
  }
  const legs = pathLegs(path);
  const a = legs[0], b = legs[1];
  let text = hello + ' Drive ' + DIR_WORDS[a.dir];
  if (b) {
    text += ', then ' + (b.roadTiles * 2 >= b.len ? 'follow the road ' : 'go ') + DIR_WORDS[b.dir];
    const mark = landmarkNear(path, b.start, b.end);
    if (mark) text += ' ' + mark;
  } else if (a.roadTiles * 2 >= a.len) text += ' along the road';
  text += '.';
  if (detailed) {
    const steps = path.length - 1;
    const how = steps < 8 ? 'super close' : steps < 20 ? 'not far' : 'a long drive';
    text += ' ' + name.charAt(0).toUpperCase() + name.slice(1) + ' is ' + how + ', about ' + steps + ' steps away. ';
    text += allDone ? 'Look for the gate with flowers on it!' : 'Look for the big number ' + (housesDone + 1) + ' on the roof!';
  }
  return text;
}

// ---------- Villains on the road ----------
// The game passes in `w`, a small helper object with:
//   w.carX, w.carY   where the car is, in tiles
//   w.housesDone, w.shotSpeed
//   w.shots          the list of flying snowballs and sparkles
//   w.puff(x, y, color)   makes a little poof of dots
//   w.hurt(kind, x, y)    tells the game a villain touched the car
//   w.isSafe()            true while the car is blinking after a bump

function makeVillains(housesDone) {
  return ROAD_VILLAINS.filter(v => v.house > housesDone).map(v => {
    const o = Object.assign({ timer: 0, x: 0, y: 0 }, v);
    if (v.kind === 'dragon') { o.seg = 0; o.segT = 0; [o.x, o.y] = v.loop[0]; }
    if (v.kind === 'snowgun') [o.x, o.y] = v.at;
    if (v.kind === 'yoyo') { o.p = 0; o.way = 1; [o.x, o.y] = v.from; }
    if (v.kind === 'wizard') { [o.x, o.y] = v.home; o.castTimer = 1.5; }
    return o;
  });
}

function updateVillain(v, dt, w) {
  const cx = w.carX, cy = w.carY;
  if (v.kind === 'dragon') {
    const a = v.loop[v.seg], b = v.loop[(v.seg + 1) % v.loop.length];
    const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    v.segT += dt * 2 / len;
    if (v.segT >= 1) { v.segT = 0; v.seg = (v.seg + 1) % v.loop.length; }
    v.x = a[0] + (b[0] - a[0]) * v.segT; v.y = a[1] + (b[1] - a[1]) * v.segT;
  }
  if (v.kind === 'snowgun') {
    v.timer += dt;
    if (v.timer >= 2) {
      v.timer = 0;
      const [dx, dy] = DIRS[v.aim], sp = 3 * w.shotSpeed;
      w.shots.push({ kind: 'snow', x: v.x + dx * 0.6, y: v.y + dy * 0.6, vx: dx * sp, vy: dy * sp, life: 6 });
    }
  }
  if (v.kind === 'yoyo') {
    const len = Math.abs(v.to[0] - v.from[0]) + Math.abs(v.to[1] - v.from[1]);
    v.p += v.way * dt * 3 / len;
    if (v.p >= 1) { v.p = 1; v.way = -1; }
    if (v.p <= 0) { v.p = 0; v.way = 1; }
    v.x = v.from[0] + (v.to[0] - v.from[0]) * v.p; v.y = v.from[1] + (v.to[1] - v.from[1]) * v.p;
  }
  if (v.kind === 'wizard') {
    v.timer += dt; v.castTimer -= dt;
    if (v.timer >= 3) {
      v.timer = 0;
      for (let tries = 0; tries < 20; tries++) {
        const nx = v.home[0] + Math.floor(Math.random() * 7) - 3, ny = v.home[1] + Math.floor(Math.random() * 7) - 3;
        if (canDrive(nx, ny, w.housesDone) && Math.abs(nx - cx) + Math.abs(ny - cy) > 2) {
          w.puff(v.x, v.y, '#b583ff'); v.x = nx; v.y = ny; w.puff(v.x, v.y, '#b583ff');
          break;
        }
      }
    }
    if (v.castTimer <= 0) {
      v.castTimer = 3;
      const dx = cx - v.x, dy = cy - v.y, d = Math.hypot(dx, dy);
      if (d < 7 && d > 0.5) {
        const sp = 1.5 * w.shotSpeed;
        w.shots.push({ kind: 'sparkle', x: v.x, y: v.y, vx: dx / d * sp, vy: dy / d * sp, life: 4 });
      }
    }
  }
  if (Math.hypot(v.x - cx, v.y - cy) < 0.75) w.hurt(v.kind === 'dragon' ? 'bounce' : 'bump', v.x, v.y);
}

function updateShots(dt, w) {
  const cx = w.carX, cy = w.carY;
  return w.shots.filter(s => {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    const tx = Math.round(s.x), ty = Math.round(s.y);
    if (s.kind === 'snow' && !canDrive(tx, ty, w.housesDone)) return false;
    if (Math.hypot(s.x - cx, s.y - cy) < 0.6 && !w.isSafe()) {
      w.hurt(s.kind === 'snow' ? 'freeze' : 'bump', s.x, s.y);
      w.puff(s.x, s.y, s.kind === 'snow' ? '#ffffff' : '#ffe14d');
      return false;
    }
    return s.life > 0;
  });
}

// ---------- Drawing ----------

const GRASS = ['#8d9aac', '#8fa5a0', '#90b28f', '#86bb79', '#78c46a', '#6acb5c', '#5fd257'];
const TREE_TOP = ['#9aa6b8', '#7fa39a', '#5f9e6a', '#4a9a52', '#3f9a45', '#36a03d', '#2fae3a'];

// Small repeatable "random" number for a tile, so decorations do not flicker.
function tileHash(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }

function drawGround(ctx, x, y, px, py) {
  const reg = regionAt(x, y), h = tileHash(x, y);
  ctx.fillStyle = GRASS[reg];
  ctx.fillRect(px, py, TILE, TILE);
  if (reg <= 1) {
    // Metal plates with bolts in Robot Land.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
    ctx.fillStyle = 'rgba(40,50,70,0.35)';
    for (const [bx, by] of [[6, 6], [42, 6], [6, 42], [42, 42]]) ctx.fillRect(px + bx - 1.5, py + by - 1.5, 3, 3);
    if (reg === 1 && h % 3 === 0) drawTuft(ctx, px + 14 + (h % 20), py + 30);
  } else if (h % 2 === 0) {
    drawTuft(ctx, px + 8 + (h % 28), py + 12 + (h % 23));
  }
}

function drawTuft(ctx, x, y) {
  ctx.strokeStyle = 'rgba(30,90,30,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 4, y); ctx.lineTo(x - 2, y - 6);
  ctx.moveTo(x, y); ctx.lineTo(x, y - 8);
  ctx.moveTo(x + 4, y); ctx.lineTo(x + 2, y - 6);
  ctx.stroke();
}

function drawRoad(ctx, x, y, px, py) {
  const reg = regionAt(x, y);
  ctx.fillStyle = reg === 6 ? '#e2cf94' : reg <= 1 ? '#5d6475' : '#6f7180';
  ctx.fillRect(px, py, TILE, TILE);
  ctx.fillStyle = reg === 6 ? 'rgba(180,140,80,0.4)' : 'rgba(255,230,120,0.55)';
  const across = tileAt(x - 1, y) === '=' || tileAt(x + 1, y) === '=';
  if (across) ctx.fillRect(px + 8, py + 22, 14, 4); else ctx.fillRect(px + 22, py + 8, 4, 14);
}

// opened: the game's record of when each gate opened, for the animation.
function drawTile(ctx, x, y, px, py, t, housesDone, opened) {
  const c = tileAt(x, y);
  if (c === '=' || c === 'S' || c in GATE_NEEDS) drawRoad(ctx, x, y, px, py);
  else if (c !== '~') drawGround(ctx, x, y, px, py);
  const reg = regionAt(x, y), h = tileHash(x, y);
  if (c === '~') {
    ctx.fillStyle = reg <= 1 ? '#4f86c6' : '#3f9be6';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    const wob = Math.sin(t * 2 + x + y) * 4;
    ctx.beginPath();
    ctx.arc(px + 14 + wob, py + 18, 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.arc(px + 32 - wob, py + 34, 6, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else if (c === 'R') {
    ctx.fillStyle = '#7b7f88';
    ctx.beginPath(); ctx.ellipse(px + 24, py + 30, 19, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a3a7b0';
    ctx.beginPath(); ctx.ellipse(px + 19, py + 25, 9, 6, -0.3, 0, Math.PI * 2); ctx.fill();
  } else if (c === 'T') {
    ctx.fillStyle = reg <= 1 ? '#6c7380' : '#7a5230';
    ctx.fillRect(px + 20, py + 28, 8, 16);
    ctx.fillStyle = TREE_TOP[reg];
    ctx.beginPath();
    ctx.arc(px + 24, py + 20, 15, 0, Math.PI * 2);
    ctx.arc(px + 13, py + 27, 10, 0, Math.PI * 2);
    ctx.arc(px + 35, py + 27, 10, 0, Math.PI * 2);
    ctx.fill();
    if (reg <= 1) { ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(px + 24, py + 18, 3, 0, Math.PI * 2); ctx.fill(); }
  } else if (c === 'F') {
    ctx.fillStyle = '#b9c2cf';
    ctx.fillRect(px + 20, py, 8, TILE);
    ctx.fillStyle = '#e6ebf2';
    ctx.fillRect(px + 16, py + 6, 16, 6);
    ctx.fillRect(px + 16, py + 32, 16, 6);
  } else if (c === '*') {
    const colors = ['#ff6fa8', '#ffd23f', '#ffffff', '#b583ff', '#ff8c42'];
    for (let i = 0; i < 3; i++) {
      const fx = px + 8 + ((h >> (i * 4)) % 32), fy = py + 8 + ((h >> (i * 5 + 2)) % 32);
      ctx.fillStyle = colors[(h + i) % colors.length];
      for (let k = 0; k < 4; k++) {
        ctx.beginPath(); ctx.arc(fx + Math.cos(k * 1.57) * 3, fy + Math.sin(k * 1.57) * 3, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffb700'; ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
    }
  } else if (c === 'S') {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(px + 24, py + 24, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5d6475';
    ctx.beginPath(); ctx.arc(px + 24, py + 24, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('GO', px + 24, py + 29);
  } else if (c in GATE_NEEDS) {
    drawGate(ctx, c, px, py, t, housesDone, opened);
  }
}

// A closed gate has bars. When it opens, the bars slide up over one second.
function drawGate(ctx, letter, px, py, t, housesDone, opened) {
  const open = gateOpen(letter, housesDone);
  const since = opened && opened[letter] !== undefined ? t - opened[letter] : 99;
  const lift = open ? Math.min(1, Math.max(0, since)) : 0;
  const isHome = letter === 'G';
  // Posts on each side.
  ctx.fillStyle = isHome ? '#8a5a2b' : '#4b5263';
  ctx.fillRect(px, py - 6, 7, TILE + 6);
  ctx.fillRect(px + TILE - 7, py - 6, 7, TILE + 6);
  if (isHome) {
    ctx.fillStyle = '#ff6fa8';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(px + 3 + (i % 2) * 42, py - 4 + i * 9, 4, 0, Math.PI * 2); ctx.fill(); }
  }
  if (lift >= 1) return;
  // Bars that slide up and fade when the gate opens.
  ctx.save();
  ctx.globalAlpha = 1 - lift;
  ctx.translate(0, -lift * 30);
  ctx.fillStyle = isHome ? '#d9a35c' : '#e05555';
  for (let i = 0; i < 3; i++) ctx.fillRect(px + 7, py + 8 + i * 13, TILE - 14, 6);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(px + 24, py + 24, 11, 0, Math.PI * 2); ctx.fill();
  ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(isHome ? '🦎' : '🔒', px + 24, py + 25);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// A haunted house covers 3x3 tiles. px, py is the top-left corner.
function drawHouse(ctx, house, px, py, t, done, isNext) {
  const W = TILE * 3;
  // Walls
  ctx.fillStyle = done ? '#9c8fc4' : '#6d5a9c';
  ctx.fillRect(px + 8, py + 46, W - 16, W - 46);
  // Roof
  ctx.fillStyle = done ? '#5d4f8a' : '#3f3168';
  ctx.beginPath(); ctx.moveTo(px - 2, py + 52); ctx.lineTo(px + W / 2, py + 2); ctx.lineTo(px + W + 2, py + 52); ctx.fill();
  // Number on the roof
  ctx.fillStyle = '#ffe066';
  ctx.beginPath(); ctx.arc(px + W / 2, py + 32, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3f3168'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(String(house.n), px + W / 2, py + 40);
  // Windows (wobbly glow)
  const glow = done ? '#fff3b0' : 'rgba(180,255,170,' + (0.6 + 0.3 * Math.sin(t * 3 + house.n)) + ')';
  ctx.fillStyle = glow;
  ctx.fillRect(px + 22, py + 62, 22, 20);
  ctx.fillRect(px + W - 44, py + 60, 22, 22);
  ctx.strokeStyle = '#3f3168'; ctx.lineWidth = 2;
  ctx.strokeRect(px + 22, py + 62, 22, 20); ctx.strokeRect(px + W - 44, py + 60, 22, 22);
  // Cobweb in the corner
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { ctx.moveTo(px + 10, py + 48); ctx.lineTo(px + 10 + Math.cos(i * 0.5) * 24, py + 48 + Math.sin(i * 0.5) * 24); }
  ctx.arc(px + 10, py + 48, 12, 0, Math.PI / 2); ctx.moveTo(px + 30, py + 48); ctx.arc(px + 10, py + 48, 20, 0, Math.PI / 2);
  ctx.stroke();
  // Door
  const dx = px + TILE + 8, dy = py + TILE * 2 + 4;
  if (isNext) {
    ctx.fillStyle = 'rgba(255,240,120,' + (0.35 + 0.35 * Math.sin(t * 5)) + ')';
    ctx.beginPath(); ctx.arc(dx + 16, dy + 22, 30, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = done ? '#7a5230' : '#2b2140';
  ctx.beginPath(); ctx.moveTo(dx, dy + 44); ctx.lineTo(dx, dy + 14); ctx.arc(dx + 16, dy + 14, 16, Math.PI, 0); ctx.lineTo(dx + 32, dy + 44); ctx.fill();
  if (done) {
    ctx.font = '26px sans-serif';
    ctx.fillText('✅', px + W - 16, py + 26);
  } else {
    // A tiny cartoon ghost peeking out of the roof.
    const gy = py + 10 + Math.sin(t * 2 + house.n) * 4;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(px + W - 18, gy, 10, Math.PI, 0); ctx.lineTo(px + W - 8, gy + 10); ctx.lineTo(px + W - 28, gy + 10); ctx.fill();
    ctx.fillStyle = '#333';
    ctx.fillRect(px + W - 22, gy - 2, 2, 3); ctx.fillRect(px + W - 16, gy - 2, 2, 3);
  }
}

// ---------- The whole overworld ----------

// Draws the overworld: tiles, houses, robots, villains, shots and the car.
// s is the game's state object (see game.js).
function drawWorld(ctx, s) {
  const cam = s.camera, t = s.time;
  const ox = Math.round(cam.x), oy = Math.round(cam.y);
  ctx.save();
  ctx.translate(-ox, -oy);
  const x0 = Math.floor(ox / TILE), y0 = Math.floor(oy / TILE);
  for (let y = y0; y <= y0 + VIEW_H / TILE + 1; y++)
    for (let x = x0; x <= x0 + VIEW_W / TILE + 1; x++)
      if (x < MAP_W && y < MAP_H) drawTile(ctx, x, y, x * TILE, y * TILE, t, s.housesDone, s.gateOpenedAt);
  const inView = (x, y, pad) => x * TILE > ox - pad && x * TILE < ox + VIEW_W + pad && y * TILE > oy - pad && y * TILE < oy + VIEW_H + pad;
  HOUSES.forEach(h => {
    if (inView(h.door[0], h.door[1], 200))
      drawHouse(ctx, h, (h.door[0] - 1) * TILE, (h.door[1] - 2) * TILE, t, h.n <= s.housesDone, h.n === s.housesDone + 1);
  });
  ROBOTS.forEach(([x, y], i) => { if (inView(x, y, 60)) drawRobot(ctx, x * TILE + 24, y * TILE + 28, t + i * 0.7, 40); });
  s.villains.forEach(v => {
    if (!inView(v.x, v.y, 100)) return;
    if (v.kind === 'yoyo') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(v.from[0] * TILE + 24, v.from[1] * TILE - 20);
      ctx.quadraticCurveTo((v.from[0] + v.x) / 2 * TILE + 24, v.y * TILE - 10 + Math.sin(t * 5) * 8, v.x * TILE + 24, v.y * TILE + 24);
      ctx.stroke();
      circle(ctx, v.from[0] * TILE + 24, v.from[1] * TILE - 20, 5, '#c2185b');
    }
    drawVillain(ctx, v.kind, v.x * TILE + 24, v.y * TILE + 24, 42, t, { aim: v.aim });
  });
  s.shots.forEach(shot => {
    const px = shot.x * TILE + 24, py = shot.y * TILE + 24;
    if (shot.kind === 'snow') { circle(ctx, px, py, 8, '#ffffff'); ctx.strokeStyle = '#8fc4ff'; ctx.lineWidth = 2; ctx.stroke(); }
    else { ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✨', px, py); ctx.textBaseline = 'alphabetic'; }
  });
  drawPlayer(ctx, s, t);
  s.puffs.forEach(p => { ctx.globalAlpha = Math.max(0, p.life / 0.6); circle(ctx, p.x * TILE + 24, p.y * TILE + 24, 5, p.color); });
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawPlayer(ctx, s, t) {
  const ch = getCharacter(s.charId), c = s.car;
  const cx = c.fromX + (c.x - c.fromX) * c.prog, cy = c.fromY + (c.y - c.fromY) * c.prog;
  const px = cx * TILE + 24, py = cy * TILE + 24;
  const blink = s.safe > 0 && Math.floor(t * 10) % 2 === 0;
  if (!blink) drawCar(ctx, ch, px, py, s.car.dir, t, s.car.prog < 1);
  if (s.frozen > 0) {
    ctx.fillStyle = 'rgba(190,230,255,0.6)';
    ctx.fillRect(px - 22, py - 22, 44, 44);
    ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('❄️', px, py - 26);
  }
  if (s.exitWalk) {
    const w = s.exitWalk, h = HOUSES[w.n - 1], k = Math.min(1, w.t / 0.9);
    const sx = px + 26 * (1 - k) + (h.door[0] * TILE + 24 - px) * k;
    const sy = py + (h.door[1] * TILE + 24 - py) * k;
    drawCharacter(ctx, ch, sx, sy, 32, t, 'happy');
  }
}
