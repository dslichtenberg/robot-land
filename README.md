# Robot Land to Gecko Land

A 3D driving and puzzle game for a 7 year old. Drive through six hilly worlds, find each haunted house, beat the villain's puzzle room, and take the portal to the next world. The last one leads home to Gecko Land.

| World | Vehicle | Getting around | Haunted house puzzle |
|---|---|---|---|
| 1. Gear City | Robo-Kart | Drawbridge timing, conveyor belts, a far-off button opens the yard | Dragon: remember the lit path across the lava |
| 2. Frosty Peaks | Snow Zoomer | Slippery frozen lake, snowball cannons, two buttons | Snowgun: slide on ice to grab snowflakes, dodge snowballs |
| 3. Bouncy Hills | Boing Buggy | Spring pads over canyons (one is a dead end), swinging yo-yos | Yo-yo: pull levers in the order shown, dodge yo-yos |
| 4. Starry Woods | Moth Glider | Dark woods split by hedges, colored teleport pads, find three stars | Wizard: flip mirrors to bounce light onto a crystal before the candle burns down |
| 5. Lava Meadow | Lava Tractor | Stepping stones that sink into lava, rolling fireballs, a volcano | Dragon again: longer lava paths plus rolling fireballs |
| 6. Wizard Tower | Magic Carpet | Three rings of walls, each opened by a button | Wizard again: bigger mirror puzzles plus sparkles |

Failing a puzzle never costs hearts: the round just starts again, and after a few misses a hint appears.

Each haunted house prize gives your car a power for the rest of the game:

| Prize (from) | Power | How |
|---|---|---|
| 🔑 Robot Key (World 1) | ⚡ Laser: pops snowballs and sparkles, makes villains dizzy for 4 seconds. Stops at walls. | Space or Z |
| 🥾 Rocket Boots (World 2) | 🚀 Turbo: a burst of super speed | X |
| 🧵 Bouncy String (World 3) | 🦘 Jump: hop over snowballs, fireballs and yo-yos (not over walls or rivers) | C |
| 🎩 Wizard Hat (World 4) | 🫧 Bubble: blocks one bump, grows back after 10 seconds | Always on |
| 🐲 Dragon Scale (World 5) | ❤️ One extra heart | Always on |
| 🗺️ Gecko Land Map (World 6) | Leads you home | |

On a touch screen, tap the round buttons in the bottom right corner.

## Play it

- **Online:** turn on GitHub Pages (Settings → Pages → Deploy from a branch → `main`, `/ (root)`), then open `https://dslichtenberg.github.io/robot-land/`.
- **On your computer:** the game must be served by a web server (browsers block 3D models from a double-clicked file). From this folder run `python3 -m http.server` and open http://localhost:8000.
- **iPad:** open the link in Safari, tap Share, then Add to Home Screen.

Keys: arrows or WASD to drive and hop, `P` phone, `M` sound. On a touch screen, use the joystick in the corner.

## 3D models

All models follow [`docs/MODEL_SPEC.md`](docs/MODEL_SPEC.md) and live in `assets/models/` by kind (`characters/`, `villains/`, `vehicles/`, `houses/`, `landmarks/`, `pieces/`, `items/`, `rooms/`, `scenery/<world>/`). Ground, road, water and lava textures are in `assets/textures/`.

**Adding or replacing models:**

1. Check the source files against the spec (needs only Node):
   `node tools/check-models.mjs path/to/new/models`
2. Compress them for the web (WebP textures, compressed meshes; part names are kept):
   `tools/compress-models.sh path/to/new/models assets/models`
3. Reload the game. A missing or broken file falls back to a simple stand-in, so the game always runs.

What the game does with each model (animations, faces, wheel spin, steering, paint tint, the `col` collision box, the `lod1` far-away copy) is described in section 10 of the spec and in `src/models.js`.

## Files

| File | What it holds |
|---|---|
| `index.html`, `style.css` | The page, buttons and pop-ups |
| `src/main.js` | Screens, driving, robots and phone, entering houses, saving, camera |
| `src/worlds.js` | Each world's layout as plain numbers, and what the robots say |
| `src/world.js` | Builds a world and runs its moving parts and collisions |
| `src/rooms/` | The puzzle rooms: `lava.js`, `ice.js`, `levers.js`, `mirrors.js`, and `common.js` (shared room pieces) |
| `src/models.js` | Loads the `.glb` files; animations, faces, vehicles, prize items, and cheap many-copy scenery |
| `src/roster.js` | The six friends, their perks, and their 2D card portraits |
| `src/input.js`, `src/audio.js` | Keyboard, touch joystick, and sounds |
| `vendor/three/` | A copy of three.js 0.170.0 (plus its glTF, mesh-decompression and skeleton helpers), so nothing loads from the internet |
| `tools/` | `check-models.mjs` (spec checker) and `compress-models.sh` (web compression) |
| `docs/MODEL_SPEC.md` | The spec for every model and texture |
| `v1-2d/` | The original 2D version (open its `index.html` directly) |

**Test mode:** add `?test` to the address (for example `https://dslichtenberg.github.io/robot-land/?test`). Then Ctrl+1 to Ctrl+6 jump to that world and Ctrl+7 to the Gecko Land ending, from any screen. Alt+number does the same, for browsers that use Ctrl+number to switch tabs. Jumping does not change the saved game.

Type `state` in the browser console to see what the game knows. While testing, `game.goToWorld(2)` jumps to World 3 and `game.placeCar(x, z)` moves the car.
