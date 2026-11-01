// roster.js
// The six friends you can play as: names, colors, perks, and flat 2D
// portraits drawn with simple shapes (used on the character cards).
// The 3D models live in models.js.
//
// Each draw function takes the canvas context, a center point (x, y),
// a size in pixels, and the time t in seconds (for wiggles and blinks).

// Starting numbers that every character shares. Perks change one of these.
const BASE_STATS = {
  hearts: 3,          // hearts at the start and after a respawn
  carSpeed: 11,       // top speed of the car
  hopTime: 0.26,      // seconds per hop inside haunted houses
  safeTime: 2,        // seconds of safety (blinking) after a bump
  villainSpeed: 1,    // how fast villains move
  detailedHints: false,
};

const CHARACTERS = [
  { id: 'tyler', name: 'Tyler', species: 'Gecko', look: 'gecko',
    color: '#3fca4c', accent: '#ff8a1f', pattern: 'spots',
    persona: 'The brave leader. Shouts "Let\'s go!"',
    perkText: 'Car drives a little faster', perk: { carSpeed: 14 } },
  { id: 'skyler', name: 'Skyler', species: 'Gecko', look: 'gecko',
    color: '#5ab8f5', accent: '#ffffff', pattern: 'belly',
    persona: 'The clever one. Always has a plan.',
    perkText: 'Robot hints have extra detail', perk: { detailedHints: true } },
  { id: 'nick', name: 'Nick', species: 'Gecko', look: 'gecko',
    color: '#9a5ce0', accent: '#ffe14d', pattern: 'stripes',
    persona: 'The goofball. Laughs at everything.',
    perkText: 'Starts with one extra heart', perk: { hearts: 4 } },
  { id: 'pip', name: 'Pip', species: 'Frog', look: 'frog',
    color: '#9be22d', accent: '#ffffff', pattern: 'none',
    persona: 'Tiny and jumpy. Never sits still.',
    perkText: 'Hops extra fast in haunted houses', perk: { hopTime: 0.18 } },
  { id: 'mo', name: 'Mo', species: 'Turtle', look: 'turtle',
    color: '#9ccc65', accent: '#8b5a2b', pattern: 'shell',
    persona: 'Slow talker. Calm as a pond.',
    perkText: 'Stays safe longer after a bump', perk: { safeTime: 4 } },
  { id: 'zazz', name: 'Zazz', species: 'Chameleon', look: 'chameleon',
    color: '#ff5fa2', accent: '#ffd23f', pattern: 'rainbow',
    persona: 'Changes color when excited. Wheee!',
    perkText: 'Villains move a little slower', perk: { villainSpeed: 0.75 } },
];

function getCharacter(id) { return CHARACTERS.find(c => c.id === id) || CHARACTERS[0]; }
function statsFor(id) { return Object.assign({}, BASE_STATS, getCharacter(id).perk); }

// ---------- Small helpers ----------

function circle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function oval(ctx, x, y, rx, ry, color, rot) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); ctx.fill();
}
function roundRect(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}
function eyes(ctx, lx, rx, y, r, t, sleepy) {
  const blink = (t % 4) > 3.85;
  for (const ex of [lx, rx]) {
    circle(ctx, ex, y, r, '#fff');
    if (blink) { ctx.fillStyle = '#222'; ctx.fillRect(ex - r, y - 0.8, r * 2, 1.6); continue; }
    circle(ctx, ex + r * 0.15, y + r * 0.1, r * 0.55, '#222');
    circle(ctx, ex + r * 0.35, y - r * 0.25, r * 0.2, '#fff');
    if (sleepy) { ctx.fillStyle = ctx.__lid || '#9ccc65'; ctx.fillRect(ex - r, y - r, r * 2, r * 0.9); }
  }
}
function smile(ctx, x, y, w, color) {
  ctx.strokeStyle = color || '#222'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, w, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
}
// Rainbow color that shifts with time, for Zazz.
function rainbow(t, offset) { return 'hsl(' + Math.floor((t * 90 + offset) % 360) + ',85%,60%)'; }

// ---------- The six friends ----------

