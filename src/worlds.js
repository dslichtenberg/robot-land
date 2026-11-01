// worlds.js
// The six worlds, written as plain numbers so they are easy to edit.
//
// Positions are [x, z] on the ground. x goes east (right on screen) and
// z goes south (down on screen), so north is negative z. Each world runs
// from -60 to 60 both ways. Boxes are [x1, z1, x2, z2] corners.
//
// What a world can have (all optional except start, house and portal):
//   streets      flat paths, just for looks
//   cityBlocks   rows and columns of buildings (World 1)
//   walls        solid boxes: { box, style, h }
//   scatter      trees, rocks and so on sprinkled in a box: { box, count, style }
//   water        rivers, lava or canyons you cannot cross: { box, style }
//   bridges      { box, kind: 'draw' (lifts), 'stones' (sink), 'broken' (decoy) }
//   conveyors    belts that push you: { box, push: [x, z] }
//   ice          slippery boxes
//   jumpPads     springs that throw you: { at, to }
//   teleports    magic pads in pairs: { a, b, color }
//   switches     buttons you drive onto or stars you collect: { at, kind }
//   gates        { box, needs: [switch numbers] } open when those are done
//   rollers      things rolling back and forth: { from, to, speed, kind }
//   cannons      { at, dir, every, speed, range, offset }
//   wizards      teleporting wizards that throw sparkles: { home, radius }
//   patrols      a villain flying in a circle: { kind, x, z, r, speed }
//   robots       hint robots: { at, line }
//   checkpoints  where you come back if you run out of hearts: { box, at }
//   goals(s)     what the robots tell you to do next, given where you are
//
// item.power is what the prize does for you in the later worlds (see POWERS in main.js).
//
// guard: true on a villain means it leaves once you beat that world's house.

const inBox = (x, z, [x1, z1, x2, z2]) => x > x1 && x < x2 && z > z1 && z < z2;
const nearest = (s, list) => list.map((p, i) => ({ p, i })).filter(o => !s.switchDone(o.i))
  .sort((a, b) => Math.hypot(a.p[0] - s.x, a.p[1] - s.z) - Math.hypot(b.p[0] - s.x, b.p[1] - s.z))[0];

