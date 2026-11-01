# Robot Land to Gecko Land — v2.2 asset delivery

Procedural, stylized game assets built against `assets/specs/MODEL_SPEC_v2.2.md`.
Earlier exports outside the category folders are retained for comparison and are not in the delivery archive.

## Contents

146 embedded GLB 2.0 models: six friends, four villains, ghost, hint robot, six vehicles, six themed houses, four landmarks, 11 interactive pieces, six prizes, 18 room pieces, all seven world kits, and shared scenery. Ground-specific grass variants bring the scenery count to 83.

31 PNG textures: seven ground types and seven road types with alternate variants, water, lava, and transparent clouds.

`manifest.json` records actual triangles, active lod0 triangles, draw calls, materials, dimensions, bones, clips/durations, image sizes/hashes, and file sizes. `validation-v2.json` contains the structural checker's findings. Contact sheets are in `v2-previews/`.

## Coordinates and runtime use

Y up, +Z forward, meters. Ground origins are centered; modular wall/floor/building fronts use the corner convention. The drawbridge uses its hinge origin and stepping stones use their top-center origin.

Tint the neutral vehicle `paint` material. Zazz is intentionally gray: tint `skin_tint`; `zazz_main` retains the pale/gold accents.

Wheels are exactly `wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`, one primitive each, with their origins at their axle centers. Spin on local X. The front wheels are children of `steer_FL`/`steer_FR`, turning on local Y. Tires and rims share the main atlas. `body` carries the non-wheel parts. Empty `seat` is the driver's hips attachment point; play the driver's drive clip there.

Moth wings are `wing_L`/`wing_R`, rooted at their inner joints, flapping on Z. Springs squash on Y; skis tilt on X. Antenna and handlebar pivots are embedded. The carpet has `carpet_1` through `carpet_5`, four named tassels, and the one-second `ripple` clip.

Eyes/mouth use the top-left tile of their embedded 2x2 sheets. Sample the other quarters for blink/grin, happy/surprised, and worried/frown.

**Hide `col` at load time. Show one of `lod0` and `lod1`, not both.** The preview renderer follows this rule. Interactive nodes beside the LOD meshes remain available for game animation.

World props use identical embedded atlas pixels within each world; image hashes in the manifest allow texture-resource reuse after loading. Files deliberately retain PNGs and plain meshes for your compression pipeline.

Constant glow uses emissive textures on main materials. Runtime-controlled special materials retain their exact names from section 12. Windshields are painted and opaque. Ghost body uses alpha blending; expression/foliage/cobweb cutouts use alpha masks.

## Validation and limits

The checker covers required-file presence, GLB structure, unique names, exact material lists/counts, embedded power-of-two images, UV/normal attributes, normalized four-weight skinning, required bones/clips/markers, looping endpoints, main triangle/file budgets, and the wheel steering hierarchy.

Selected exported models and seated/cheering/waving poses were re-imported for rendered review. This is not an exhaustive visual certification of every animation frame, UV island, or intersection. These are procedurally authored assets; a hand-sculpted/hand-painted art pass is not included. Full in-game motion review and the 60 FPS iPad target require integration and device testing.

Driving speed, traction, bounce, hover, particles, runtime lights, tinting, expressions, and LOD switching remain game behaviors, as described in section 10 of the specification.

## Rebuild

Sources are in `tools/`. Use Blender 5 with `build_v2_assets.py -- --category <category>`. The two earlier build scripts supply geometry helpers and are included. Python with NumPy/Pillow builds the surface textures and contact sheets.

Run `node tools/check-models.mjs` from the extracted project root to regenerate the manifest and validation report. It invokes Python 3 with NumPy and exits unsuccessfully if structural errors are found. `render_v2_batch.py` renders review samples from the exported GLBs.