// Draws a friend standing up, facing you. size 32 is the normal size.
// mood can be 'happy' (bounces) or 'excited' (Zazz flashes colors).
function drawCharacter(ctx, ch, x, y, size, t, mood) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 32, size / 32);
  if (mood === 'happy' || mood === 'excited') ctx.translate(0, -Math.abs(Math.sin(t * 8)) * 4);
  const fn = { gecko: drawGecko, frog: drawFrog, turtle: drawTurtle, chameleon: drawChameleon }[ch.look];
  fn(ctx, ch, t, mood);
  ctx.restore();
}

function drawGecko(ctx, ch, t) {
  // Tail
  ctx.strokeStyle = ch.color; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(4, 12); ctx.quadraticCurveTo(16 + Math.sin(t * 3) * 2, 14, 14, 4); ctx.stroke();
  // Legs
  oval(ctx, -8, 14, 4, 3, ch.color); oval(ctx, 8, 14, 4, 3, ch.color);
  // Body
  oval(ctx, 0, 6, 9, 10, ch.color);
  if (ch.pattern === 'belly') oval(ctx, 0, 8, 5.5, 7, ch.accent);
  if (ch.pattern === 'spots') { circle(ctx, -4, 3, 2, ch.accent); circle(ctx, 4, 8, 2, ch.accent); circle(ctx, -2, 11, 1.6, ch.accent); }
  if (ch.pattern === 'stripes') { ctx.fillStyle = ch.accent; for (const sy of [1, 6, 11]) ctx.fillRect(-7, sy, 14, 2); }
  // Arms
  oval(ctx, -10, 4, 3, 2.5, ch.color); oval(ctx, 10, 4, 3, 2.5, ch.color);
  // Head
  oval(ctx, 0, -8, 11, 9, ch.color);
  if (ch.pattern === 'spots') circle(ctx, 6, -13, 1.8, ch.accent);
  if (ch.pattern === 'stripes') { ctx.fillStyle = ch.accent; ctx.fillRect(-2, -17, 4, 3); }
  eyes(ctx, -5, 5, -10, 4, t);
  smile(ctx, 0, -6, 4.5);
}

function drawFrog(ctx, ch, t) {
  ctx.scale(0.9, 0.9);
  // Back legs
  oval(ctx, -11, 13, 6, 3.5, ch.color); oval(ctx, 11, 13, 6, 3.5, ch.color);
  // Body
  oval(ctx, 0, 5, 12, 10, ch.color);
  oval(ctx, 0, 8, 7, 6, '#e8ffc2');
  // Head and eye bumps
  oval(ctx, 0, -6, 13, 8, ch.color);
  circle(ctx, -7, -13, 6, ch.color); circle(ctx, 7, -13, 6, ch.color);
  eyes(ctx, -7, 7, -13, 4, t);
  // Wide grin and rosy cheeks
  ctx.strokeStyle = '#2f5a10'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, -6, 7, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
  circle(ctx, -10, -4, 2, 'rgba(255,120,150,0.6)'); circle(ctx, 10, -4, 2, 'rgba(255,120,150,0.6)');
}

function drawTurtle(ctx, ch, t) {
  // Feet
  oval(ctx, -11, 13, 4, 3, ch.color); oval(ctx, 11, 13, 4, 3, ch.color);
  oval(ctx, -13, 2, 4, 3, ch.color); oval(ctx, 13, 2, 4, 3, ch.color);
  // Shell
  ctx.fillStyle = ch.accent;
  ctx.beginPath(); ctx.ellipse(0, 6, 13, 10, 0, Math.PI, 0); ctx.lineTo(13, 12); ctx.lineTo(-13, 12); ctx.fill();
  ctx.strokeStyle = '#5e3a17'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(9, 6); ctx.lineTo(6, 11); ctx.lineTo(-6, 11); ctx.lineTo(-9, 6); ctx.closePath();
  ctx.moveTo(-6, 0); ctx.lineTo(-9, -3); ctx.moveTo(6, 0); ctx.lineTo(9, -3);
  ctx.stroke();
  oval(ctx, 0, 13, 13, 2.5, '#c49a5c');
  // Head on top, calm sleepy eyes
  oval(ctx, 0, -9, 9, 8, ch.color);
  ctx.__lid = ch.color;
  eyes(ctx, -4, 4, -10, 3.2, t, true);
  smile(ctx, 0, -6, 3.5);
}

