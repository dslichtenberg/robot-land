// laser.js
// The car's laser beam effect (the Robot Key power). Only looks: what the
// beam hits is worked out in world.zap().
//
// A white-hot core inside a pink glow and a faint haze, a flash at the
// front of the car, and a burst of sparks where the beam ends. The beam
// shoots out fast, flickers, then thins and fades.

import * as THREE from 'three';

const DURATION = 0.4;   // seconds the whole effect lasts
const GROW = 0.07;      // seconds for the beam to reach its full length
const SPARKS = 16;

// A soft round dot, white in the middle and clear at the edge.
let dotTexture = null;
function dot() {
  if (dotTexture) return dotTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(c);
  dotTexture.colorSpace = THREE.SRGBColorSpace;
  return dotTexture;
}

// Additive glow brightens what is behind it; on light ground that washes
// out to pastel, so the colored layers blend normally and only the white
// core and sparks are additive.
const glowMat = (color, opacity, map, add) => {
  const opts = { color, transparent: true, opacity, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, fog: false, toneMapped: false };
  if (map) opts.map = map;
  return opts;
};

export function makeLaser(scene) {
  // Tubes along +Y from 0 to 1, tipped over to point along +Z, then turned to the car's heading.
  const tube = (r) => { const geo = new THREE.CylinderGeometry(r, r, 1, 16, 1, true); geo.translate(0, 0.5, 0); return geo; };
  const yaw = new THREE.Group(), tilt = new THREE.Group();
  tilt.rotation.x = Math.PI / 2;
  yaw.add(tilt);
  // Soft edges from stacked see-through tubes, outside in.
  const layers = [[0.85, '#c21cff', 0.14], [0.55, '#ff1fc8', 0.28], [0.32, '#ff3dd6', 0.6], [0.2, '#ff9af0', 0.9], [0.09, '#ffffff', 1, true]]
    .map(([r, color, opacity, add], i) => {
      const m = new THREE.Mesh(tube(r), new THREE.MeshBasicMaterial(glowMat(color, opacity, null, add)));
      m.userData.opacity = opacity; m.renderOrder = 5 + i; m.frustumCulled = false; tilt.add(m);
      return m;
    });

  const flash = new THREE.Sprite(new THREE.SpriteMaterial(glowMat('#ff4fe0', 1, dot())));
  const flashCore = new THREE.Sprite(new THREE.SpriteMaterial(glowMat('#ffffff', 1, dot(), true)));
  const impact = new THREE.Sprite(new THREE.SpriteMaterial(glowMat('#ff2fd0', 1, dot())));
  const impactCore = new THREE.Sprite(new THREE.SpriteMaterial(glowMat('#ffffff', 1, dot(), true)));
  [flash, flashCore, impact, impactCore].forEach((m, i) => { m.renderOrder = 10 + i; });
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ ...glowMat('#ffd0f7', 1, dot(), true), size: 0.6, sizeAttenuation: true }));
  sparks.frustumCulled = false;
  const vel = Array.from({ length: SPARKS }, () => new THREE.Vector3());

  const root = new THREE.Group();
  root.add(yaw, flash, flashCore, impact, impactCore, sparks);
  root.visible = false;
  scene.add(root);

  let start = -1, range = 1;
  const end = new THREE.Vector3();

  return {
    // from: where the beam starts (a Vector3), heading: the car's angle, length: how far it reaches.
    fire(from, heading, length, now) {
      start = now; range = length;
      yaw.position.copy(from); yaw.rotation.y = heading;
      flash.position.copy(from); flashCore.position.copy(from);
      end.set(from.x + Math.sin(heading) * length, from.y, from.z + Math.cos(heading) * length);
      impact.position.copy(end); impactCore.position.copy(end);
      const p = sparkGeo.attributes.position;
      for (let i = 0; i < SPARKS; i++) {
        p.setXYZ(i, end.x, end.y, end.z);
        const a = Math.random() * Math.PI * 2, up = Math.random();
        vel[i].set(Math.cos(a) * (2 + Math.random() * 4), 2 + up * 5, Math.sin(a) * (2 + Math.random() * 4));
      }
      p.needsUpdate = true;
      root.visible = true;
    },
    // Keep the beam coming out of the front of the car while it moves.
    follow(from, heading) {
      if (!root.visible) return;
      yaw.position.copy(from); yaw.rotation.y = heading;
      flash.position.copy(from); flashCore.position.copy(from);
      impact.position.set(from.x + Math.sin(heading) * range, from.y, from.z + Math.cos(heading) * range);
      impactCore.position.copy(impact.position);
    },
    get on() { return root.visible; },
    update(now, dt) {
      if (!root.visible) return;
      const age = now - start;
      if (age > DURATION || age < 0) { root.visible = false; return; }
      const grow = Math.min(1, age / GROW);
      const fade = age < 0.12 ? 1 : 1 - (age - 0.12) / (DURATION - 0.12);
      const flicker = 0.85 + Math.sin(age * 90) * 0.15;
      const thin = 0.35 + 0.65 * fade;
      layers.forEach((m, i) => {
        m.scale.set(thin, range * grow, thin);
        m.material.opacity = m.userData.opacity * fade * (i < 4 ? flicker : 1);
      });
      const f = Math.max(0, 1 - age / 0.22);
      flash.scale.setScalar(2.8 * f + 0.4); flash.material.opacity = f * 0.9;
      flashCore.scale.setScalar(1.4 * f + 0.2); flashCore.material.opacity = f;
      // The burst at the far end starts when the beam gets there.
      const hit = grow >= 1;
      impact.visible = impactCore.visible = sparks.visible = hit;
      if (hit) {
        const k = (age - GROW) / (DURATION - GROW);
        impact.scale.setScalar(1.6 + k * 3.2);
        impact.material.opacity = Math.max(0, 1 - k) * 0.85;
        impactCore.scale.setScalar(1.3 * (1 - k) + 0.2);
        impactCore.material.opacity = Math.max(0, 1 - k * 1.5);
        sparks.material.opacity = Math.max(0, 1 - k);
        const p = sparkGeo.attributes.position;
        for (let i = 0; i < SPARKS; i++) {
          vel[i].y -= 14 * dt;
          p.setXYZ(i, p.getX(i) + vel[i].x * dt, Math.max(end.y - 1.2, p.getY(i) + vel[i].y * dt), p.getZ(i) + vel[i].z * dt);
        }
        p.needsUpdate = true;
      }
    },
  };
}
