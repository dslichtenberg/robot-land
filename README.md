# Robot Land to Gecko Land

A 3D driving and puzzle game for a 7 year old. Drive through six worlds, find each haunted house, beat the villain's puzzle room, and take the portal to the next world. The last one leads home to Gecko Land.

**Status:** World 1 (Gear City) and its Dragon lava room are playable. Worlds 2 to 6 are next.

## Play it

- **Online:** turn on GitHub Pages (Settings → Pages → Deploy from a branch → `main`, `/ (root)`), then open `https://dslichtenberg.github.io/robot-land/`.
- **On your computer:** the game must be served by a web server (browsers block 3D models from a double-clicked file). From this folder run `python3 -m http.server` and open http://localhost:8000.
- **iPad:** open the link in Safari, tap Share, then Add to Home Screen.

Keys: arrows or WASD to drive and hop, `P` phone, `M` sound. On a touch screen, use the joystick in the corner.

## 3D models

Put `.glb` files in `assets/models/`. The names the game looks for are in `MODEL_FILES` at the top of `src/models.js`:

`tyler`, `skyler`, `nick`, `pip`, `mo`, `zazz`, `dragon`, `snowgun`, `yoyo`, `wizard`, `ghost`, `tall-robot`

Any missing model is replaced by a simple stand-in, so the game always runs. (The browser console shows a "404" for each missing file; that is expected.) Models should be Y up, facing +Z, standing on y = 0. The game scales them to the right height. Static models are fine: the game wiggles named parts (like the dragon's `stubby-wing` and the robot's `red-bulb`) in code.

## Files

| File | What it holds |
|---|---|
| `index.html`, `style.css` | The page, buttons and pop-ups |
| `src/main.js` | Screens, driving, robots and phone, entering houses, saving, camera |
| `src/worlds.js` | Each world's layout as plain numbers, and what the robots say |
| `src/world.js` | Builds a world and runs its moving parts and collisions |
| `src/rooms/lava.js` | The Dragon's lava stepping-stone room |
| `src/models.js` | Loads the `.glb` files and builds stand-ins, the car and items |
| `src/roster.js` | The six friends, their perks, and their 2D card portraits |
| `src/input.js`, `src/audio.js` | Keyboard, touch joystick, and sounds |
| `vendor/three/` | A copy of three.js 0.170.0, so nothing loads from the internet |
| `v1-2d/` | The original 2D version (open its `index.html` directly) |

Type `state` in the browser console to see what the game knows, or `game.placeCar(x, z)` to jump around while testing.