function drawChameleon(ctx, ch, t, mood) {
  const fast = mood === 'excited' ? 4 : 1;
  const c1 = rainbow(t * fast, 0), c2 = rainbow(t * fast, 120), c3 = rainbow(t * fast, 240);
  // Curly tail
  ctx.strokeStyle = c3; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(6, 12); ctx.quadraticCurveTo(18, 12, 16, 4); ctx.arc(13, 4, 3, 0, Math.PI * 1.6); ctx.stroke();
  oval(ctx, -7, 14, 3.5, 2.5, c2); oval(ctx, 7, 14, 3.5, 2.5, c2);
  // Body with rainbow bands
  const grad = ctx.createLinearGradient(-10, -4, 10, 16);
  grad.addColorStop(0, c1); grad.addColorStop(0.5, c2); grad.addColorStop(1, c3);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.ellipse(0, 5, 9, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Head with a little crest
  ctx.fillStyle = c1;
  ctx.beginPath(); ctx.moveTo(-6, -15); ctx.lineTo(0, -21); ctx.lineTo(6, -15); ctx.fill();
  oval(ctx, 0, -8, 10, 8.5, c1);
  // Cone eyes that look around
  const look = Math.sin(t * 1.5) * 1.5;
  for (const ex of [-6, 6]) {
    circle(ctx, ex, -10, 4.5, c2);
    circle(ctx, ex + look, -10, 2.6, '#fff');
    circle(ctx, ex + look * 1.3, -10, 1.4, '#222');
  }
  smile(ctx, 0, -5, 4);
}

// ---------- The car (seen from above) ----------

// dir is 'up', 'down', 'left' or 'right'. The driver's face stays upright.
function drawCar(ctx, ch, x, y, dir, t, moving) {
  const angle = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir] || 0;
  ctx.save();
  ctx.translate(x, y + (moving ? Math.sin(t * 30) * 0.8 : 0));
  ctx.save();
  ctx.rotate(angle);
  // Wheels
  ctx.fillStyle = '#222';
  for (const [wx, wy] of [[-17, -12], [11, -12], [-17, 6], [11, 6]]) ctx.fillRect(wx, wy, 6, 10);
  // Body and outline
  roundRect(ctx, -16, -20, 32, 40, 9, '#2b2b38');
  roundRect(ctx, -14, -18, 28, 36, 8, ch.look === 'chameleon' ? rainbow(t, 0) : ch.color);
  // Headlights at the front
  circle(ctx, -8, -16, 3, '#fff7b0'); circle(ctx, 8, -16, 3, '#fff7b0');
  ctx.restore();
  // Bubble window with the driver inside
  circle(ctx, 0, 0, 12, '#bfe9ff');
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.clip();
  drawCharacter(ctx, ch, 0, 6, 22, t);
  ctx.restore();
  ctx.restore();
}

// ---------- Robots ----------

function drawRobot(ctx, x, y, t, size) {
  ctx.save();
  ctx.translate(x, y);
  const s = (size || 40) / 40;
  ctx.scale(s, s);
  // Antenna with blinking light
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -22); ctx.stroke();
  circle(ctx, 0, -23, 3.5, Math.floor(t * 2) % 2 ? '#ff4d4d' : '#4dff7a');
  // Head
  roundRect(ctx, -12, -15, 24, 15, 4, '#aab4c3');
  circle(ctx, -5, -8, 3, '#2a7bff'); circle(ctx, 5, -8, 3, '#2a7bff');
  ctx.fillStyle = '#555'; ctx.fillRect(-4, -4, 8, 1.5);
  // Body and arms
  roundRect(ctx, -13, 1, 26, 17, 4, '#8b96a8');
  roundRect(ctx, -5, 5, 10, 7, 2, '#ffd23f');
  ctx.fillStyle = '#8b96a8';
  const wave = Math.sin(t * 4) * 3;
  ctx.fillRect(-18, 3 + wave, 5, 10); ctx.fillRect(13, 3 - wave, 5, 10);
  ctx.restore();
}

// ---------- Villains ----------
// opts.hurt: 0 to 1 flash when hit by a right answer.
// opts.scales: how many scales the dragon has left (house puzzles).
// opts.aim: which way the snowgun points.

