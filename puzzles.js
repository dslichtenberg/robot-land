// puzzles.js
// The six haunted house puzzles, and the drawing of the room they happen in.
//
// Each puzzle has a generate() function that makes a fresh puzzle, so
// replays are different. startPuzzle() shows a puzzle inside a box on the
// page and tells the game when the player gets an answer right or wrong
// and when the whole puzzle is solved.
//
// Kinds of puzzles:
//   choice  rounds of "pick the right button" (math, pattern, spelling)
//   memory  flip cards to find matching pairs
//   riddle  answer riddles to reveal digits, then type the 3 digit code

function rand(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pick(list, n) { return shuffle(list).slice(0, n); }

// Wrong answers that are close to the right one, so the buttons look fair.
function numberChoices(answer, count) {
  const set = new Set([answer]);
  const offsets = shuffle([1, -1, 2, -2, 3, -3, 4, -4]);
  for (const o of offsets) {
    if (set.size >= count) break;
    const v = answer + o;
    if (v >= 0 && v <= 20) set.add(v);
  }
  const choices = shuffle([...set]);
  return { choices: choices.map(String), answer: choices.indexOf(answer) };
}

function addProblem() {
  const a = rand(1, 12), b = rand(1, 20 - a);
  return { prompt: a + ' + ' + b + ' = ?', value: a + b };
}
function subtractProblem() {
  const a = rand(6, 20), b = rand(1, a - 1);
  return { prompt: a + ' - ' + b + ' = ?', value: a - b };
}
function uniqueProblems(makers) {
  const seen = new Set(), out = [];
  for (const make of makers) {
    let p;
    do { p = make(); } while (seen.has(p.prompt));
    seen.add(p.prompt); out.push(p);
  }
  return out;
}

// ---------- Puzzle generators ----------

function makeMath() {
  const probs = uniqueProblems([addProblem, addProblem, addProblem, addProblem, addProblem]);
  return { kind: 'choice', title: 'Math facts!', rounds: probs.map(p => Object.assign({ prompt: p.prompt }, numberChoices(p.value, 3))) };
}

function makeHardMath() {
  const makers = shuffle([addProblem, addProblem, subtractProblem, subtractProblem, Math.random() < 0.5 ? addProblem : subtractProblem]);
  const probs = uniqueProblems(makers);
  const d = rand(3, 10);
  probs.push({ prompt: 'Double it! ' + d + ' + ' + d + ' = ?', value: d * 2 });
  return { kind: 'choice', title: 'Tricky math!', rounds: probs.map(p => Object.assign({ prompt: p.prompt }, numberChoices(p.value, 4))) };
}

const PATTERN_SETS = [
  ['🔴', '🔵', '🟢', '🟡', '🟣'],
  ['⭐', '❤️', '🔺', '🟦', '🌙'],
  ['🍎', '🍌', '🍇', '🍓', '🥕'],
];
const PATTERN_UNITS = ['AB', 'ABC', 'AAB', 'ABB'];

function makePattern() {
  const units = pick(PATTERN_UNITS, 3);
  const rounds = units.map(unit => {
    const set = PATTERN_SETS[rand(0, PATTERN_SETS.length - 1)];
    const symbols = pick(set, 3);
    const seq = [];
    for (let i = 0; i < 5; i++) seq.push(symbols['ABC'.indexOf(unit[i % unit.length])]);
    const answer = seq[4];
    const others = set.filter(s => s !== answer);
    const used = shuffle(others.filter(s => seq.includes(s))).concat(shuffle(others.filter(s => !seq.includes(s))));
    const choices = shuffle([answer, used[0], used[1]]);
    return { pattern: seq.slice(0, 4), prompt: 'What comes next?', choices, answer: choices.indexOf(answer) };
  });
  return { kind: 'choice', title: 'Finish the pattern!', rounds };
}

function makeMemory() {
  const friends = pick(CHARACTERS, 3).map(c => c.id);
  return { kind: 'memory', title: 'Find the matching friends!', cards: shuffle(friends.concat(friends)) };
}

const SPELL_WORDS = ['cat', 'frog', 'star', 'moon', 'car', 'key', 'hat', 'sun'];
function makeSpelling() {
  const rounds = pick(SPELL_WORDS, 4).map(word => {
    const miss = rand(0, word.length - 1), letter = word[miss];
    const pool = 'abcdefghilmnoprstuy'.split('').filter(l => l !== letter);
    const choices = shuffle([letter].concat(pick(pool, 2))).map(l => l.toUpperCase());
    const shown = word.toUpperCase().split('').map((l, i) => i === miss ? '_' : l).join(' ');
    return { picture: word, prompt: shown, choices, answer: choices.indexOf(letter.toUpperCase()) };
  });
  return { kind: 'choice', title: 'Fill in the missing letter!', rounds };
}

const RIDDLES = [
  ['I am yellow and hot and up in the sky. What am I?', '☀️ Sun', '🌙 Moon', '🐟 Fish'],
  ['I have four legs and I say moo. Who am I?', '🐮 Cow', '🦆 Duck', '🚗 Car'],
  ['You wear me on your feet. What am I?', '👟 Shoes', '🎩 Hat', '🧤 Gloves'],
  ['I am cold and white and fall in winter. What am I?', '❄️ Snow', '🏖️ Sand', '🔥 Fire'],
  ['I keep you dry when it rains. What am I?', '☂️ Umbrella', '🥄 Spoon', '⚽ Ball'],
  ['I have a long neck and lots of spots. Who am I?', '🦒 Giraffe', '🐷 Pig', '🐸 Frog'],
  ['Bees make me and I am sweet. What am I?', '🍯 Honey', '🥣 Soup', '🧀 Cheese'],
  ['I am round and you kick me. What am I?', '⚽ Ball', '📖 Book', '🛏️ Bed'],
];
function makeRiddles() {
  const rounds = pick(RIDDLES, 3).map(r => {
    const choices = shuffle(r.slice(1));
    return { prompt: r[0], choices, answer: choices.indexOf(r[1]), small: true };
  });
  return { kind: 'riddle', title: 'Riddles! Each one gives a secret number.', rounds, code: [rand(1, 9), rand(1, 9), rand(1, 9)] };
}

// One puzzle for each house, matched to that house's villain.
const PUZZLES = {
  1: { name: 'Math facts', generate: makeMath },
  2: { name: 'Patterns', generate: makePattern },
  3: { name: 'Memory', generate: makeMemory },
  4: { name: 'Spelling', generate: makeSpelling },
  5: { name: 'Harder math', generate: makeHardMath },
  6: { name: 'Riddles and lock', generate: makeRiddles },
};

// ---------- Pictures for the spelling words ----------

function drawPicture(ctx, word, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(w / 100, h / 100);
  const fill = (c) => { ctx.fillStyle = c; ctx.fill(); };
  ctx.beginPath();
  if (word === 'sun') {
    ctx.strokeStyle = '#ffb300'; ctx.lineWidth = 5;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); }
    ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); fill('#ffd23f');
  } else if (word === 'moon') {
    ctx.arc(0, 0, 34, 0, Math.PI * 2); fill('#ffe680');
    ctx.beginPath(); ctx.arc(16, -10, 30, 0, Math.PI * 2); fill('#2b2140');
  } else if (word === 'star') {
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 18 : 42, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    fill('#ffd23f');
  } else if (word === 'hat') {
    ctx.rect(-40, 18, 80, 10); fill('#333');
    ctx.beginPath(); ctx.rect(-24, -30, 48, 50); fill('#333');
    ctx.beginPath(); ctx.rect(-24, 8, 48, 8); fill('#e05555');
  } else if (word === 'key') {
    ctx.arc(-22, 0, 18, 0, Math.PI * 2); fill('#ffc93c');
    ctx.beginPath(); ctx.arc(-22, 0, 7, 0, Math.PI * 2); fill('#fff');
    ctx.beginPath(); ctx.rect(-6, -5, 46, 10); ctx.rect(26, 5, 7, 12); ctx.rect(14, 5, 7, 9); fill('#ffc93c');
  } else if (word === 'car') {
    ctx.rect(-42, -4, 84, 24); fill('#e05555');
    ctx.beginPath(); ctx.moveTo(-24, -4); ctx.lineTo(-14, -24); ctx.lineTo(16, -24); ctx.lineTo(26, -4); fill('#e05555');
    ctx.beginPath(); ctx.rect(-12, -19, 24, 13); fill('#bfe9ff');
    for (const x of [-24, 24]) { ctx.beginPath(); ctx.arc(x, 22, 11, 0, Math.PI * 2); fill('#222'); }
  } else if (word === 'cat') {
    ctx.moveTo(-30, -14); ctx.lineTo(-26, -42); ctx.lineTo(-8, -26); ctx.moveTo(30, -14); ctx.lineTo(26, -42); ctx.lineTo(8, -26); fill('#ff9f43');
    ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI * 2); fill('#ff9f43');
    ctx.beginPath(); ctx.arc(-12, -6, 5, 0, Math.PI * 2); ctx.arc(12, -6, 5, 0, Math.PI * 2); fill('#222');
    ctx.beginPath(); ctx.moveTo(-5, 6); ctx.lineTo(5, 6); ctx.lineTo(0, 12); fill('#ff6fa8');
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath();
    for (const s of [-1, 1]) { ctx.moveTo(s * 10, 12); ctx.lineTo(s * 40, 8); ctx.moveTo(s * 10, 15); ctx.lineTo(s * 40, 18); }
    ctx.stroke();
  } else if (word === 'frog') {
    ctx.restore(); ctx.save();
    drawCharacter(ctx, getCharacter('pip'), w / 2, h / 2, Math.min(w, h) * 0.8, 1);
  }
  ctx.restore();
}

