// story.js
// The story of the game, and the storybook pages that tell it.
//
// All the words live here so they are easy to change. In the text,
// {name} becomes the friend you picked. Each page has:
//   art   pictures shown above the words. A friend's id ('tyler') shows
//         their painted portrait, 'me' is the friend you picked, 'friends'
//         is all six, a model name ('dragon', 'robot', 'ghost',
//         'houses/house_gear') is drawn from its 3D model, and anything
//         else is shown as it is (an emoji).
//   text  the words.
//
// showStory(pages, name) shows pages one at a time and resolves when done.

import * as THREE from 'three';
import { makeModel } from './models.js';

// The villains have names.
export const VILLAINS = {
  dragon: { name: 'Scorch', icon: '🐲' },
  snowgun: { name: 'Chilly', icon: '☃️' },
  yoyo: { name: 'Wobbles', icon: '🪀' },
  wizard: { name: 'Wizzle', icon: '🧙' },
};

// ---------- The beginning ----------
export const INTRO = [
  { art: ['friends'], text: 'This is Gecko Land. It is warm and green and full of flowers. Six best friends live here: Tyler, Skyler, Nick, Pip, Mo and Zazz.' },
  { art: ['🧺', 'wizard'], text: 'One sunny day the friends had a picnic. A grumpy wizard named Wizzle watched from behind a tree. Nobody had asked him to come.' },
  { art: ['wizard', '🌪️'], text: 'Wizzle waved his wand. WHOOSH! A magic wind picked up {name} and blew them far, far away.' },
  { art: ['me', 'robot'], text: '{name} landed in Robot Land. The robots there are kind. "Beep boop! Welcome!" they said, and they gave {name} a little car.' },
  { art: ['wizard', 'dragon', 'snowgun', 'yoyo'], text: 'But Wizzle and his pals, the Grumble Gang, took the Gecko Land Map. Without it, nobody can find the way home!' },
  { art: ['houses/house_gear', 'ghost'], text: 'The Gang hid in six old houses on the road to Gecko Land. They filled them with cobwebs and spooky tricks, so now they are HAUNTED houses. A shy little ghost named Boo is stuck in there too.' },
  { art: ['robot', '📱'], text: 'The robots are too scared to go in. "Ghosts make our wires wobble!" But they will help. Drive up to a robot, or call one on your phone.' },
  { art: ['me', '🚗', '🏚️'], text: 'Find each haunted house. Solve the puzzle inside to beat the villain and win a prize for your car. Get the map back and drive home!', next: "Let's go!" },
];

// ---------- Each world, when you arrive ----------
// One page each. The vehicle line is added by the game.
export const WORLD_STORY = [
  { art: ['robot', 'dragon'], text: 'This is where the robots live. Scorch the dragon is hiding in the haunted house across the river. He took the robots\' Robot Key!' },
  { art: ['snowgun', '❄️'], text: 'Brrr! Up in Frosty Peaks, Chilly the snowman has made his haunted house icy and slippery. He is guarding a pair of Rocket Boots.' },
  { art: ['yoyo', '🌈'], text: 'Everything in Bouncy Hills goes BOING! Wobbles the giant yo-yo is spinning inside the haunted house with the Bouncy String.' },
  { art: ['wizard', '⭐'], text: 'Starry Woods is dark and full of magic. Wizzle himself is hiding here! His spare Wizard Hat is in the haunted house.' },
  { art: ['dragon', '🌋'], text: 'Lava Meadow is HOT! Scorch flew here after Gear City, and he is grumpier than ever. He is guarding a shiny Dragon Scale.' },
  { art: ['wizard', '🗺️'], text: 'This is it: the Wizard Tower! Wizzle is in the last haunted house with the Gecko Land Map. Win it back and the road home is open!' },
];

// ---------- At the haunted house door ----------
export function houseStory(villain, item) {
  const v = VILLAINS[villain] || { name: 'A villain', icon: '👻' };
  return [{
    art: ['ghost', villain],
    text: 'Creeeak... This is a haunted house! Boo the ghost peeks out. "Hee hee! ' + v.name + ' is inside with the ' + item.name + '. Solve the puzzle and you win it!"',
    next: 'Go in!',
  }];
}

// What the villain does when you win, and what Boo does next.
export function winLine(villain) {
  const v = VILLAINS[villain] || { name: 'The villain' };
  return v.name + ' runs away! ';
}
export const PORTAL_LINE = 'Boo is free! "Thank you!" Boo opens a magic portal to the next land. Drive into it! ✨';