function drawVillain(ctx, kind, x, y, size, t, opts) {
  opts = opts || {};
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 40, size / 40);
  if (opts.hurt > 0) ctx.translate(Math.sin(t * 60) * 3 * opts.hurt, 0);
  ({ dragon: drawDragon, snowgun: drawSnowgun, yoyo: drawYoyo, wizard: drawWizard })[kind](ctx, t, opts);
  if (opts.hurt > 0) {
    ctx.globalAlpha = opts.hurt * 0.5;
    circle(ctx, 0, 0, 22, '#fff');
  }
  ctx.restore();
}

function drawDragon(ctx, t, opts) {
  const flap = Math.sin(t * 8) * 0.4;
  // Wings
  for (const side of [-1, 1]) {
    ctx.save(); ctx.scale(side, 1); ctx.rotate(flap);
    ctx.fillStyle = '#ff9b8a';
    ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(22, -14); ctx.lineTo(20, 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // Tail and body
  ctx.strokeStyle = '#e03c31'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(6, 12); ctx.quadraticCurveTo(18, 18, 20, 8); ctx.stroke();
  oval(ctx, 0, 6, 11, 12, '#e03c31');
  // Belly scales: one comes off for each right answer.
  const n = opts.scales === undefined ? 5 : opts.scales;
  for (let i = 0; i < n; i++) circle(ctx, -6 + (i % 3) * 6, 2 + Math.floor(i / 3) * 6, 2.8, '#ffc93c');
  // Head with horns
  ctx.fillStyle = '#fff1c1';
  ctx.beginPath(); ctx.moveTo(-8, -16); ctx.lineTo(-5, -24); ctx.lineTo(-2, -16); ctx.fill();
  ctx.beginPath(); ctx.moveTo(8, -16); ctx.lineTo(5, -24); ctx.lineTo(2, -16); ctx.fill();
  oval(ctx, 0, -10, 11, 9, '#e03c31');
  eyes(ctx, -4, 4, -12, 3.2, t);
  circle(ctx, -3, -5, 1, '#7a1b14'); circle(ctx, 3, -5, 1, '#7a1b14');
  // Smoke rings puffing up from the nose
  for (let i = 0; i < 2; i++) {
    const p = ((t * 0.8) + i * 0.5) % 1;
    ctx.strokeStyle = 'rgba(200,200,200,' + (1 - p) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(10 + p * 8, -12 - p * 22, 3 + p * 5, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawSnowgun(ctx, t, opts) {
  oval(ctx, 0, 10, 13, 11, '#ffffff');
  oval(ctx, 0, -9, 10, 9, '#ffffff');
  ctx.strokeStyle = '#c9dcef'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 10, 13, 11, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -9, 10, 9, 0, 0, Math.PI * 2); ctx.stroke();
  // Coal eyes, carrot nose, buttons, hat
  circle(ctx, -4, -11, 1.8, '#222'); circle(ctx, 4, -11, 1.8, '#222');
  ctx.fillStyle = '#ff8a1f';
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(9, -6); ctx.lineTo(0, -5); ctx.fill();
  circle(ctx, 0, 5, 1.6, '#222'); circle(ctx, 0, 11, 1.6, '#222');
  ctx.fillStyle = '#333'; ctx.fillRect(-9, -19, 18, 3); ctx.fillRect(-6, -28, 12, 10);
  ctx.fillStyle = '#e05555'; ctx.fillRect(-6, -21, 12, 2);
  // Snowball cannon
  const a = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[opts.aim || 'left'];
  ctx.save(); ctx.translate(0, 6); ctx.rotate(a);
  roundRect(ctx, 0, -5, 20, 10, 3, '#5d6475');
  circle(ctx, 20, 0, 5, '#3c4250');
  ctx.restore();
}

function drawYoyo(ctx, t) {
  ctx.save();
  ctx.rotate(Math.sin(t * 6) * 0.3);
  circle(ctx, 0, 0, 18, '#ff5fa2');
  circle(ctx, 0, 0, 12, '#ff92c2');
  ctx.strokeStyle = '#c2185b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  eyes(ctx, -5, 5, -3, 3.5, t);
  smile(ctx, 0, 2, 5);
}

function drawWizard(ctx, t) {
  // Robe
  ctx.fillStyle = '#7b3fc4';
  ctx.beginPath(); ctx.moveTo(-14, 20); ctx.lineTo(0, -6); ctx.lineTo(14, 20); ctx.fill();
  // Face and fluffy beard
  circle(ctx, 0, -6, 8, '#ffd7b0');
  oval(ctx, 0, 2, 7, 6, '#ffffff');
  circle(ctx, -3, -8, 1.4, '#222'); circle(ctx, 3, -8, 1.4, '#222');
  // Tall hat with stars
  ctx.fillStyle = '#5a2a9a';
  ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(2, -34); ctx.lineTo(11, -11); ctx.fill();
  ctx.fillStyle = '#ffe14d'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('★', -2, -16); ctx.fillText('★', 3, -24);
  // Star wand
  const w = Math.sin(t * 4) * 0.4;
  ctx.save(); ctx.translate(12, 4); ctx.rotate(w);
  ctx.fillStyle = '#7a5230'; ctx.fillRect(0, -14, 2.5, 16);
  ctx.fillStyle = '#ffe14d'; ctx.font = '12px sans-serif'; ctx.fillText('★', 1, -14);
  ctx.restore();
}

// The friendly cartoon ghost that floats in each haunted house.
function drawGhost(ctx, x, y, size, t) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2) * 6);
  ctx.scale(size / 40, size / 40);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(0, -4, 16, Math.PI, 0);
  ctx.lineTo(16, 16);
  for (let i = 0; i < 4; i++) ctx.quadraticCurveTo(12 - i * 8, 10 + (i % 2) * 8, 8 - i * 8, 16);
  ctx.closePath(); ctx.fill();
  circle(ctx, -6, -6, 2.6, '#333'); circle(ctx, 6, -6, 2.6, '#333');
  oval(ctx, 0, 2, 3, 3.5, '#333');
  circle(ctx, -10, 0, 2.5, 'rgba(255,140,170,0.6)'); circle(ctx, 10, 0, 2.5, 'rgba(255,140,170,0.6)');
  ctx.restore();
}

// ---------- Whole scenes ----------

// The happy ending in Gecko Land: everyone cheers and confetti falls.
function drawEndingScene(ctx, e, player, t) {
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#7fd3ff'); sky.addColorStop(1, '#d9f6ff');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  circle(ctx, 660, 90, 46, '#ffd23f');
  oval(ctx, 180, 520, 380, 200, '#5fd257'); oval(ctx, 620, 540, 380, 220, '#4cc548');
  for (let i = 0; i < 40; i++) {
    const fx = (i * 97) % VIEW_W, fy = 400 + (i * 53) % 170;
    circle(ctx, fx, fy, 5, ['#ff6fa8', '#ffd23f', '#ffffff', '#b583ff'][i % 4]);
  }
  ctx.save(); ctx.translate(90, 450); ctx.scale(1.8, 1.8);
  drawCar(ctx, player, 0, 0, 'right', t, false);
  ctx.restore();
  const friends = [player].concat(CHARACTERS.filter(c => c.id !== player.id));
  friends.forEach((ch, i) => {
    const appear = i === 0 ? 0.3 : 1 + i * 0.25;
    if (e.t < appear) return;
    let x = 160 + i * 95;
    if (i === 0) x = 90 + Math.min(1, (e.t - 0.3) / 0.8) * 70;
    drawCharacter(ctx, ch, x, 360, 70, t + i * 0.3, ch.look === 'chameleon' ? 'excited' : 'happy');
  });
  e.confetti.forEach(p => {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.color; ctx.fillRect(-5, -3, 10, 6);
    ctx.restore();
  });
}

// Moving picture behind the title and character screens.
function drawTitleScene(ctx, t) {
  const sky = ctx.createLinearGradient(0, 0, VIEW_W, 0);
  sky.addColorStop(0, '#5d6c88'); sky.addColorStop(1, '#5fd257');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#5d6475'; ctx.fillRect(0, 470, VIEW_W, 60);
  ctx.fillStyle = '#ffe066';
  for (let x = ((-t * 120) % 60); x < VIEW_W; x += 60) ctx.fillRect(x, 497, 30, 5);
  drawRobot(ctx, 70, 440, t, 60);
  drawGhost(ctx, 380, 420, 50, t);
  ctx.font = '60px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🌸', 700, 450);
  const ch = CHARACTERS[Math.floor(t / 3) % CHARACTERS.length];
  drawCar(ctx, ch, ((t * 140) % (VIEW_W + 120)) - 60, 500, 'right', t, true);
}
