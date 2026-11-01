# Robot Land to Gecko Land: 3D Model Specification (v2.1)

**v2.1 change:** the material rules (section 2.3) now say exactly which materials count toward the limit, that required special materials take priority, the hard cap per model, and the full material list for every model (section 12). Glow and glass now go inside the main material unless the game animates them.

This is the complete spec for every 3D model and texture in the game. Each rule exists because the first batch of models had a problem it fixes. If something here is unclear, ask before modeling: a guess costs a full redo.

**Look we are aiming for:** the clean, colorful, soft-lit style of Pokemon Legends Z-A. That means smooth rounded silhouettes, simple shapes with painted texture detail (not lots of tiny geometry), expressive faces, gentle gradients and soft rim light, and lively animation. We are running in a web browser on an iPad, so the budgets below are set to get as close to that look as an iPad can draw at a smooth frame rate.

---

## 0. What went wrong last time (and the rule that fixes it)

Measured from the first batch:

| File | Triangles | Draw calls | Materials | UVs / textures | Skeleton / animations | Repeated names |
|---|---|---|---|---|---|---|
| kart.glb | 2,716 | **63** | 63 | none | none | 13 |
| tractor.glb | 2,552 | **64** | 64 | none | none | 14 |
| carpet.glb | 480 | 33 | 33 | none | none | 27 |
| dragon.glb | 4,460 | 23 | 23 | none | none | 8 |

| Problem | Why it matters | Rule in this spec |
|---|---|---|
| One material per part (bolts, rims, eyes...) | Every material is a separate draw call. Draw calls, not triangles, are what slow an iPad down. 63 draw calls for one kart is more than a whole scene should use. | **At most 2 general materials per model, plus only the special materials this spec requires, under a hard cap** (section 2.3, full list in section 12). Small colored details go in the texture, not in separate materials. |
| No UV maps, no textures | Flat colors only. No painted detail, no shading gradients, no faces. This is the biggest reason the models look like blockouts. | **Every model is UV-unwrapped and textured** (section 2.4). |
| Low segment counts on round shapes | Spheres and tubes look faceted (visible flat sides), especially up close in the puzzle rooms. | **Silhouette smoothness rule** (section 2.2): no visible facets at the closest camera distance. |
| Static, no skeleton | The game can only bob and wobble the whole model. Nothing walks, waves or cheers. | **Characters and villains are rigged and animated** (sections 4 and 5). |
| Names repeat (`wheel` x4, `paint` x4) | The game cannot tell parts apart; three.js renames them `wheel_1`, `wheel_2`... and also gives those names to pieces inside groups. | **Every node name is unique** and follows the exact names in this spec (section 2.5). |
| A "part" made of many sub-pieces (a wheel = 11 primitives) | 11 draw calls per wheel; the game had to guess the turning point. | **One mesh per moving part, pivot at the joint** (section 2.6). |
| Parts placed in model space with no pivots (characters) | The game had to compute joint positions to animate wings and arms. | **Pivots are set in the file** (section 2.6). |
| Meshes intersecting each other | Hidden triangles waste budget; z-fighting shimmer where surfaces overlap. | **Clean, joined meshes, no hidden interior faces** (section 2.2). |
| Missing files | The six friends, yo-yo, wizard and buggy never arrived, so the game uses sphere stand-ins. | **Full delivery list** (section 11). |

---

## 1. Performance budget (the whole screen, not one model)

Target: a steady 60 frames per second on an iPad from 2021 or newer (A13 chip or better) in Safari, at about 1.5x pixel density.

| Budget | Limit | Notes |
|---|---|---|
| Triangles on screen | 400,000 | All visible models together |
| Draw calls per frame | 150 | Repeated props (trees, rocks, grass) are drawn as one instanced draw call per material, so 500 identical trees cost the same as 1 |
| Texture memory | 160 MB | Sum of all loaded textures |
| Download per world | 25 MB | After I compress (section 10) |
| Skinned (animated) characters on screen | 8 | Player, driver, villains, robots, ghost |

The per-model budgets below are chosen so a busy scene stays inside these limits.

---

## 2. Rules for every file

### 2.1 File format and orientation
- **glTF 2.0 binary (`.glb`)**, everything embedded (no external `.bin` or image files).
- **Y is up. The model faces +Z** (its front points toward +Z). +X is the model's left side when you look at its face.
- **Units are meters.** Use the real sizes in each section. (The game can rescale, but correct sizes make the pieces fit together.)
- **Origin:** characters and props at the center of the footprint on the ground (`y = 0`). Vehicles at the center of the four wheel contact points on the ground. Wall pieces at the bottom-left-front corner (section 8.1).
- **Freeze scale.** The root node has scale 1, no rotation. Animated parts may have rotations; static parts should have transforms applied.
- No cameras, no lights, no empty "scene" wrappers beyond what is listed.
- Allowed glTF extensions: `KHR_materials_emissive_strength`, `KHR_texture_transform`. **No Draco, no meshopt, no KTX2**: deliver plain files and I compress them myself (section 10).

