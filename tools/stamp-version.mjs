// tools/stamp-version.mjs
// Run before pushing an update:  node tools/stamp-version.mjs
//
// Browsers keep old copies of the game's files for a while, so after an
// update a normal reload could mix old and new code. This gives every file
// a new version tag (?v=...) in index.html, so a plain reload fetches the
// new files. Models, pictures and textures get the same tag (see window.V).
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const V = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const js = [];
(function walk(dir) {
  for (const f of fs.readdirSync(path.join(root, dir))) {
    const rel = dir + '/' + f;
    if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel);
    else if (f.endsWith('.js')) js.push(rel);
  }
})('src');
js.sort();

const imports = { three: './vendor/three/three.module.min.js', 'three/addons/': './vendor/three/addons/' };
for (const f of js) imports['./' + f] = './' + f + '?v=' + V;
const block = `<!-- version:start (written by tools/stamp-version.mjs) -->
  <script>window.V = '${V}';</script>
  <link rel="stylesheet" href="style.css?v=${V}">
  <!-- three.js is copied into vendor/ so the game never needs the internet. -->
  <script type="importmap">
${JSON.stringify({ imports }, null, 2).replace(/^/gm, '    ')}
  </script>
  <!-- version:end -->`;

const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');
html = html.replace(/<!-- version:start[\s\S]*?<!-- version:end -->/, block);
html = html.replace(/src="src\/roster\.js[^"]*"/, `src="src/roster.js?v=${V}"`);
html = html.replace(/src="src\/main\.js[^"]*"/, `src="src/main.js?v=${V}"`);
fs.writeFileSync(file, html);
console.log('version', V, '(' + js.length + ' scripts)');