// What the phone says you are doing.
export function goalText(world, houseDone) {
  const v = VILLAINS[world.villain] || { name: 'the villain' };
  return houseDone ? 'Drive into Boo\'s magic portal ✨' : 'Win the ' + world.item.name + ' from ' + v.name;
}

// ---------- The ending ----------
export const ENDING = [
  { art: ['me', '🗺️'], text: '{name} followed the map all the way home. Gecko Land! The friends ran out to hug {name}.' },
  { art: ['wizard'], text: 'Then Wizzle came walking up the path. He looked at his feet. "I am sorry. I was sad that nobody asked me to the picnic."' },
  { art: ['me', 'wizard'], text: '"Then come to the next one!" said {name}. Wizzle smiled for the first time in a hundred years.' },
  { art: ['dragon', 'snowgun', 'yoyo', 'ghost', 'robot'], text: 'So the whole Grumble Gang came to the picnic. Boo came too, and the robots drove all the way from Robot Land.', next: 'Hooray!' },
];

// ---------- Pictures from the 3D models ----------
// Drawn once with a small renderer of its own, then reused.
let snapRenderer = null;
const snaps = {};
function snapshot(name) {
  if (snaps[name]) return snaps[name];
  try {
    if (!snapRenderer) {
      snapRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      snapRenderer.setSize(256, 256);
      snapRenderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#6a6a80', 1.6));
    const sun = new THREE.DirectionalLight('#fff4e0', 2); sun.position.set(2, 4, 5); scene.add(sun);
    const m = makeModel(name);
    if (m.userData.animate) m.userData.animate(0.4, 'idle');
    m.rotation.y = 0.35;
    scene.add(m);
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    const dist = Math.max(size.y, size.x) / (2 * Math.tan(15 * Math.PI / 180)) * 1.15;
    cam.position.set(mid.x, mid.y + size.y * 0.08, mid.z + dist);
    cam.lookAt(mid);
    snapRenderer.render(scene, cam);
    snaps[name] = snapRenderer.domElement.toDataURL('image/png');
  } catch (e) { snaps[name] = null; }
  return snaps[name];
}

// ---------- The storybook ----------
const $ = (id) => document.getElementById(id);

function artFor(token, me) {
  const ids = CHARACTERS.map(c => c.id);
  if (token === 'friends') return [...ids].map(id => artFor(id, me)).flat();
  if (token === 'me') return artFor(me, me);
  if (ids.includes(token)) {
    const img = document.createElement('img');
    img.className = 'story-pic portrait-pic';
    img.alt = '';
    img.src = 'assets/portraits/' + token + '.webp' + (window.V ? '?v=' + window.V : '');
    return [img];
  }
  if (/^[a-z]/.test(token)) {
    const url = snapshot(token);
    if (url) { const img = document.createElement('img'); img.className = 'story-pic'; img.alt = ''; img.src = url; return [img]; }
    return [];
  }
  const span = document.createElement('span');
  span.className = 'story-emoji';
  span.textContent = token;
  return [span];
}

// Show the pages. Resolves when the last page is done (or Skip is pressed).
export function showStory(pages, charId, onSound) {
  const name = (CHARACTERS.find(c => c.id === charId) || CHARACTERS[0]).name;
  const box = $('story'), art = $('story-art'), text = $('story-text'), next = $('story-next'), skip = $('story-skip'), dots = $('story-dots');
  return new Promise(resolve => {
    let i = 0;
    const draw = () => {
      const p = pages[i];
      art.replaceChildren(...p.art.map(a => artFor(a, charId)).flat());
      art.classList.toggle('crowd', art.children.length > 3);
      text.textContent = p.text.replaceAll('{name}', name);
      next.textContent = p.next || (i === pages.length - 1 ? 'OK! ▶' : 'Next ▶');
      skip.classList.toggle('hidden', pages.length < 3 || i === pages.length - 1);
      dots.textContent = pages.length > 1 ? pages.map((_, k) => k === i ? '●' : '○').join(' ') : '';
      box.querySelector('.story-card').classList.remove('turn'); void box.offsetWidth; box.querySelector('.story-card').classList.add('turn');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    };
    const done = () => {
      box.classList.add('hidden');
      window.removeEventListener('keydown', onKeyDown, true);
      next.onclick = skip.onclick = null;
      resolve();
    };
    const forward = () => { if (onSound) onSound(); if (++i >= pages.length) done(); else draw(); };
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); forward(); }
      else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); e.stopImmediatePropagation(); i--; draw(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(); }
      else e.stopImmediatePropagation();
    };
    next.onclick = forward;
    skip.onclick = done;
    window.addEventListener('keydown', onKeyDown, true);
    box.classList.remove('hidden');
    draw();
  });
}