### 2.2 Geometry quality
- **Silhouette smoothness:** no visible flat facets on any curved outline when seen at the closest in-game distance (puzzle rooms: about 3 meters, filling about a third of the screen). As a guide: a character's head needs about 24 to 32 segments around; limbs and tails 12 to 16; wheels 24 around the tread.
- **Smooth shading** on organic and rounded surfaces. Use hard edges (split normals) only where a real crease is wanted (a car's panel edge, a crate's corner). Export normals.
- **Spend triangles on the silhouette**, not on flat areas. A flat car door needs very few triangles; the round edge of a helmet needs many.
- **Detail that is not part of the outline goes in the texture**, not the geometry: bolts, stitches, spots, stripes, scales, wood grain, bricks, windows, eye shine. Only add geometry for things that stick out of the outline (horns, antenna, spoiler, fingers).
- **No hidden or intersecting geometry.** Join overlapping pieces into one clean surface or delete faces that are buried inside another piece. No faces inside closed shapes. Faces that can never be seen (the bottom of a building, the underside of a rock sitting on the ground) should be deleted.
- **Manifold where it deforms:** characters must be one connected skin per material where it bends (no separate floating arm pieces), with edge loops at every bend (section 4.3).
- Triangles or quads are both fine (exported as triangles). No n-gons left uncleaned in curved areas.

### 2.3 Materials

Every material is one draw call per copy on screen, so materials are counted strictly. There are two kinds.

**General materials (at most 2 per model):**
1. `<name>_main`: everything opaque, one texture atlas. **Glowing parts go here too**, using the material's emissive texture (headlights, windows, lanterns, crystals, lava cracks, a robot's screen). glTF lets one material have both a color texture and an emissive (glow) texture, and the game makes emissive parts bloom.
2. `<name>_alpha`: only if the model has cut-out shapes (leaves, cobwebs, grass, tassel fringe), using alpha **mask** (cutout), not blend. Most models do not need it.

**Special materials (only where this spec requires them):** a part needs its own material when the game changes that material while playing: it recolors it, swaps or scrolls its texture, or turns its glow on and off. These are the only special materials, with exact names:

| Material | Why it is separate | Used by |
|---|---|---|
| `paint` | The game tints it to the driver's color | Every vehicle |
| `skin_tint` | The game shifts it through rainbow colors | Zazz (replaces `zazz_main` for the body) |
| `eyes`, `mouth` | The game swaps expressions by moving the texture | Friends, villains, ghost; robot has `eyes` only (its screen face) |
| `belt` | The game scrolls the texture | Snowmobile track, conveyor |
| `swirl` | The game spins the texture | Portal, teleport pad |
| `lava`, `water` | The game scrolls and pulses them | Volcano crater, lava cracks |
| `<name>_glow` | **Only for glow the game turns on and off or recolors** | Robot bulb (`robot_glow`), lever lamp (`lever_lamp`), crystal target (`crystal_glow`), stepping-stone top (`hex_top`), teleport pad ring (`pad_glow`) |
| `ghost_main` | The ghost body is slightly see-through (alpha blend) | Ghost only |
| `mirror_glass` | Shiny reflective face | Mirror stand only |

**Priority rule:** required special materials always win over the 2-general-material limit, **but the total must stay under the hard cap for that model type** (table in section 3). If a design would go over the cap, simplify the design (paint it into the texture), do not add a material.

**Other rules:**
- **No separate glass material.** Windshields, goggles, glasses and windows are painted into the main texture (light tint, a soft highlight streak). Only the ghost and water are actually see-through.
- **No separate glow material for glow that never changes.** It goes in `<name>_main`'s emissive texture.
- glTF **metallic-roughness** materials only. Most surfaces: metallic 0, roughness 0.5 to 0.8. Metal parts (robots, gears): metallic 0.6 to 0.9, roughness 0.3 to 0.5, through a metallic-roughness texture in the same atlas.
- Every material that is not `BLEND` or `MASK` is `OPAQUE`. Double-sided only for thin cut-out cards (leaves, grass, cobwebs, carpet).
- **Section 12 lists the exact materials for every model.** If section 12 and anything else disagree, section 12 wins.

### 2.4 UVs and textures
- **Every mesh has one UV set (`TEXCOORD_0`),** unwrapped without overlaps (except mirrored left/right halves, which may share UVs to save space, but never on faces with text, numbers or asymmetric markings).
- Textures are **PNG** (or JPEG for large photographic-style surfaces), embedded, sizes a power of two.
- **Texture sizes:**

| Model type | Base color | Normal map | Emissive | Notes |
|---|---|---|---|---|
| Friend characters | 1024 x 1024 | optional 512 | in base atlas | Plus the face sheets (section 4.4) |
| Villains | 1024 x 1024 | optional 1024 | 512 | |
| Ghost, robot | 512 x 512 | none | 256 | |
| Vehicles | 1024 x 1024 | optional 512 | 256 | `paint` area painted light gray (section 6.2) |
| Haunted houses | 1024 x 1024 | optional 1024 | 512 | |
| Buildings and large props | 512 x 512 | optional 512 | 256 | |
| Small props, trees, rocks | 512 x 512 shared per world (section 8.2) | none | | |
| Tiling ground textures | 1024 x 1024 tiling | 1024 tiling | | Section 9 |