export const WORLDS = [
  // ===================== 1. GEAR CITY =====================
  {
    id: 'gear-city', name: 'Gear City', vehicle: 'kart', room: 'lava1',
    villain: 'dragon', item: { name: 'Robot Key', icon: '🔑', kind: 'key', power: 'laser' },
    theme: { ground: 'plates', groundColor: '#8d9aac', road: '#5d6475', fog: '#c3cddb', edge: '#b9c2cf', house: '#6d5a9c' },
    start: [-45, 48],
    hills: [[-2, -54, 6, 3], [10, -50, 5, 2.5], [42, -14, 7, 3]],
    streets: [
      [-58, 44, 58, 52], [-58, 24, 58, 32], [-58, 5, 58, 11],
      [-34, 5, -26, 58], [-4, 5, 4, 58], [26, 5, 34, 58],
      [-33, -56, -27, -5], [-56, -43, 22, -37], [-54, -55, -46, -43],
    ],
    cityBlocks: { xs: [[-58, -34], [-26, -4], [4, 26], [34, 58]], zs: [[11, 24], [32, 44], [52, 58]] },
    water: [{ box: [-60, -4, -33, 3] }, { box: [-27, -4, 60, 3] }],
    bridges: [{ box: [-33, -4, -27, 3], kind: 'draw', cycle: 8 }, { box: [27, -4, 33, 3], kind: 'broken' }],
    conveyors: [{ box: [-44, -32, 16, -12], push: [7, 0] }],
    walls: [{ box: [-60, -33, -44, -11], style: 'crate', h: 2.5 }, { box: [16, -33, 24, -11], style: 'crate', h: 2.5 }],
    landmark: { kind: 'gear', at: [-14, -48] },
    switches: [{ at: [-50, -51], kind: 'button' }],
    gates: [{ box: [23.5, -43, 24.5, -37] }],
    yardWalls: [[23.5, -60, 24.5, -43], [23.5, -37, 24.5, -23.5], [23.5, -24.5, 60, -23.5]],
    house: { x: 46, z: -40, size: 8, door: 'west' },
    portal: [33, -50],
    patrols: [{ kind: 'dragon', x: 46, z: -40, r: 9.5, speed: 3.6, guard: true }],
    rollers: [{ from: [-55, 28], to: [55, 28], speed: 8, kind: 'gear' }],
    robots: [
      { at: [-40, 45], line: 'Hi! I am Bolt.' },
      { at: [30, 7.5], line: 'Oh no! This bridge is broken. There is another bridge on the west side of town.' },
      { at: [-24, -7], line: 'Whoa, those moving belts push you to the east! Steer against them.' },
      { at: [18, -45], line: 'This yard has a locked gate. I heard a big red button opens it.' },
    ],
    checkpoints: [{ box: [-58, -58, 58, -5], at: [-30, -8] }, { box: [25, -58, 58, -25], at: [29, -40] }],
    goals(s) {
      if (s.z > -4) return { text: 'The haunted house is across the river, far to the north. Find the bridge that goes up and down. Wait for it to come down, then zoom across!', target: [-30, 8] };
      if (!s.switchDone(0)) return { text: (inBox(s.x, s.z, [-44, -32, 16, -12]) ? 'Steer against the belts! ' : '') + 'The haunted house yard has a locked gate. Find the big red button in the far north-west corner, near the gear tower.', target: [-50, -51] };
      if (!inBox(s.x, s.z, [24, -60, 60, -24])) return { text: 'Clank! The gate is open. Go east into the yard to find the haunted house.', target: [22, -40] };
      return null;
    },
  },

  // ===================== 2. FROSTY PEAKS =====================
  {
    id: 'frosty', name: 'Frosty Peaks', vehicle: 'snowmobile', room: 'ice',
    villain: 'snowgun', item: { name: 'Rocket Boots', icon: '🥾', kind: 'boots', power: 'turbo' },
    theme: { ground: 'snow', groundColor: '#eef4fb', road: '#c9d8ea', fog: '#dfe9f5', edge: '#a9c4e0', house: '#7a9cc6' },
    start: [0, 52],
    hills: [[-30, 40, 10, 4], [30, 38, 10, 4], [-45, 25, 7, 3], [45, 52, 8, 4], [-35, -50, 8, 3], [35, -50, 8, 3]],
    mountains: [[-52, -16, 8, 12], [-52, -4, 8, 14], [-52, 8, 8, 12], [52, -16, 8, 12], [52, -4, 8, 14], [52, 8, 8, 12]],
    streets: [[-4, 18, 4, 58], [-4, -42, 4, -24], [-56, -36, 56, -30]],
    scatter: [
      { box: [-58, 20, -8, 58], count: 45, style: 'pine' }, { box: [8, 20, 58, 58], count: 45, style: 'pine' },
      { box: [-36, -20, 36, 12], count: 16, style: 'icerock' },
      { box: [-58, -58, -18, -40], count: 14, style: 'pine' }, { box: [18, -58, 58, -40], count: 14, style: 'pine' },
    ],
    walls: [{ box: [-60, -24, -40, 16], style: 'hidden' }, { box: [40, -24, 60, 16], style: 'hidden' }],
    ice: [[-40, -24, 40, 16]],
    landmark: { kind: 'crystal', at: [0, -58] },
    switches: [{ at: [-50, -50], kind: 'button' }, { at: [50, -50], kind: 'button' }],
    gates: [{ box: [-3, -42.5, 3, -41.5], style: 'ice' }],
    yardWalls: [[-14.5, -60, -13.5, -41.5], [13.5, -60, 14.5, -41.5], [-14.5, -42.5, -3, -41.5], [3, -42.5, 14.5, -41.5]],
    house: { x: 0, z: -52, size: 7, door: 'south' },
    portal: [8, -47],
    cannons: [
      { at: [-57, -30], dir: [1, 0], every: 2.6, speed: 14, range: 114, offset: 0 },
      { at: [57, -36], dir: [-1, 0], every: 2.6, speed: 14, range: 114, offset: 1.3 },
      { at: [-12, -48], dir: [1, 0], every: 2, speed: 10, range: 24, offset: 0.5, guard: true },
    ],
    robots: [
      { at: [7, 50], line: 'Brrr! Welcome to Frosty Peaks!' },
      { at: [-7, 19], line: 'The lake is frozen and super slippery. Steer early and go slow!' },
      { at: [0, -27], line: 'Watch the snowballs flying across the path! Wait for a gap.' },
      { at: [20, -45], line: 'The ice gate melts when BOTH buttons are pressed.' },
    ],
    checkpoints: [{ box: [-60, -60, 60, -25], at: [0, -27] }, { box: [-13, -60, 13, -43], at: [-6, -45] }],
    goals(s) {
      if (s.z > -24) return { text: 'Cross the frozen lake to the north. It is slippery, so steer early!', target: [0, -26] };
      const b = nearest(s, [[-50, -50], [50, -50]]);
      if (b) return { text: 'Two red buttons melt the ice gate, one in each top corner. ' + s.switchCount + ' of 2 pressed. Watch for snowballs!', target: b.p };
      if (!inBox(s.x, s.z, [-14, -60, 14, -42])) return { text: 'The ice gate melted! The haunted house is in the middle at the top.', target: [0, -40] };
      return null;
    },
  },

  // ===================== 3. BOUNCY HILLS =====================
  {
    id: 'bouncy', name: 'Bouncy Hills', vehicle: 'buggy', room: 'levers',
    villain: 'yoyo', item: { name: 'Bouncy String', icon: '🧵', kind: 'string', power: 'jump' },
    theme: { ground: 'grass', groundColor: '#7cc86a', road: '#d9c48c', fog: '#cfe8d6', edge: '#8a5a2b', house: '#c25b8f' },
    start: [0, 50],
    hills: [[-30, 35, 9, 4], [28, 40, 10, 5], [-48, 52, 7, 3], [45, 22, 7, 3], [-18, 22, 6, 2.5], [-35, -50, 7, 3.5], [35, -50, 6, 3]],
    mountains: [[52, 34, 7, 11]],
    streets: [[-4, 10, 4, 58], [-40, 6, 40, 12], [-56, -24, 56, -18], [-24, -44, 24, -38], [-4, -44, 4, -40]],
    water: [{ box: [-60, -6, 60, 2], style: 'chasm' }, { box: [-60, -34, 60, -28], style: 'chasm' }],
    jumpPads: [
      { at: [-36, 6], to: [-36, -12] }, { at: [0, 6], to: [0, -12] }, { at: [36, 6], to: [36, -14] },
      { at: [36, -18], to: [36, 12] },
      { at: [-20, -24], to: [-20, -40] }, { at: [20, -24], to: [20, -40] },
      { at: [-30, -38], to: [-30, -20] },
    ],
    walls: [
      { box: [28, -22, 29, -8], style: 'hedge', h: 2 }, { box: [43, -22, 44, -8], style: 'hedge', h: 2 },
      { box: [28, -23, 44, -22], style: 'hedge', h: 2 }, { box: [28, -8, 44, -7], style: 'hedge', h: 2 },
    ],
    scatter: [
      { box: [-58, 14, -8, 58], count: 30, style: 'tree' }, { box: [8, 14, 58, 58], count: 30, style: 'tree' },
      { box: [-58, -58, -16, -46], count: 12, style: 'tree' }, { box: [24, -58, 44, -46], count: 6, style: 'tree' },
    ],
    landmark: { kind: 'yoyoTower', at: [0, -58] },
    switches: [{ at: [-52, -14], kind: 'button' }, { at: [50, -52], kind: 'button' }],
    gates: [{ box: [-3, -44.5, 3, -43.5], style: 'hedge' }],
    yardWalls: [[-14.5, -60, -13.5, -43.5], [13.5, -60, 14.5, -43.5], [-14.5, -44.5, -3, -43.5], [3, -44.5, 14.5, -43.5]],
    house: { x: 0, z: -53, size: 7, door: 'south' },
    portal: [-8, -48],
    rollers: [
      { from: [-56, -15], to: [26, -15], speed: 9, kind: 'yoyo' },
      { from: [56, -26], to: [-56, -26], speed: 7, kind: 'yoyo' },
      { from: [-12, -48], to: [12, -48], speed: 6, kind: 'yoyo', guard: true },
    ],
    robots: [
      { at: [6, 48], line: 'Boing! Welcome to Bouncy Hills!' },
      { at: [-8, 9], line: 'Drive onto a spring pad to jump the canyon! One pad lands in a dead end.' },
      { at: [36, -12], line: 'Oops, this is a dead end! Take the spring pad back.' },
      { at: [-10, -21], line: 'Giant yo-yos swing across the hills. Wait, then zoom past!' },
      { at: [18, -42], line: 'Two buttons open the hedge gate: one far west, one far north-east.' },
    ],
    checkpoints: [{ box: [-60, -28, 60, -6], at: [-20, -10] }, { box: [-60, -60, 60, -34], at: [-20, -40] }],
    goals(s) {
      if (s.z > -6) return { text: 'Jump the canyon with a spring pad! The pads on the west side and in the middle work. The east one is a dead end.', target: [-36, 6] };
      if (inBox(s.x, s.z, [28, -23, 44, -7])) return { text: 'Dead end! Drive onto the spring pad here to bounce back.', target: [36, -18] };
      if (!s.switchDone(0)) return { text: 'Press the red button on the far west side. Watch out for the swinging yo-yos!', target: [-52, -14] };
      if (s.z > -34) return { text: 'Find a spring pad near the second canyon to jump north.', target: [-20, -24] };
      if (!s.switchDone(1)) return { text: 'One more button! It is in the far north-east corner.', target: [50, -52] };
      if (!inBox(s.x, s.z, [-14, -60, 14, -44])) return { text: 'The hedge gate is open! The haunted house is in the middle at the top.', target: [0, -42] };
      return null;
    },
  },

  // ===================== 4. STARRY WOODS =====================
  {
    id: 'starry', name: 'Starry Woods', vehicle: 'glider', room: 'mirrors1',
    villain: 'wizard', item: { name: 'Wizard Hat', icon: '🎩', kind: 'hat', power: 'shield' },
    theme: { ground: 'night', groundColor: '#24405a', road: '#3d5a78', fog: '#141c38', edge: '#1e5a3a', house: '#5a3d8a', night: true, fogNear: 16, fogFar: 55 },
    start: [-30, 44],
    hills: [[-45, 45, 8, 3], [45, 25, 8, 3], [-45, -25, 7, 3], [12, -50, 5, 2]],
    streets: [[-34, 8, -26, 50], [-30, 26, -6, 34], [6, 26, 40, 34], [-34, -50, -26, -6], [6, -34, 20, -26]],
    walls: [
      { box: [-1, -60, 1, 60], style: 'hedge', h: 4 }, { box: [-60, -1, 60, 1], style: 'hedge', h: 4 },
      { box: [-44, 14, -42, 40], style: 'hedge', h: 4 }, { box: [-58, 14, -44, 16], style: 'hedge', h: 4 },
      { box: [30, 40, 32, 58], style: 'hedge', h: 4 }, { box: [32, 40, 46, 42], style: 'hedge', h: 4 },
      { box: [-46, -44, -44, -14], style: 'hedge', h: 4 }, { box: [-58, -44, -46, -42], style: 'hedge', h: 4 },
    ],
    scatter: [
      { box: [-58, 4, -6, 58], count: 18, style: 'mushroom' }, { box: [6, 4, 58, 58], count: 18, style: 'mushroom' },
      { box: [-58, -58, -6, -4], count: 18, style: 'mushroom' }, { box: [6, -18, 18, -4], count: 6, style: 'mushroom' },
    ],
    teleports: [
      { a: [-10, 30], b: [10, 30], color: '#4da6ff' },
      { a: [-30, 6], b: [-30, -8], color: '#c86bff' },
      { a: [-10, -30], b: [10, -30], color: '#ff5f7a' },
    ],
    landmark: { kind: 'moon', at: [0, -110] },
    switches: [{ at: [-52, 30], kind: 'star' }, { at: [52, 50], kind: 'star' }, { at: [-52, -52], kind: 'star' }],
    gates: [{ box: [19.5, -43, 20.5, -37], style: 'hedge' }],
    yardWalls: [[19.5, -60, 20.5, -43], [19.5, -37, 20.5, -19.5], [19.5, -20.5, 60, -19.5]],
    house: { x: 42, z: -40, size: 8, door: 'west' },
    portal: [30, -50],
    wizards: [{ home: [30, 18], radius: 8 }, { home: [10, -12], radius: 5 }, { home: [-30, -30], radius: 8 }],
    robots: [
      { at: [-24, 42], line: 'Shhh! These woods are full of magic.' },
      { at: [-14, 26], line: 'Glowing pads zap you to the other side of the hedges! Each color goes to a different place.' },
      { at: [14, 26], line: 'A wizard is hiding around here. Dodge his sparkles!' },
      { at: [14, -34], line: 'The hedge gate opens when you find all three stars.' },
    ],
    checkpoints: [
      { box: [2, 2, 60, 60], at: [12, 34] }, { box: [-60, -60, -2, -2], at: [-30, -12] },
      { box: [2, -60, 19, -2], at: [12, -34] }, { box: [21, -60, 60, -21], at: [24, -40] },
    ],
    goals(s) {
      const star = nearest(s, [[-52, 30], [52, 50], [-52, -52]]);
      if (star) {
        const where = star.i === 0 ? 'west, past the hedge near the start' : star.i === 1 ? 'in the south-east. Take the blue pad' : 'in the north-west. Take the purple pad';
        return { text: 'Find the glowing stars! ' + s.switchCount + ' of 3 so far. The next one is ' + where + '.', target: star.p };
      }
      if (!inBox(s.x, s.z, [2, -60, 60, -2])) return { text: 'All three stars! Now take the pink pad in the north-west woods to the north-east.', target: [-10, -30] };
      if (!inBox(s.x, s.z, [20, -60, 60, -20])) return { text: 'The hedge gate is open. Drive east to the haunted house!', target: [18, -40] };
      return null;
    },
  },

  // ===================== 5. LAVA MEADOW =====================
  {
    id: 'lava', name: 'Lava Meadow', vehicle: 'tractor', room: 'lava2',
    villain: 'dragon', item: { name: 'Dragon Scale', icon: '🐲', kind: 'scale', power: 'heart' },
    theme: { ground: 'ash', groundColor: '#6b4a3a', road: '#9a7a5a', fog: '#e8b48a', edge: '#4a2f22', house: '#7a3b2b' },
    start: [0, 52],
    hills: [[-40, 35, 9, 3], [38, 40, 9, 4], [35, -50, 6, 2.5]],
    mountains: [[48, 18, 7, 10]],
    streets: [[-4, 8, 4, 58], [-34, 0, -26, 10], [16, 0, 24, 10], [-56, -22, 56, -16], [-4, -44, 4, -36]],
    water: [
      { box: [-60, -8, -33, 0], style: 'lava' }, { box: [-27, -8, 17, 0], style: 'lava' }, { box: [23, -8, 60, 0], style: 'lava' },
      { box: [-60, -36, -3, -30], style: 'lava' }, { box: [3, -36, 60, -30], style: 'lava' },
    ],
    bridges: [
      { box: [-33, -8, -27, 0], kind: 'stones', cycle: 7, offset: 0 },
      { box: [17, -8, 23, 0], kind: 'stones', cycle: 7, offset: 3.5 },
      { box: [-3, -36, 3, -30], kind: 'stones', cycle: 6, offset: 1 },
    ],
    scatter: [
      { box: [-58, 12, -8, 58], count: 30, style: 'lavarock' }, { box: [8, 12, 58, 58], count: 30, style: 'lavarock' },
      { box: [-58, -58, -18, -40], count: 12, style: 'lavarock' }, { box: [18, -58, 44, -40], count: 10, style: 'lavarock' },
    ],
    landmark: { kind: 'volcano', at: [-44, -52] },
    switches: [{ at: [-52, -24], kind: 'button' }, { at: [52, -52], kind: 'button' }],
    gates: [{ box: [-3, -44.5, 3, -43.5], style: 'stone' }],
    yardWalls: [[-14.5, -60, -13.5, -43.5], [13.5, -60, 14.5, -43.5], [-14.5, -44.5, -3, -43.5], [3, -44.5, 14.5, -43.5]],
    house: { x: 0, z: -54, size: 7, door: 'south' },
    portal: [-8, -48],
    rollers: [
      { from: [-56, -19], to: [56, -19], speed: 11, kind: 'fireball' },
      { from: [56, -12], to: [-56, -12], speed: 8, kind: 'fireball' },
      { from: [-50, 30], to: [50, 30], speed: 9, kind: 'boulder' },
    ],
    patrols: [{ kind: 'dragon', x: 0, z: -50, r: 7, speed: 3.4, guard: true }],
    robots: [
      { at: [6, 50], line: 'It is HOT here! Do not touch the lava.' },
      { at: [-24, 10], line: 'The stepping stones sink into the lava, then pop back up. Cross when they are up!' },
      { at: [-8, -26], line: 'Fireballs roll across the meadow. Time your dash!' },
      { at: [10, -40], line: 'Two buttons open the stone gate. One west, one far north-east.' },
    ],
    checkpoints: [{ box: [-60, -30, 60, -8], at: [-20, -12] }, { box: [-60, -60, 60, -36], at: [8, -40] }],
    goals(s) {
      if (s.z > -8) return { text: 'Cross the lava river on the stepping stones. Wait until they pop up!', target: [-30, 4] };
      if (!s.switchDone(0)) return { text: 'Press the red button on the far west side. Dodge the fireballs!', target: [-52, -24] };
      if (s.z > -36) return { text: 'Cross the second lava river on the stones in the middle.', target: [0, -28] };
      if (!s.switchDone(1)) return { text: 'Press the last button in the far north-east corner.', target: [52, -52] };
      if (!inBox(s.x, s.z, [-14, -60, 14, -44])) return { text: 'The stone gate is open! The haunted house is straight north.', target: [0, -42] };
      return null;
    },
  },

  // ===================== 6. WIZARD TOWER =====================
  {
    id: 'tower', name: 'Wizard Tower', vehicle: 'carpet', room: 'mirrors2',
    villain: 'wizard', item: { name: 'Gecko Land Map', icon: '🗺️', kind: 'map' },
    theme: { ground: 'stone', groundColor: '#6a5f86', road: '#8c80a8', fog: '#3b2a5c', edge: '#2b2140', house: '#4b2f7a', night: true, fogNear: 22, fogFar: 70 },
    start: [0, 54],
    hills: [[-50, 50, 8, 3], [50, 50, 8, 3], [-52, -52, 7, 4], [52, -52, 7, 4]],
    streets: [[-3, 40, 3, 58], [-32, -34, 32, -30], [16, -3, 19, 3]],
    walls: [
      // Outer ring (door gap in the south)
      { box: [-41, -41, 41, -39], style: 'stone', h: 4 }, { box: [-41, 39, -3, 41], style: 'stone', h: 4 }, { box: [3, 39, 41, 41], style: 'stone', h: 4 },
      { box: [-41, -41, -39, 41], style: 'stone', h: 4 }, { box: [39, -41, 41, 41], style: 'stone', h: 4 },
      // Middle ring (gate in the east)
      { box: [-25, -25, 25, -23], style: 'stone', h: 4 }, { box: [-25, 23, 25, 25], style: 'stone', h: 4 },
      { box: [-25, -25, -23, 25], style: 'stone', h: 4 }, { box: [23, -25, 25, -3], style: 'stone', h: 4 }, { box: [23, 3, 25, 25], style: 'stone', h: 4 },
      // Inner ring (gate in the north)
      { box: [-12, -12, -3, -10], style: 'stone', h: 4 }, { box: [3, -12, 12, -10], style: 'stone', h: 4 }, { box: [-12, 10, 12, 12], style: 'stone', h: 4 },
      { box: [-12, -12, -10, 12], style: 'stone', h: 4 }, { box: [10, -12, 12, 12], style: 'stone', h: 4 },
    ],
    scatter: [
      { box: [-58, 44, -8, 58], count: 14, style: 'crystal' }, { box: [8, 44, 58, 58], count: 14, style: 'crystal' },
      { box: [-58, -58, -44, 40], count: 14, style: 'crystal' }, { box: [44, -58, 58, 40], count: 14, style: 'crystal' },
    ],
    teleports: [{ a: [-32, 34], b: [32, -34], color: '#4dffc3' }],
    switches: [{ at: [0, -32], kind: 'button' }, { at: [-18, 0], kind: 'button' }],
    gates: [{ box: [23, -3, 25, 3], needs: [0], style: 'stone' }, { box: [-3, -12, 3, -10], needs: [1], style: 'stone' }],
    house: { x: 0, z: 2, size: 8, door: 'north', tall: true },
    portal: [-6, -6.5],
    rollers: [
      { from: [-32, -26], to: [32, -26], speed: 9, kind: 'fireball' },
      { from: [18, -20], to: [18, 20], speed: 7, kind: 'boulder' },
      { from: [-20, 18], to: [-20, -18], speed: 7, kind: 'boulder' },
    ],
    wizards: [{ home: [-30, -10], radius: 6 }, { home: [0, 18], radius: 3, guard: true }],
    robots: [
      { at: [7, 52], line: 'The Wizard Tower! The last haunted house is in the very middle.' },
      { at: [-6, 36], line: 'The tower has three rings of walls. Each ring has one way in.' },
      { at: [-34, 28], line: 'A green magic pad zaps you across the ring.' },
      { at: [-20, -20], line: 'Press a button to open the next ring.' },
    ],
    checkpoints: [{ box: [-39, -39, 39, 39], at: [0, 34] }, { box: [-23, -23, 23, 23], at: [20, 0] }, { box: [-10, -10, 10, 10], at: [-6, -7] }],
    goals(s) {
      if (!inBox(s.x, s.z, [-39, -39, 39, 39])) return { text: 'Go in through the opening in the south wall of the big ring.', target: [0, 42] };
      if (!s.switchDone(0)) return { text: 'Press the button at the north side of the outer ring. Watch for the fireball!', target: [0, -32] };
      if (!inBox(s.x, s.z, [-23, -23, 23, 23])) return { text: 'The east gate of the middle ring is open. Go in!', target: [27, 0] };
      if (!s.switchDone(1)) return { text: 'Press the button on the west side of the middle ring.', target: [-18, 0] };
      if (!inBox(s.x, s.z, [-10, -10, 10, 10])) return { text: 'The inner ring is open on the north side. The tower door is inside!', target: [0, -14] };
      return null;
    },
  },
];

// ---------- Hints ----------

function compass(dx, dz) {
  const ns = dz < -0.4 * Math.abs(dx) ? 'north' : dz > 0.4 * Math.abs(dx) ? 'south' : '';
  const ew = dx > 0.4 * Math.abs(dz) ? 'east' : dx < -0.4 * Math.abs(dz) ? 'west' : '';
  return ns && ew ? ns + '-' + ew : ns || ew;
}

// s: { x, z, switchDone(i), switchCount, houseDone, doorSpot, portal }
export function worldHint(w, s, detailed) {
  let g;
  if (s.houseDone) g = { text: 'You beat the house! Drive into the glowing portal to go on.', target: w.portal };
  else g = w.goals(s) || { text: 'The haunted house door is right there! Drive into it.', target: s.doorSpot };
  let text = g.text;
  if (detailed && g.target) {
    const dx = g.target[0] - s.x, dz = g.target[1] - s.z, d = Math.round(Math.hypot(dx, dz));
    text += d < 6 ? ' You are super close!' : ' Go ' + (compass(dx, dz) || 'that way') + ', about ' + d + ' steps.';
  }
  return text;
}
