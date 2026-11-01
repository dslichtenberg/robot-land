// worlds.js
// The layout of each world, written as plain numbers so it is easy to edit,
// plus what the robots say there.
//
// Positions are [x, z] on the ground. x goes east (right on screen),
// z goes south (down on screen), so north is negative z.
// Boxes are [x1, z1, x2, z2] corners.
//
// Only World 1 is built so far. The others are listed so the game knows
// what comes next.

export const WORLDS = [
  {
    id: 'gear-city',
    name: 'Gear City',
    half: 60,                      // the world goes from -60 to 60 each way
    ground: '#8d9aac', fog: '#c3cddb',
    villain: 'dragon',
    item: { name: 'Robot Key', icon: '🔑', kind: 'key' },
    start: [-45, 48],

    // Streets (just for looks: you can drive anywhere that is not blocked).
    streets: [
      [-58, 44, 58, 52], [-58, 24, 58, 32], [-58, 5, 58, 11],
      [-34, 5, -26, 58], [-4, 5, 4, 58], [26, 5, 34, 58],
      [-33, -56, -27, -5], [-56, -43, 22, -37], [-54, -55, -46, -43],
    ],
    // City blocks get one building each, with this many tiles of gap around it.
    blocksX: [[-58, -34], [-26, -4], [4, 26], [34, 58]],
    blocksZ: [[11, 24], [32, 44], [52, 58]],

    river: { z1: -4, z2: 3 },
    drawbridge: { x: -30, width: 6, cycle: 8 },   // goes up and down every 8 seconds
    brokenBridge: { x: 30, width: 6 },

    conveyors: [{ box: [-44, -32, 16, -12], push: [7, 0] }],   // pushes east
    walls: [
      [-60, -33, -44, -11],      // crates west of the belts
      [16, -33, 24, -11],        // fence east of the belts
    ],
    tower: [-14, -48],           // the big gear tower you can see from far away
    button: [-50, -51],          // the red button that opens the yard gate

    yard: { box: [24, -56, 56, -24], gateZ: -40, gateWidth: 6 },
    house: { x: 46, z: -40, size: 8 },       // door faces west, toward the gate
    portal: [33, -50],
    dragonLoop: { x: 46, z: -40, r: 9.5, speed: 3.6 },

    rollers: [{ z: 28, x1: -55, x2: 55, speed: 8 }],   // a giant gear rolling down a street

    robots: [
      { at: [-40, 45], line: 'Hi! I am Bolt.' },
      { at: [30, 7.5], line: 'Oh no! This bridge is broken. There is another bridge on the west side of town.' },
      { at: [-24, -7], line: 'Whoa, those moving belts push you to the east! Steer against them.' },
      { at: [18, -45], line: 'This yard has a locked gate. I heard a big red button opens it.' },
    ],
    checkpoints: [
      { box: [-58, -58, 58, -5], at: [-30, -8] },     // across the river
      { box: [25, -55, 55, -25], at: [29, -40] },     // inside the yard
    ],
  },
  { id: 'snow', name: 'Frosty Peaks', villain: 'snowgun', item: { name: 'Snow Boots', icon: '🥾' } },
  { id: 'yoyo', name: 'Bouncy Hills', villain: 'yoyo', item: { name: 'Yo-yo String', icon: '🧵' } },
  { id: 'wizard', name: 'Starry Woods', villain: 'wizard', item: { name: 'Wizard Hat', icon: '🎩' } },
  { id: 'lava', name: 'Lava Meadow', villain: 'dragon', item: { name: 'Dragon Scale', icon: '🐲' } },
  { id: 'tower', name: 'Wizard Tower', villain: 'wizard', item: { name: 'Gecko Land Map', icon: '🗺️' } },
];

// ---------- What the robots say ----------

function compass(dx, dz) {
  const ns = dz < -0.4 * Math.abs(dx) ? 'north' : dz > 0.4 * Math.abs(dx) ? 'south' : '';
  const ew = dx > 0.4 * Math.abs(dz) ? 'east' : dx < -0.4 * Math.abs(dz) ? 'west' : '';
  return ns && ew ? ns + '-' + ew : ns || ew;
}

// s: { x, z, gateOpen, houseDone } and detailed (Skyler's perk).
export function gearCityHint(w, s, detailed) {
  const north = s.z < w.river.z1;
  const inYard = s.x > 24 && s.z < -24;
  let text, target;
  if (s.houseDone) {
    text = 'You beat the dragon! Drive into the glowing portal in the yard to go to the next world!';
    target = w.portal;
  } else if (!north) {
    text = 'The haunted house is across the river, far to the north. Find the bridge that goes up and down. Wait for it to come down, then zoom across!';
    target = [w.drawbridge.x, 8];
  } else if (!s.gateOpen) {
    const onBelts = s.x > -44 && s.x < 16 && s.z > -32 && s.z < -12;
    text = (onBelts ? 'Steer against the belts! ' : '') +
      'The haunted house yard has a locked gate. Find the big red button in the far north-west corner, near the gear tower.';
    target = w.button;
  } else if (!inYard) {
    text = 'Clank! The gate is open. Go east into the yard to find the haunted house.';
    target = [22, w.yard.gateZ];
  } else {
    text = 'The haunted house door is right there! Sneak past the dragon when it flies away.';
    target = [w.house.x - w.house.size / 2 - 1.5, w.house.z];
  }
  if (detailed && target) {
    const dx = target[0] - s.x, dz = target[1] - s.z, d = Math.round(Math.hypot(dx, dz));
    const way = compass(dx, dz);
    text += d < 6 ? ' You are super close!' : ' Go ' + (way || 'that way') + ', about ' + d + ' steps.';
  }
  return text;
}
