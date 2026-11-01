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

## Play it

- **Online:** turn on GitHub Pages (Settings → Pages → Deploy from a branch → `main`, `/ (root)`), then open `https://dslichtenberg.github.io/robot-land/`.
- **On your computer:** the game must be served by a web server (browsers block 3D models from a double-clicked file). From this folder run `python3 -m http.server` and open http://localhost:8000.
- **iPad:** open the link in Safari, tap Share, then Add to Home Screen.

Keys: arrows or WASD to drive and hop, `P` phone, `M` sound. On a touch screen, use the joystick in the corner.

## 3D models

Put `.glb` files in `assets/models/`. The names the game looks for are in `MODEL_FILES` at the top of `src/models.js`:

- Characters: `tyler`, `skyler`, `nick`, `pip`, `mo`, `zazz`, `dragon`, `snowgun`, `yoyo`, `wizard`, `ghost`, `tall-robot`
- Vehicles: `kart`, `snowmobile`, `buggy`, `glider`, `tractor`, `carpet`

Any missing model is replaced by a simple stand-in, so the game always runs. (The browser console shows a "404" for each missing file; that is expected.) Models should be Y up, facing +Z, standing on y = 0. The game scales them to the right size. Static models are fine: the game moves named parts in code:

- Characters: the dragon's `stubby-wing`, the ghost's `waving-arm`, the robot's `red-bulb`
- Vehicles: every `wheel` spins, every `wing` flaps, `paint` is tinted the driver's color, and an empty node called `seat` marks where the driver sits

## Files

| File | What it holds |
|---|---|
| `index.html`, `style.css` | The page, buttons and pop-ups |
| `src/main.js` | Screens, driving, robots and phone, entering houses, saving, camera |
| `src/worlds.js` | Each world's layout as plain numbers, and what the robots say |
| `src/world.js` | Builds a world and runs its moving parts and collisions |
| `src/rooms/` | The puzzle rooms: `lava.js`, `ice.js`, `levers.js`, `mirrors.js`, and `common.js` (shared room pieces) |
| `src/models.js` | Loads the `.glb` files and builds stand-ins, vehicles and prize items |
| `src/roster.js` | The six friends, their perks, and their 2D card portraits |
| `src/input.js`, `src/audio.js` | Keyboard, touch joystick, and sounds |
| `vendor/three/` | A copy of three.js 0.170.0, so nothing loads from the internet |
| `v1-2d/` | The original 2D version (open its `index.html` directly) |

Type `state` in the browser console to see what the game knows. While testing, `game.goToWorld(2)` jumps to World 3 and `game.placeCar(x, z)` moves the car.