- **Painting style (this is what makes it look like Z-A):**
  - Clean, saturated base colors with **soft painted gradients**: slightly lighter on top surfaces, slightly darker and warmer toward the bottom and in creases (painted ambient occlusion).
  - Subtle color variation instead of flat fills (a green body has hints of yellow-green and blue-green).
  - Crisp details: pupils, highlights, spots, stripes, stitching, bolts, bricks.
  - **No baked hard shadows or baked lighting direction** (the game lights everything in real time). Soft ambient occlusion in creases is good.
  - No photo textures; everything looks hand-painted and toy-like.
- **Texel density:** about 256 pixels per meter for characters and vehicles, 128 per meter for buildings and props. Characters' faces get double density (place them big in the UV layout).

### 2.5 Naming
- **Every node and mesh name is unique in its file.** Use the exact names in this spec. For repeated parts use clear suffixes: `wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR` (front-left, front-right, rear-left, rear-right); `_L` and `_R` for left and right (the model's own left, which is +X).
- Lowercase, underscores, no spaces, no dots.
- File names exactly as listed in section 11.

### 2.6 Moving parts and pivots
- **A part that moves on its own is one mesh** (or one bone, for characters), with its **origin at the joint:** a wheel's origin at its axle center, a lever's at its hinge, a door's at its hinge edge, a wing's at its shoulder.
- Its **rest rotation is zero** where possible, with the turning axis listed in the spec (for example: wheels turn around local X).
- Fixed "marker" points the game uses are **empty nodes** (no mesh) with exact names, for example `seat`, `muzzle`, `wand_tip`, `door_spot`. Their position and +Z direction matter.

### 2.7 Collision (scenery only)
- Scenery the car can bump into includes one extra mesh named **`col`**: the simplest box or cylinder that wraps the solid part (a tree's trunk, not its leaves). It can be any material; the game reads its size, then hides it. If there is no `col`, the game uses the model's whole footprint.

### 2.8 Level of detail (scenery only)
- Trees, rocks, buildings and haunted houses include a second, lighter copy for far away: node **`lod1`** next to the main node **`lod0`** (both children of the root). `lod1` is about 25 to 35 percent of `lod0`'s triangles, using the same material and texture. The game switches at about 35 meters.

---

## 3. Budget summary

"Hard cap" is the total number of materials (general plus special) a model may have. Section 12 has the exact list per model.

| Category | Triangles (`lod0`) | `lod1` | Hard cap (materials) | Max file size before compression |
|---|---|---|---|---|
| Friend character | 8,000 to 12,000 | none | 4 (main, alpha if needed, eyes, mouth) | 3 MB |
| Villain | 10,000 to 16,000 | none | 4 | 4 MB |
| Ghost, hint robot | 4,000 to 8,000 | none | 4 | 2 MB |
| Vehicle | 5,000 to 9,000 | none | 3 (paint, main, plus one: `belt` or alpha) | 3 MB |
| Haunted house | 6,000 to 10,000 | 2,000 | 2 (main, alpha) | 4 MB |
| Landmark (gear tower, volcano...) | 4,000 to 8,000 | 1,500 | 2 (main, plus `lava` on the volcano) | 3 MB |
| Building, cliff, large prop | 1,500 to 3,000 | 500 | 2 | 1 MB |
| Tree | 800 to 1,800 | 300 | 2 (main for bark, alpha for leaves) | 0.5 MB |
| Rock, bush, crate, small prop | 150 to 800 | 100 (if over 500) | 2 | 0.4 MB |
| Grass tuft, flower, pebble | 10 to 80 | none | 1 | 0.1 MB |
| Interactive piece (button, gate, pad...) | 500 to 2,500 | none | 2 (main, plus one special); the teleport pad alone may have 3 | 1 MB |
| Prize item | 1,000 to 2,000 | none | 1 | 1 MB |
| Room set piece (wall, floor, torch...) | 50 to 1,500 | none | 2 (main, plus one special or alpha) | 0.5 MB |

---

## 4. The six friends (playable characters)

### 4.1 Shared size and pose
- **Height** (feet to top of head, not counting crests or antennae): Tyler, Skyler, Nick, Zazz **1.0 m**; Pip **0.8 m**; Mo **0.9 m**.
- **Proportions:** chibi, toy-like. Head about 40 percent of total height, big eyes, short limbs, chunky hands and feet. Think plush toy, not real animal.
- **Bind pose:** standing, arms out at 45 degrees (A-pose), facing +Z, feet on `y = 0`.
- **Triangles 8,000 to 12,000.** Spend them on the head, eyes area, hands (three rounded fingers with toe pads for geckos) and tail.
- **Materials:** `<id>_main` (body atlas), `eyes`, `mouth` (section 4.4), and `<id>_alpha` only if needed (for example Mo's scarf fringe). Zazz uses `skin_tint` for the body plus `zazz_main` for the claws and crest. See section 12.

### 4.2 Skeleton (exact bone names)
One armature named `rig`, at most 45 bones, at most 4 bone weights per vertex, weights normalized.

```
root                      (at the origin, on the ground)
  hips
    spine
      chest
        neck
          head
            jaw           (optional: only if the mouth opens in geometry)
            crest         (Zazz only; frog eye bumps: eye_bump_L/R on Pip)
        shoulder_L > upper_arm_L > forearm_L > hand_L > fingers_L
        shoulder_R > upper_arm_R > forearm_R > hand_R > fingers_R
    thigh_L > shin_L > foot_L > toes_L
    thigh_R > shin_R > foot_R > toes_R
    tail_1 > tail_2 > tail_3 > tail_4 > tail_5     (geckos and Zazz; Mo: tail_1 > tail_2; Pip: none)
    shell                  (Mo only: child of spine, so the shell moves with the body)
```
Plus an empty node **`head_top`** (top of the head, for the prize item to float above) and **`hand_R_grip`** (palm center of the right hand, for holding the item).

### 4.3 Deformation quality
- Edge loops: at least 3 around each shoulder, elbow, wrist, hip, knee, ankle, neck, and every tail joint.
- Test poses that must look clean (no collapsing, no spikes): arms raised straight up (cheer), knees bent 90 degrees (sitting in a vehicle), tail curled 90 degrees, head turned 45 degrees.

### 4.4 Faces (expressions, the Pokemon way)
- The eyes and mouth are **separate flat-ish meshes** sitting on the face, each with its own material: `eyes` and `mouth`.
- Each uses a **2 x 2 sprite sheet texture** (512 x 512 for eyes, 256 x 256 for the mouth). The game switches expressions by shifting the texture to a different quarter:

| Quarter | Eyes | Mouth |
|---|---|---|
| top-left | open, normal, with shine highlight | gentle smile |
| top-right | closed (blink) | big open grin |
| bottom-left | happy ^ ^ arcs | small "o" (surprised) |
| bottom-right | sad / worried | wobbly frown |

- UV-map the eye and mouth meshes to the **top-left quarter only**. The game shifts to the others.
- Eyes are large, glossy, with a big highlight and a small second highlight. Pupils look slightly toward the camera.

### 4.5 Animations (exact clip names)
30 frames per second, in place (no moving forward through the scene: the game moves the character), looping clips start and end on the same pose.

| Clip | Length | Loop | What it shows |
|---|---|---|---|
| `idle` | 2.0 s | yes | Breathing, small sway, one tail flick |
| `walk` | 0.8 s | yes | Bouncy cartoon walk |
| `hop` | 0.4 s | no | Small crouch, jump about 0.5 m up, land (used for every tile hop in the rooms) |
| `drive` | 2.0 s | yes | Sitting (hips at the `seat` point, section 6.3), hands forward on a wheel or handlebar, gentle bob |
| `drive_left` | 1 frame | no | Same sitting pose, leaning left |
| `drive_right` | 1 frame | no | Leaning right |
| `cheer` | 1.5 s | yes | Both arms up, jumping |
| `wave` | 1.5 s | yes | One-arm wave (title screen, robots) |
| `oops` | 0.8 s | no | Wobbly "uh oh" when falling in lava or hit by a snowball |
| `dizzy` | 1.0 s | yes | Seeing stars after a bump |
| `victory` | 2.0 s | no | Holding the prize item up high with the right hand |

### 4.6 Each friend

| File | Who | Look and must-have details |
|---|---|---|
| `tyler.glb` | Gecko, the brave leader | Bright leaf green `#3fca4c` body with **orange `#ff8a1f` spots** (texture, 8 to 12 spots of varied size on back, head and tail). Pale yellow-green belly. Confident eyebrows painted above the eyes. Red bandana around the neck. Sticky toe pads (rounded discs) on fingers and toes. |
| `skyler.glb` | Gecko, the clever planner | Sky blue `#5ab8f5` body, **white belly** from chin to tail base. Round explorer goggles pushed up on the forehead (geometry, part of the head). Small satchel strap across the chest (texture plus a slim strap mesh). Thoughtful eyes. |
| `nick.glb` | Gecko, the goofball | Purple `#9a5ce0` body with **yellow `#ffe14d` stripes** across back and tail (texture). Huge toothy grin as the default mouth. One slightly droopy eyelid (texture). Mismatched socks (one striped). |
| `pip.glb` | Tiny jumpy frog | Lime `#9be22d`, cream belly, big eye bumps on top of the head (bones `eye_bump_L/R`), rosy cheeks, long springy back legs folded. Smallest character, 0.8 m. |
| `mo.glb` | Calm turtle | Soft green `#9ccc65` skin, **brown `#8b5a2b` domed shell** with painted hex plates and lighter rims (texture; the shell outline is smooth). Sleepy half-closed eyes as the default. Tiny scarf. Slow, gentle animation timing. |
| `zazz.glb` | Rainbow chameleon | Curled spiral tail (tail bones), crest on the head, cone-shaped turret eyes. **Body uses material `skin_tint` with a light gray base color texture** that has the scale pattern and shading painted in grays; the game tints it with shifting rainbow colors. Accents (claws, crest edge) in the normal `zazz_main` material, white and gold. |

---

## 5. Villains, ghost and robot

Same rules as section 4 (rig, face sheets, clips in place, 30 fps). Exact materials are in section 12. Bone names as in 4.2 where body parts exist, plus the extra bones and markers below.

| File | Height | Triangles | Look | Extra bones and markers | Clips |
|---|---|---|---|---|---|
| `dragon.glb` | 2.2 m | 12,000 to 16,000 | Round, cuddly red `#e03c31` dragon with yellow belly plates, small cream horns, **stubby wings**, heart-tipped tail, one snaggle tooth. Silly, never scary. | `wing_L`, `wing_R` (shoulder joints, flap around local Z), `tail_1..tail_4`, empty `nose` (smoke rings come out here) | `idle`, `fly` (hovering flap), `puff` (smoke ring breath), `taunt`, `hurt`, `spin_out` (defeat) |
| `snowgun.glb` | 2.0 m | 10,000 to 14,000 | Snowman of three snowballs with a coal smile, carrot nose, red bucket hat and scarf, holding a chunky snowball cannon. Snow has soft blue shading and sparkle flecks in the texture. | `cannon` (aims; turns around local Y and X), empty `muzzle` at the cannon tip, `arm_L/R` | `idle`, `aim`, `fire` (recoil), `taunt`, `hurt`, `melt` (defeat) |
| `yoyo.glb` | 1.6 m across | 10,000 to 14,000 | Giant pink `#ff5fa2` yo-yo with a cheeky face on the front disc, little arms, a groove ring. Disc texture has a swirl pattern. | `spin` (the whole disc turns around local Z), `arm_L/R`, empty `string_attach` (top center, where the string connects) | `idle`, `roll`, `bounce`, `taunt`, `hurt`, `unwind` (defeat) |
| `wizard.glb` | 1.8 m | 12,000 to 16,000 | Short wizard in a purple `#7b3fc4` star-covered robe and tall floppy hat, huge white beard, round glasses, star wand. Mischievous, not scary. | `hat_tip` bone (floppy), `wand` bone, empty `wand_tip` (sparkles come out here) | `idle`, `teleport` (shrink and pop), `cast`, `taunt` (laughing), `hurt`, `poof` (defeat) |
| `ghost.glb` | 1.4 m | 4,000 to 8,000 | Friendly sheet ghost with a scalloped hem, rosy cheeks, waving stubby arms. Material slightly see-through (`ghost_main`, alpha blend about 0.9) with a soft glow rim painted in. | `arm_L/R`, `hem` (wavy) | `float`, `wave`, `boo` (a friendly peekaboo), `cheer` |
| `tall-robot.glb` | 2.2 m | 5,000 to 8,000 | The hint robot: boxy but rounded-corner gray-blue metal with panel lines and bolts **in the texture**, one big green screen eye (the screen face uses the `eyes` sheet: open, blink, happy, worried, drawn as glowing pixels), antenna with a bulb, holding a phone handset. | `antenna`, `arm_L/R`, `head`; bulb in material `robot_glow` (the game blinks it); no `mouth` | `idle`, `wave`, `talk` (head bob, arm gestures), `beep` (antenna wiggle) |

---

## 6. Vehicles

### 6.1 Size and build
- **Footprint about 1.6 m wide, 2.6 m long.** Origin at the center of the ground footprint.
- **Triangles 5,000 to 9,000.** Spend them on wheels (24 segments around the tread, rounded tire walls), the round body edges, and the seat area that the camera looks down into.
- **Open top:** the camera looks down from about 60 degrees, so the driver must be clearly visible from above. No roof, no high sides around the seat.
- **Materials:** `paint` (the colored body) and `<id>_main` (everything else: tires, metal, seat, details, plus headlights and lanterns as emissive in the same texture). Only the snowmobile adds `belt`, and only the carpet adds `carpet_alpha` for its tassel fringe. The windshield is painted, not see-through. See section 12.
- **Each wheel is one mesh** (tire, rim and hub bolts all in one mesh and the texture), origin at the axle center, turning around local X: `wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`.
- Front wheels sit inside steering nodes **`steer_FL`, `steer_FR`** (origin at the wheel center, turning around local Y), so the game can turn them.
- The body (everything except wheels) is under a node **`body`**, origin at the body's center of mass, so the game can bounce and tilt it on its suspension.

### 6.2 The `paint` material
- The `paint` texture is painted in **light neutral gray** (`#d0d0d0` to `#ffffff`) with its shading, panel lines and decals in darker grays. The game multiplies it by the driver's color, so gray texture becomes Tyler-green, Skyler-blue, and so on. Do not paint it in a real color.

### 6.3 Markers (empty nodes)
- `seat`: where the driver's hips go, facing +Z. The driver plays the `drive` clip there.
- `headlight_L`, `headlight_R`: the game adds light glow here (night worlds).
- `exhaust`: smoke and dust puff point (if the vehicle has one), or `dust_L` / `dust_R` behind the rear wheels.

### 6.4 The six vehicles

| File | Name | World | Design | Special parts |
|---|---|---|---|---|
| `kart.glb` | Robo-Kart | Gear City | Chunky go-kart with bolted metal panels (texture), roll hoop, antenna with a glowing tip, round headlights, big rear tires. | `antenna` (wobbles, origin at its base) |
| `snowmobile.glb` | Snow Zoomer | Frosty Peaks | Snowmobile with two front skis, rubber track at the back, small curved windshield, handlebars. | Skis are `ski_L`, `ski_R` (origin at the strut, tilt around local X); track is `track` with material `belt` (the game scrolls its texture); handlebar `steer` (turns around Y). No wheels. |
| `buggy.glb` | Boing Buggy | Bouncy Hills | Dune buggy with a roll cage and four **oversized balloon tires** on visible coil springs. | Wheels as in 6.1, plus springs `spring_FL/FR/RL/RR` (origin at the bottom, the game squashes them along Y) |
| `glider.glb` | Moth Glider | Starry Woods | Rounded pod with two big soft moth wings (eye-spot pattern in the texture), a glowing lantern on the nose, little antennae. Hovers. | `wing_L`, `wing_R` (origin at the wing root, flap around local Z); lantern glows through `glider_main`'s emissive texture. No wheels. |
| `tractor.glb` | Lava Tractor | Lava Meadow | Farm tractor with huge treaded rear wheels, small front wheels, roll bar, exhaust pipe, heat-shield fenders. | `exhaust` marker at the pipe top |
| `carpet.glb` | Magic Carpet | Wizard Tower | Patterned flying rug (pattern in the texture) with gold border and corner tassels. Hovers. | Carpet mesh with **at least 12 x 20 segments** so it can ripple, rigged with bones `carpet_1` (back) to `carpet_5` (front) along Z; tassels `tassel_FL/FR/RL/RR`. Clip `ripple` (1 s loop). |

---

## 7. Haunted houses, landmarks and interactive pieces

### 7.1 Haunted houses (one per world)
- Footprint about **7 x 7 m**, height 9 to 12 m (the Wizard Tower's is 16 m tall). Door on the **+Z face**, centered.
- 6,000 to 10,000 triangles (`lod0`), `lod1` about 2,000.
- Spooky-silly: crooked roof, leaning chimney, shutters, cobwebs (in `<house>_alpha`), glowing windows (emissive in `<house>_main`), each house themed to its world.
- Parts: `door` (origin at the hinge, opens around local Y), empty `door_spot` (1.6 m in front of the door, on the ground: the car triggers entry here), empty `sign` (above the door: the game puts the house number here), empty `roof_peek` (where the little ghost peeks out).

| File | World | Theme |
|---|---|---|
| `house_gear.glb` | Gear City | Riveted purple metal house with gears on the walls and a rusty weathervane |
| `house_frosty.glb` | Frosty Peaks | Frozen log cabin with icicles and snow piled on the roof |
| `house_bouncy.glb` | Bouncy Hills | Wonky candy-striped house on springs |
| `house_starry.glb` | Starry Woods | Hollow giant tree stump house with a moon-shaped window |
| `house_lava.glb` | Lava Meadow | Black stone house with glowing lava cracks |
| `house_tower.glb` | Wizard Tower | Tall crooked wizard tower with a star-topped spire |

### 7.2 Landmarks (seen from far away)
4,000 to 8,000 triangles, `lod1` about 1,500, with `col`.

| File | Look | Moving parts |
|---|---|---|
| `landmark_gear.glb` | 18 m steel tower with a giant golden gear on top | `gear` (spins around local Z) |
| `landmark_crystal.glb` | 14 m ice crystal spire, glowing from inside | none (glow in `landmark_crystal_main`'s emissive texture) |
| `landmark_yoyo.glb` | 22 m wooden pole with a giant yo-yo bobbing on a string | `yoyo` (moves along Y) |
| `landmark_volcano.glb` | 18 m tall, 24 m wide cartoon volcano with a lava crater | crater in `lava` material; empty `smoke` at the top |

### 7.3 Interactive pieces (shared by all worlds)
All 500 to 2,500 triangles, materials exactly as listed in section 12.

| File | Size | Parts and behavior |
|---|---|---|
| `button.glb` | 4.4 m pad | Yellow base and a big red dome `cap` (origin at its bottom, the game pushes it down) |
| `gate.glb` | 6 x 3 x 1 m | Frame `gate_frame` and bars `gate_bars` (origin at the bottom, the game slides them into the ground) |
| `drawbridge_leaf.glb` | 6 x 3.5 m deck | One half of the drawbridge, origin at its hinge edge, lifts around local X |
| `stepping_stone.glb` | 2 m across | Lava stepping stone, origin at its top center |
| `spring_pad.glb` | 4 m across | Base `pad_base`, coil `spring` (origin at the bottom, squashes along Y), arrow `arrow` pointing +Z |
| `teleport_pad.glb` | 3.2 m across | Ring `pad_ring` in `pad_glow` (the game recolors it per pair) and a disc in `swirl` |
| `portal.glb` | 5 m tall ring | Ring `portal_ring`, center disc in the `swirl` material (the game spins its texture) |
| `star_pickup.glb` | 1.2 m | Chunky golden star with a soft glow |
| `conveyor.glb` | 4 x 4 m tile | Belt surface in the `belt` material with arrows; side rails |
| `gear_roller.glb` | 3.6 m across | Rolling gear, origin at its axle (turns around local Z) |
| `boulder.glb` | 3.2 m across | Rolling boulder |

### 7.4 Prize items (one per house)
1,000 to 2,000 triangles, 2 materials, about 0.6 m across, shiny with a soft glow: `item_key.glb` (Robot Key), `item_boots.glb` (Snow Boots), `item_string.glb` (Yo-yo String spool), `item_hat.glb` (Wizard Hat), `item_scale.glb` (Dragon Scale), `item_map.glb` (Gecko Land Map scroll).

---

## 8. World scenery kits

### 8.1 Modular grid
- Wall and building pieces snap to a **2 m grid.** Their origin is the **bottom-left-front corner**, and their size is a whole number of grid squares (for example 2 x 2 x 4 m).
- Props (trees, rocks) use the center-of-footprint origin and have `col` and, if over 500 triangles, `lod1`.

### 8.2 Shared texture per world
- **All small props of one world share one 1024 x 1024 atlas** (`<world>_props` material). This keeps each prop type to one or two instanced draw calls.
- Deliver variants as separate files so they can be instanced (`tree_pine_a`, `tree_pine_b`...).

### 8.3 Pieces per world

| World | Files (triangle budget each) |
|---|---|
| **Gear City** | `building_a/b/c/d` (2,000 to 3,000; city buildings 8 to 16 m tall with window texture and rooftop details), `crate_a/b` (200), `fence_metal` (2 m segment, 150), `street_lamp` (400, emissive bulb), `pipe_bend` (300), `gear_small` (400), `barrel` (300), `robot_tree` (a metal "tree" of bolts and gears, 900) |
| **Frosty Peaks** | `tree_pine_a/b/c` (1,000 to 1,500, snow on branches), `rock_snow_a/b/c` (300 to 600), `ice_rock_a/b` (400, translucent blue look painted, not real transparency), `cliff_snow` (2,500, 10 m wide), `snowdrift` (150), `igloo` (1,500) |
| **Bouncy Hills** | `tree_round_a/b/c` (900 to 1,500), `bush_a/b` (300), `flower_patch` (80), `fence_wood` (2 m segment, 150), `hedge` (2 m segment, 300), `mushroom_bouncy` (500), `windmill_small` (1,500, `blades` spin around Z) |
| **Starry Woods** | `tree_crooked_a/b/c` (1,200 to 1,800), `mushroom_glow_a/b/c` (300 to 600, caps glow through the emissive texture), `hedge_dark` (2 m segment, 300), `firefly_jar` (300, emissive), `log` (300), `fern` (150, alpha) |
| **Lava Meadow** | `rock_volcanic_a/b/c` (300 to 600), `tree_dead_a/b` (800), `lava_crack` (decal-like flat piece, 100, `lava` material), `bones_silly` (300, cartoon fish skeleton), `steam_vent` (300, empty `steam`) |
| **Wizard Tower** | `wall_stone` (2 m segment, 300), `wall_stone_corner` (300), `crystal_a/b/c` (300 to 500, emissive), `banner` (300, star pattern), `torch_stand` (300, empty `flame`), `book_pile` (400) |
| **Gecko Land (ending)** | `tree_lush_a/b` (1,500), `flower_a/b/c` (60), `gecko_house` (2,500, a cozy home with a round door), `picnic_blanket` (100) |
| **Everywhere** | `grass_tuft_a/b` (20 to 40, alpha cutout card cross; one per ground type: tint in texture), `pebble` (20) |

### 8.4 Puzzle room kits

| File | Size | Notes |
|---|---|---|
| `room_wall` | 2 x 4 m segment | Spooky wallpaper texture; one variant per room theme: `room_wall_lava`, `room_wall_ice`, `room_wall_lever`, `room_wall_mirror` |
| `room_floor` | 2 x 2 m tile | Variants per theme (stone, ice, wood, magic tiles) |
| `room_torch` | 1 m | Wall torch, empty `flame` |
| `cobweb_corner` | 2 m | `_alpha` cutout |
| `hex_stone` | 2 m across | Lava room stepping stone (the game lights its top: put the top face in its own `hex_top` material) |
| `ice_rock` | 1.8 m | Ice room blocker |
| `snowflake_pickup` | 1 m | Glowing snowflake |
| `lever` | 1.6 m tall | `lever_base`, `handle` (origin at the hinge, tips around local X), `lamp` (material `lever_lamp`, the game sets its color) |
| `mirror_stand` | 2.2 m wide | `mirror_base` and `mirror` (origin at the center, turns around local Y), mirror face in `mirror_glass` |
| `crystal_target` | 1.8 m | Crystal in `crystal_glow`, which the game lights up when the beam hits it |
| `beam_emitter` | 1.4 m | Brass light cannon, empty `beam_start` |
| `candle_big` | 1 m | `wax` (origin at the bottom, the game shrinks it along Y), empty `flame` |

---

## 9. Tiling textures (images, not models)

PNG, 1024 x 1024, **seamless tiling**, base color plus optional normal map. Hand-painted style matching the models. Each ground set includes a variation so repeating is not obvious.

| File | Use |
|---|---|
| `ground_plates.png` | Gear City metal plates with bolts and a few grass cracks |
| `ground_snow.png` | Soft snow with blue shading and sparkle flecks |
| `ground_grass.png` | Bright grass with painted clumps |
| `ground_night.png` | Dark blue-green moss with tiny glowing specks |
| `ground_ash.png` | Dark red-brown ash with faint glowing cracks |
| `ground_stone.png` | Purple-gray flagstones |
| `ground_rock.png` | Gray-brown rock (the game uses it on steep slopes in every world) |
| `road_<world>.png` | One road or path texture per world (asphalt, packed snow, dirt path, moss path, cinder path, tiles) |
| `water.png`, `lava.png` | Tiling surfaces the game scrolls |
| `sky_clouds.png` | 2048 x 1024, soft cartoon clouds on transparent background |

---

## 10. What I do after delivery

So you do not have to worry about compression or engine details:

- **Check** every file automatically against this spec (triangles, materials, names, bones, clips, sizes) and report anything off. The checker will be in the repo as `tools/check-models.mjs`.
- **Compress** for the web: mesh compression, textures converted to WebP and resized if needed. Final files usually shrink to 20 to 30 percent of their original size.
- **Wire up** each model in the game: animations, face expressions, tinting, wheel spin and steering, suspension, collision from `col`, distance switching from `lod1`, and instanced drawing for repeated scenery.
- **Style pass in code:** soft sky, matching fog, warm sun with soft shadows, a gentle rim light, glow on emissive parts, and particles (dust, snow, embers, fireflies, sparkles).

---

## 11. Delivery checklist

Put files in these folders in `assets/`:

```
assets/models/characters/   tyler, skyler, nick, pip, mo, zazz
assets/models/villains/     dragon, snowgun, yoyo, wizard, ghost, tall-robot
assets/models/vehicles/     kart, snowmobile, buggy, glider, tractor, carpet
assets/models/houses/       house_gear, house_frosty, house_bouncy, house_starry, house_lava, house_tower
assets/models/landmarks/    landmark_gear, landmark_crystal, landmark_yoyo, landmark_volcano
assets/models/pieces/       button, gate, drawbridge_leaf, stepping_stone, spring_pad, teleport_pad,
                            portal, star_pickup, conveyor, gear_roller, boulder
assets/models/items/        item_key, item_boots, item_string, item_hat, item_scale, item_map
assets/models/scenery/<world>/   the kit pieces in section 8.3
assets/models/rooms/        the room pieces in section 8.4
assets/textures/            the images in section 9
```

Also include **`assets/models/manifest.json`** listing, for each file: triangle count, material names, bounding box size in meters, bone count, and clip names with lengths.

**Suggested order** (most visible improvement first):
1. The six friends and the four villains (with rigs, faces and clips).
2. The six vehicles (the buggy is still missing).
3. Gear City's kit, house and pieces, as a pilot so we can check the grid and sizes together.
4. The other five worlds' kits and houses.
5. Rooms, items and textures.

---

## 12. Exact material list for every model

If a model is not listed here, it has `<name>_main` only (plus `<name>_alpha` if it has cut-out leaves, grass or cobwebs). "Special" materials are the ones the game changes while playing (section 2.3).

| Model | General materials | Special materials | Total |
|---|---|---|---|
| tyler, skyler, nick, pip | `<id>_main` | `eyes`, `mouth` | 3 |
| mo | `mo_main`, `mo_alpha` (scarf fringe, optional) | `eyes`, `mouth` | 3 to 4 |
| zazz | `zazz_main` (claws, crest) | `skin_tint`, `eyes`, `mouth` | 4 |
| dragon, snowgun, yoyo, wizard | `<id>_main` | `eyes`, `mouth` | 3 |
| ghost | none | `ghost_main` (alpha blend), `eyes`, `mouth` | 3 |
| tall-robot | `robot_main` (screen glow in its emissive texture) | `robot_glow` (blinking bulb), `eyes` (screen face) | 3 |
| kart, buggy, tractor, glider | `<id>_main` (headlights, lantern, antenna tip glow in emissive) | `paint` | 2 |
| snowmobile | `snowmobile_main` (windshield painted, headlights in emissive) | `paint`, `belt` (track) | 3 |
| carpet | `carpet_main`, `carpet_alpha` (tassel fringe) | `paint` | 3 |
| house_* | `<house>_main` (windows in emissive), `<house>_alpha` (cobwebs) | none | 2 |
| landmark_gear, landmark_crystal, landmark_yoyo | `<id>_main` | none | 1 |
| landmark_volcano | `landmark_volcano_main` | `lava` (crater) | 2 |
| button, gate, drawbridge_leaf, stepping_stone, spring_pad, gear_roller, boulder, star_pickup | `<id>_main` | none | 1 |
| teleport_pad | `teleport_pad_main` | `pad_glow` (ring), `swirl` (disc) | 3 |
| portal | `portal_main` | `swirl` (disc) | 2 |
| conveyor | `conveyor_main` (rails) | `belt` | 2 |
| item_* | `<id>_main` (shine in emissive) | none | 1 |
| hex_stone | `hex_stone_main` | `hex_top` | 2 |
| lever | `lever_main` | `lever_lamp` | 2 |
| mirror_stand | `mirror_main` | `mirror_glass` | 2 |
| crystal_target | `crystal_target_main` (base) | `crystal_glow` | 2 |
| lava_crack | none | `lava` | 1 |
| tree_*, fern, cobweb_corner, grass_tuft_* | `<world>_props` (shared per world, section 8.2), `<world>_props_alpha` | none | 2 |
| other scenery props | `<world>_props` (shared per world) | none | 1 |

Note for the friends and villains: the hard cap in section 3 is 4, so there is room for `<id>_alpha` if a design truly needs a cut-out (a fringe or wispy fur). Do not use that room for anything else.