// ---------- The haunted house room ----------

// The inside of a haunted house: cobwebs, a ghost, the villain and you.
// h is the house scene (state.house in game.js), ch the player's character.
function drawHouseRoom(ctx, h, ch, t) {
  ctx.fillStyle = '#4a3b78'; ctx.fillRect(0, 0, VIEW_W, 260);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let x = 0; x < VIEW_W; x += 48) ctx.fillRect(x, 0, 24, 260);
  ctx.fillStyle = '#8a6440'; ctx.fillRect(0, 240, VIEW_W, VIEW_H - 240);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 2;
  for (let y = 270; y < VIEW_H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VIEW_W, y); ctx.stroke(); }
  // A round window with the moon, and the door we came in through.
  circle(ctx, 384, 80, 46, '#1f2a55'); circle(ctx, 396, 70, 18, '#ffe680');
  ctx.strokeStyle = '#2b2140'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(384, 80, 46, 0, Math.PI * 2); ctx.stroke();
  roundRect(ctx, 14, 140, 60, 100, 26, '#2b2140');
  // Cobwebs in the top corners
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
  for (const [x, s] of [[0, 1], [VIEW_W, -1]]) {
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) { const a = i * Math.PI / 8; ctx.moveTo(x, 0); ctx.lineTo(x + s * Math.cos(a) * 80, Math.sin(a) * 80); }
    for (const r of [25, 50, 75]) { ctx.moveTo(x + s * r, 0); ctx.arc(x, 0, r, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI / 2 : Math.PI / 2, s < 0); }
    ctx.stroke();
  }
  drawGhost(ctx, 130, 70, 48, t);
  // The villain (spins and shrinks when beaten), then the prize.
  const vx = 600, vy = 180;
  if (h.phase !== 'walk' && h.phase !== 'got' && h.phase !== 'leave') {
    const shrink = h.phase === 'defeat' ? Math.max(0.01, 1 - h.t / 1.6) : 1;
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(h.spin); ctx.scale(shrink, shrink);
    const scales = h.villain === 'dragon' ? h.total - h.done : undefined;
    drawVillain(ctx, h.villain, 0, 0, 120, t, { hurt: h.hurt, scales, aim: 'left' });
    ctx.restore();
  }
  const item = HOUSES[h.n - 1];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (h.phase === 'walk' || h.phase === 'defeat' && h.t > 1.2) {
    ctx.font = '56px sans-serif'; ctx.fillText(item.icon, vx, vy + 20 + Math.sin(t * 4) * 6);
    ctx.font = '22px sans-serif'; ctx.fillText('✨', vx - 40, vy - 10 + Math.sin(t * 6) * 6); ctx.fillText('✨', vx + 40, vy + Math.cos(t * 6) * 6);
  }
  const walking = h.phase === 'enter' || h.phase === 'walk';
  const cheering = h.phase === 'got' || h.phase === 'leave';
  drawCharacter(ctx, ch, h.charX, 200, 76, t, walking || cheering ? (ch.look === 'chameleon' ? 'excited' : 'happy') : null);
  if (cheering) { ctx.font = '48px sans-serif'; ctx.fillText(item.icon, h.charX, 120 + Math.sin(t * 4) * 5); }
  ctx.textBaseline = 'alphabetic';
}

// ---------- Showing a puzzle ----------

// panel: the box to draw buttons into.
// hooks: { onRight(done, total), onWrong(), onSolved(), sound(name) }
// Returns { key(k) } so the game can pass keyboard presses in.
function startPuzzle(houseNumber, panel, hooks) {
  const puzzle = PUZZLES[houseNumber].generate();
  panel.innerHTML = '';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const title = el('div', 'pz-title', puzzle.title);
  const dots = el('div', 'pz-dots');
  const msg = el('div', 'pz-msg', '');
  const body = el('div', 'pz-body');
  panel.append(title, dots, body, msg);
  let keyHandler = () => {};
  let total = 0, done = 0;

  function setDots() { dots.textContent = '●'.repeat(done) + '○'.repeat(Math.max(0, total - done)); }
  function tryAgain() { msg.textContent = 'Try again!'; msg.className = 'pz-msg wrong'; hooks.sound('buzz'); hooks.onWrong(); }
  function right() { msg.textContent = 'Yes!'; msg.className = 'pz-msg right'; hooks.sound('ding'); done++; setDots(); hooks.onRight(done, total); }

  // Rounds where you pick one of a few buttons.
  function runChoiceRounds(rounds, afterAll) {
    let r = 0;
    function show() {
      const round = rounds[r];
      body.innerHTML = '';
      msg.textContent = '';
      if (round.pattern) {
        const row = el('div', 'pz-pattern');
        round.pattern.forEach(s => row.append(el('span', 'pz-cell', s)));
        row.append(el('span', 'pz-cell pz-ask', '❓'));
        body.append(row);
      }
      if (round.picture) {
        const c = el('canvas', 'pz-picture');
        c.width = 160; c.height = 160;
        body.append(c);
        drawPicture(c.getContext('2d'), round.picture, 160, 160);
      }
      body.append(el('div', round.small ? 'pz-prompt small' : 'pz-prompt', round.prompt));
      const row = el('div', 'pz-choices');
      let locked = false;
      const buttons = round.choices.map((label, i) => {
        const b = el('button', 'big-btn pz-choice', label);
        b.onclick = () => {
          if (locked || b.disabled) return;
          if (i === round.answer) {
            locked = true; b.classList.add('good'); right();
            setTimeout(() => { r++; if (r < rounds.length) show(); else afterAll(); }, 700);
          } else {
            b.classList.add('shake'); b.disabled = true; tryAgain();
            setTimeout(() => b.classList.remove('shake'), 400);
          }
        };
        row.append(b);
        return b;
      });
      body.append(row);
      keyHandler = (k) => { const n = parseInt(k, 10); if (n >= 1 && n <= buttons.length) buttons[n - 1].click(); };
    }
    show();
  }

  if (puzzle.kind === 'choice') {
    total = puzzle.rounds.length; setDots();
    runChoiceRounds(puzzle.rounds, hooks.onSolved);
  }

  if (puzzle.kind === 'memory') {
    total = 3; setDots();
    const grid = el('div', 'pz-cards');
    let open = [], busy = false;
    const cards = puzzle.cards.map((id, i) => {
      const b = el('button', 'pz-card');
      const c = el('canvas'); c.width = 120; c.height = 120;
      b.append(c);
      const card = { id, b, c, up: false, matched: false };
      const paint = () => {
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 120, 120);
        if (card.up || card.matched) drawCharacter(ctx, getCharacter(id), 60, 64, 84, 0);
        else { ctx.font = '56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('❓', 60, 64); }
        b.classList.toggle('up', card.up || card.matched);
      };
      card.paint = paint; paint();
      b.onclick = () => {
        if (busy || card.up || card.matched) return;
        card.up = true; paint(); open.push(card);
        if (open.length < 2) return;
        const [a, z] = open; open = [];
        if (a.id === z.id) {
          a.matched = z.matched = true; right();
          if (done === total) setTimeout(hooks.onSolved, 700);
        } else {
          busy = true; tryAgain();
          setTimeout(() => { a.up = z.up = false; a.paint(); z.paint(); busy = false; msg.textContent = ''; }, 1000);
        }
      };
      grid.append(b);
      return card;
    });
    body.append(grid);
    keyHandler = (k) => { const n = parseInt(k, 10); if (n >= 1 && n <= 6) cards[n - 1].b.click(); };
  }

  if (puzzle.kind === 'riddle') {
    total = 4; setDots();
    const codeBox = el('div', 'pz-code');
    const showCode = (shown, typed) => {
      codeBox.textContent = '🔒 ' + puzzle.code.map((d, i) => typed ? (typed[i] !== undefined ? typed[i] : '_') : (i < shown ? d : '?')).join(' ');
    };
    panel.insertBefore(codeBox, body);
    showCode(0);
    const withDigits = puzzle.rounds.map(r => r);
    let revealed = 0;
    const origRight = hooks.onRight;
    hooks = Object.assign({}, hooks, { onRight: (d, t) => { revealed = Math.min(3, d); showCode(revealed); origRight(d, t); } });
    runChoiceRounds(withDigits, () => {
      // All three digits are showing. Now type them on the lock.
      title.textContent = 'Type the secret code to open the door!';
      body.innerHTML = '';
      msg.textContent = '';
      let typed = [];
      const remember = el('div', 'pz-prompt', 'Code: ' + puzzle.code.join(' '));
      const pad = el('div', 'pz-keypad');
      const press = (d) => {
        if (d === 'back') typed.pop(); else if (typed.length < 3) typed.push(d);
        showCode(3, typed);
        if (typed.length === 3) {
          if (typed.join('') === puzzle.code.join('')) { right(); keyHandler = () => {}; setTimeout(hooks.onSolved, 700); }
          else { tryAgain(); setTimeout(() => { typed = []; showCode(3, typed); }, 700); }
        }
      };
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 'back', 0].forEach(d => {
        const b = el('button', 'big-btn pz-key', d === 'back' ? '⬅️' : String(d));
        b.onclick = () => press(d);
        pad.append(b);
      });
      body.append(remember, pad);
      showCode(3, typed);
      keyHandler = (k) => { if (/^[0-9]$/.test(k)) press(parseInt(k, 10)); if (k === 'Backspace') press('back'); };
    });
  }

  return { key: (k) => keyHandler(k), puzzle };
}
