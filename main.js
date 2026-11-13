import * as THREE from 'three';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './vendor/jsm/controls/OrbitControls.js';

const FPS = 30;                       // CS2 clip frame rate; event times in the clips are frames
const $ = (id) => document.getElementById(id);
const msg = (t) => ($('msg').textContent = t);

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;   // the page CSS provides the studio backdrop
const pmrem = new THREE.PMREMGenerator(renderer);
// Neutral studio env: a dark box with three soft white panels. RoomEnvironment has
// bright, coloured panels that turn leather and skin flat white on the highlight side.
function studioEnv() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12),
    new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x0b0d11 })));
  const panel = (w, h, k, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(k) }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(7, 3.5, 5.0, [-2.6, 3.2, 2.0]);   // key softbox, upper left, in front
  panel(3, 5, 1.6, [3.4, 0.6, -1.4]);      // cool fill, right/behind
  panel(7, 2, 0.7, [0, -2.6, 1.6]);        // floor bounce
  return pmrem.fromScene(s, 0.02).texture;
}
scene.environment = studioEnv();
// dim environment: the inspect view is lit by a soft key, not a bright room, so specular
// stays in the highlights instead of washing the leather and glove leather flat white
scene.environmentIntensity = 0.75;
// camera looks down +Z, so lights are placed in viewmodel space
const key = new THREE.DirectionalLight(0xeef3ff, 2.0);
key.position.set(-0.4, 1.3, 0.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.004;
Object.assign(key.shadow.camera, { near: 0.02, far: 3, left: -0.7, right: 0.7, top: 0.7, bottom: -0.7 });
key.shadow.camera.updateProjectionMatrix();
scene.add(key);
const rim = new THREE.DirectionalLight(0xc2d4ff, 0.7);
rim.position.set(0.9, 0.25, -0.5);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
fill.position.set(0.5, -0.4, 0.5);
scene.add(fill);

// Viewmodel space: Source (x fwd, y left, z up) -> glTF (+z fwd, +x left, +y up), so the
// camera sits at the origin and looks down +Z. CS2 default viewmodel_fov 68 @ 4:3 => 54deg vertical.
const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.005, 20);
camera.rotation.y = Math.PI;
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;
camera.position.set(0, 0, 0);
camera.rotation.set(0, Math.PI, 0);   // OrbitControls' constructor resets orientation

// The inspect view sits further back than a live viewmodel: the whole gun reads at once and
// the hands stay inside the frame. zoom keeps the 68deg perspective and only changes scale.
const VM_ZOOM = 0.7;
function setFov(h) {
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(h / 2)) * 0.75));
  camera.zoom = VM_ZOOM;
  camera.updateProjectionMatrix();
  $('fovLabel').textContent = h;
}
setFov(68);

// viewmodel_offset (2.5, 0, -1.5) inches: right / forward / up, pulled right so the gun sits
// in the lower-right like the in-game inspect camera
const vm = new THREE.Group();
vm.position.set(-0.1, 0.0, 0);
scene.add(vm);

// ---------------------------------------------------------------- loading
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const mgr = new THREE.LoadingManager();
// the game's own PNGs next to the .glb files are replaced by baked textures below
mgr.setURLModifier((u) => (u.endsWith('.png') && !u.includes('/charm/') && !u.startsWith('data:') ? BLANK : u));
const gltfLoader = new GLTFLoader(mgr);
const texLoader = new THREE.TextureLoader();
const load = (u) => gltfLoader.loadAsync(u);
function tex(u, srgb = true) {
  const t = texLoader.load(u);
  t.flipY = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CLIPS = ['idle_ak', 'draw_ak', 'lookat01_ak', 'lookat03_ak', 'lookat01_draw_ak', 'lookat03_draw_ak'];
// Foil stickers, exactly as the game places them: sampled in the receiver's sticker UV set
// (TEXCOORD_1). centre = 0.5 + slot default offset (weapon_rif_ak47.vmat g_vStickerNOffset) +
// item.json offset; scale = stickers across the UV set (g_vStickerNScale); rotation from item.json.
// [rotation deg, centre u, centre v, scale]
const STICKERS = [
  [87, 0.5007, 0.0678, 12.90, 0.0173, 0.0591, 0.1844],
  [-87, 0.5508, 0.0528, 14.27, 0.0181, 0.0736, 0.1361],
  [-78, 0.6691, 0.0548, 13.45, 0.0182, 0.0717, 0.0219],
  [102, 0.6143, 0.0597, 12.31, 0.0189, 0.0669, 0.0747],
];
// [4..6]: the same centres in AK model space. The sticker UV set overlaps other parts of the
// mesh, so a sticker only draws within STK_RADIUS of its 3D centre.
const STK_RADIUS = 0.055;
const SOUND_FILES = {
  m1: 'movement1', m2: 'movement2', m3: 'movement3', draw: 'ak47_draw', bolt: 'ak47_boltpull_01',
};
// sound events per clip, in frames (read from the .vnmclip event tracks)
const INSPECT1 = [[2, 'm3'], [66, 'm1'], [105, 'm2']];
const INSPECT3 = [[6, 'm3'], [25, 'm1'], [100, 'm2']];
const EVENTS = {
  lookat01_ak: INSPECT1, lookat01_draw_ak: INSPECT1,
  lookat03_ak: INSPECT3, lookat03_draw_ak: INSPECT3,
  draw_ak: [[5, 'draw'], [8, 'bolt']],
};

let rig, mixer, clipMap = {}, weaponRoot;
const stkMeshes = [];
const rigBones = new Map();

function skinnedMeshes(root, filter) {
  const out = [];
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    for (let p = o; p; p = p.parent) if (p.name && /legacy|worldmodel/.test(p.name)) return;
    if (!filter || filter(o)) out.push(o);
  });
  return out;
}

// Re-skin a mesh from another glb onto the animated viewmodel rig, matching bones by name.
// Bones missing from the rig (twist helpers) are created under their source parent.
function bindToRig(mesh) {
  const srcBones = mesh.skeleton.bones;
  const made = new Map();
  const map = (b) => {
    if (rigBones.has(b.name)) return rigBones.get(b.name);
    if (made.has(b)) return made.get(b);
    const nb = new THREE.Bone();
    nb.name = b.name;
    nb.position.copy(b.position); nb.quaternion.copy(b.quaternion); nb.scale.copy(b.scale);
    made.set(b, nb);
    (b.parent && b.parent.isBone ? map(b.parent) : rig.scene).add(nb);
    return nb;
  };
  const bones = srcBones.map(map);
  const skel = new THREE.Skeleton(bones, mesh.skeleton.boneInverses);
  mesh.removeFromParent();
  mesh.bindMode = THREE.DetachedBindMode;
  mesh.bind(skel, new THREE.Matrix4());
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);  // detached binding: bones already carry the viewmodel offset
  return mesh;
}

async function init() {
  msg('Loading animation rig…');
  const rigGltf = await load('assets/anim/lookat01_ak.glb');
  rig = rigGltf;
  skinnedMeshes(rig.scene).forEach((m) => m.removeFromParent());
  rig.scene.traverse((o) => { if (o.name && !rigBones.has(o.name)) rigBones.set(o.name, o); });
  vm.add(rig.scene);

  mixer = new THREE.AnimationMixer(rig.scene);
  for (const name of CLIPS) {
    const g = name === 'lookat01_ak' ? rigGltf : await load(`assets/anim/${name}.glb`);
    const clip = g.animations[0];
    clip.name = name;
    clipMap[name] = clip;
  }

  // the AK's own skeleton is a secondary skeleton attached to the viewmodel's `wpn` bone
  weaponRoot = [...rigBones.values()].find((o) => /ak47vnmskel$/.test(o.name));
  // the secondary skeleton is stored in glTF axes; undo root_motion's Source->glTF axis swap
  weaponRoot.quaternion.copy(rigBones.get('root_motion').quaternion).invert();
  rigBones.get('wpn').add(weaponRoot);

  msg('Loading weapon…');
  const akGltf = await load('assets/ak47.glb');
  const akMeshes = skinnedMeshes(akGltf.scene);
  const akColor = tex('assets/tex/ak_color_game.jpg');
  const akORM = tex('assets/tex/ak_orm.png', false);
  const akNormal = tex('assets/tex/ak_normal.jpg', false);
  const akRough = tex('assets/tex/ak_rough_game.jpg', false);
  const stkTex = await texLoader.loadAsync('assets/tex/sticker_bolt_strike.png');
  stkTex.colorSpace = THREE.SRGBColorSpace;
  stkTex.flipY = false;
  stkTex.anisotropy = 8;
  stkTex.wrapS = stkTex.wrapT = THREE.ClampToEdgeWrapping;
  const stkU = window.__stkU = {
    uStk: { value: stkTex },
    uStkC: { value: STICKERS.map((s) => new THREE.Vector2(s[1], s[2])) },
    uStkS: { value: STICKERS.map((s) => s[3]) },
    uStkP: { value: STICKERS.map((s) => new THREE.Vector3(s[4], s[5], s[6])) },
    uStkR: { value: STICKERS.map((s) => -THREE.MathUtils.degToRad(s[0])) },
  };
  const patchStickers = (mat) => {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, stkU);
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'attribute vec2 stkUv;\nvarying vec2 vStkUv;\nvarying vec3 vStkP;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStkUv = stkUv;\nvStkP = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', `uniform sampler2D uStk;
uniform vec2 uStkC[4]; uniform float uStkS[4]; uniform float uStkR[4]; uniform vec3 uStkP[4];
varying vec2 vStkUv; varying vec3 vStkP;
void main() {`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float stkMask = 0.0;
for (int i = 0; i < 4; i++) {
  vec2 d = vStkUv - uStkC[i];
  float a = uStkR[i]; float cs = cos(a), sn = sin(a);
  vec2 p = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y) * uStkS[i] + 0.5;
  float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
  vec4 s = texture2D(uStk, clamp(p, 0.0, 1.0));
  float k = s.a * inside * step(distance(vStkP, uStkP[i]), ${STK_RADIUS.toFixed(3)});
  diffuseColor.rgb = mix(diffuseColor.rgb, s.rgb, k);
  stkMask = max(stkMask, k);
}`)
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, stkMask);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, stkMask);');
    };
  };
  let akWeaponBone;
  for (const m of akMeshes) {
    if (/sticker_gaps/.test(m.material.name)) { m.visible = false; }
    else {
      m.material = new THREE.MeshPhysicalMaterial({
        map: akColor, normalMap: akNormal, normalScale: new THREE.Vector2(0.85, -0.85),
        aoMap: akORM, roughnessMap: akRough, metalnessMap: akORM, roughness: 1, metalness: 1,
        envMapIntensity: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.35,
      });
      patchStickers(m.material);
      stkMeshes.push(m);
      m.geometry.setAttribute('stkUv', m.geometry.attributes.uv1);
    }
    akWeaponBone = m.skeleton.bones.findIndex((b) => b.name === 'weapon');
    const ibm = m.skeleton.boneInverses[akWeaponBone].clone();
    bindToRig(m);
    window.__akIBM = ibm;
  }

  msg('Loading gloves and arms…');
  const armsGltf = await load('assets/arms.glb');
  const gloveTex = tex('assets/tex/glove_color.jpg');
  const gloveNrm = tex('assets/tex/glove_normal.jpg', false);
  const armTex = tex('assets/tex/arm_color.jpg');
  const armNrm = tex('assets/tex/arm_normal.jpg', false);
  for (const m of skinnedMeshes(armsGltf.scene)) {
    const n = m.material.name;
    m.material = /glove/.test(n)
      ? new THREE.MeshStandardMaterial({ map: gloveTex, normalMap: gloveNrm, normalScale: new THREE.Vector2(1, -1), roughness: 0.68, metalness: 0.0, envMapIntensity: 0.45, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: armTex, normalMap: armNrm, normalScale: new THREE.Vector2(1, -1), roughness: 0.62, metalness: 0.0, envMapIntensity: 0.35, side: THREE.DoubleSide });
    bindToRig(m);
  }

  msg('Loading charm…');
  await initCharm();

  msg('Loading sounds…');
  await initAudio();
}

// ---------------------------------------------------------------- charm (pendulum)
const charm = { group: null, pivot: new THREE.Group(), dir: new THREE.Vector3(0, -1, 0), vel: new THREE.Vector3(), prev: null, prevVel: new THREE.Vector3() };
// charm pivot in AK model space (x = sticker side, y = up, z = toward muzzle), metres:
// model keychain attachment (weapon_rif_ak47.vmdl, origin 5.598,0.926,-0.742 in) + item.json offset (9.260,0.678,2.260 in), 0.0254 m/in
const CHARM_ATTACH = new THREE.Vector3(0.0407, 0.0385, 0.3774);
async function initCharm() {
  const g = await load('assets/charm/kc_wpn_ak_jelly.glb');
  g.scene.traverse((o) => {
    if (o.isMesh) {
      const m = o.material;
      m.metalness = /chain/.test(m.name) ? 0.9 : 0.1;
      m.roughness = /chain/.test(m.name) ? 0.35 : 0.2;
    }
  });
  charm.group = g.scene;
  charm.pivot.add(charm.group);
  scene.add(charm.pivot);
}

const akSpace = new THREE.Matrix4();
const tmp = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), baseQ = new THREE.Quaternion(), swingQ = new THREE.Quaternion();
function updateCharm(dt) {
  const wb = rigBones.get('weapon');
  if (!wb || !charm.group || dt <= 0) return;
  wb.updateWorldMatrix(true, false);
  akSpace.multiplyMatrices(wb.matrixWorld, window.__akIBM);        // AK model space -> world
  const pivotW = CHARM_ATTACH.clone().applyMatrix4(akSpace);
  akSpace.decompose(tmp, baseQ, new THREE.Vector3());
  // pivot acceleration -> effective gravity
  let acc = new THREE.Vector3();
  if (charm.prev) {
    const vel = pivotW.clone().sub(charm.prev).divideScalar(dt);
    acc = vel.clone().sub(charm.prevVel).divideScalar(dt);
    charm.prevVel.copy(vel);
  }
  charm.prev = pivotW.clone();
  const g = new THREE.Vector3(0, -9.8, 0).sub(acc.clampLength(0, 40)).normalize();
  // damped spring of the hang direction toward the effective gravity direction
  const steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const a = g.clone().sub(charm.dir).multiplyScalar(180).addScaledVector(charm.vel, -5.5);
    charm.vel.addScaledVector(a, h);
    charm.dir.addScaledVector(charm.vel, h).normalize();
  }
  const baseDown = new THREE.Vector3(0, -1, 0).applyQuaternion(baseQ);
  swingQ.setFromUnitVectors(baseDown, charm.dir);
  charm.pivot.position.copy(pivotW);
  charm.pivot.quaternion.copy(swingQ).multiply(baseQ);
  charm.pivot.scale.setScalar(1);
}

// ---------------------------------------------------------------- sticker editor
// Drag a sticker over the receiver to place it, wheel = scale, shift+wheel = rotate.
// The panel prints the STICKERS table to paste into this file.
function initStickerEditor() {
  const U = window.__stkU, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:12px;top:12px;z-index:9;background:#000a;color:#fff;font:12px monospace;padding:8px;border-radius:6px;max-width:420px';
  box.innerHTML = '<label><input type="checkbox" id="cStk"> Edit stickers</label> <button id="bStkCopy">Export</button><pre id="stkOut" style="margin:6px 0 0;white-space:pre-wrap"></pre>';
  document.body.appendChild(box);
  const out = box.querySelector('#stkOut');
  const modelInv = new THREE.Matrix4();
  const table = () => {
    const rows = STICKERS.map((s, i) => `  [${Math.round(-THREE.MathUtils.radToDeg(U.uStkR.value[i]))}, ${U.uStkC.value[i].x.toFixed(4)}, ${U.uStkC.value[i].y.toFixed(4)}, ${U.uStkS.value[i].toFixed(2)}, ${U.uStkP.value[i].x.toFixed(4)}, ${U.uStkP.value[i].y.toFixed(4)}, ${U.uStkP.value[i].z.toFixed(4)}],`);
    return 'const STICKERS = [\n' + rows.join('\n') + '\n];';
  };
  const refresh = () => { out.textContent = table() + (sel >= 0 ? `\nselected: ${sel + 1}` : ''); };
  let sel = -1, drag = false;
  const hit = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(stkMeshes, false)[0];
    if (!h || !h.uv1) return null;
    const wb = rigBones.get('weapon');
    wb.updateWorldMatrix(true, false);
    modelInv.multiplyMatrices(wb.matrixWorld, window.__akIBM).invert();
    return { uv: h.uv1, p: h.point.clone().applyMatrix4(modelInv) };
  };
  const pick = (h) => {
    let best = -1, bd = 0.06;
    U.uStkP.value.forEach((p, i) => { const d = p.distanceTo(h.p); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const on = () => box.querySelector('#cStk').checked;
  addEventListener('pointerdown', (e) => {
    if (!on() || e.target !== renderer.domElement) return;
    const h = hit(e); if (!h) return;
    const i = pick(h); if (i < 0) return;
    sel = i; drag = true; controls.enabled = false;
    e.stopImmediatePropagation(); refresh();
  }, true);
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    const h = hit(e); if (!h) return;
    U.uStkC.value[sel].set(h.uv.x, h.uv.y);
    U.uStkP.value[sel].copy(h.p);
    refresh();
  }, true);
  addEventListener('pointerup', () => { if (drag) { drag = false; controls.enabled = $('cFree').checked; } }, true);
  addEventListener('wheel', (e) => {
    if (!on() || sel < 0) return;
    const h = hit(e); if (!h || pick(h) !== sel) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.shiftKey) U.uStkR.value[sel] -= THREE.MathUtils.degToRad(Math.sign(e.deltaY) * 3);
    else U.uStkS.value[sel] *= e.deltaY > 0 ? 1.03 : 1 / 1.03;
    refresh();
  }, { capture: true, passive: false });
  box.querySelector('#bStkCopy').onclick = () => {
    const t = table();
    localStorage.setItem('stickers_export', t);
    window.__stkExport = t;
    navigator.clipboard?.writeText(t).catch(() => {});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' }));
    a.download = 'stickers_export.txt'; a.click();
    out.textContent = t + '\nEXPORTED';
  };
  refresh();
}

// ---------------------------------------------------------------- audio
let actx, buffers = {};
async function initAudio() {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  await Promise.all(Object.entries(SOUND_FILES).map(async ([k, f]) => {
    const r = await fetch(`assets/snd/${f}.wav`);
    buffers[k] = await actx.decodeAudioData(await r.arrayBuffer());
  }));
}
function playSound(k) {
  if (!$('cSound').checked || !buffers[k]) return;
  const src = actx.createBufferSource();
  const gain = actx.createGain();
  gain.gain.value = k === 'm1' || k === 'm2' || k === 'm3' ? 0.7 : 0.9;
  src.buffer = buffers[k];
  src.connect(gain).connect(actx.destination);
  src.start();
}

// ---------------------------------------------------------------- animation state
let current = null, lastTime = 0, variation = 1;
function play(name, { loop = false, fade = 0.08 } = {}) {
  const clip = clipMap[name];
  const next = mixer.clipAction(clip);
  next.reset();
  next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  next.clampWhenFinished = true;
  next.enabled = true;
  if (current && current !== next) next.crossFadeFrom(current, fade, false);
  next.play();
  current = next;
  current.userData = { name, last: 0 };
  next._name = name;
}
function idle() { play('idle_ak', { loop: true, fade: 0.15 }); }
const busy = () => current && current._name !== 'idle_ak';
const inspect = () => { if (!busy()) play(`lookat0${variation}_ak`); };
const draw = () => play('draw_ak');
const drawInspect = () => play(`lookat0${variation}_draw_ak`);
const cycle = () => { variation = variation === 1 ? 3 : 1; $('varLabel').textContent = variation; };

function pumpEvents() {
  if (!current) return;
  const name = current._name, ev = EVENTS[name];
  const t = current.time;
  if (ev) {
    const prev = current.userData.last;
    for (const [frame, k] of ev) {
      const ft = frame / FPS;
      if (prev <= ft && ft < t) playSound(k);
    }
  }
  current.userData.last = t;
}

// ---------------------------------------------------------------- UI
$('bInspect').onclick = inspect;
$('bVar').onclick = cycle;
$('bDraw').onclick = draw;
$('bDrawInspect').onclick = drawInspect;
$('cFree').onchange = (e) => {
  controls.enabled = e.target.checked;
  if (!controls.enabled) { camera.position.set(0, 0, 0); camera.rotation.set(0, Math.PI, 0); }
  else { camera.position.set(-0.45, 0.1, 0.45); controls.target.set(0, 0, 0.45); controls.update(); }
};
$('rFov').oninput = (e) => setFov(+e.target.value);
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === 'f') inspect(); else if (k === 'v') cycle(); else if (k === 'q') draw(); else if (k === 'r') drawInspect();
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mixer) {
    mixer.update(dt);
    pumpEvents();
    scene.updateMatrixWorld(true);
    updateCharm(dt);
  }
  if (controls.enabled) controls.update();
  renderer.render(scene, camera);
}

init().then(() => {
  mixer.addEventListener('finished', (e) => {
    if (e.action === current && current._name !== 'idle_ak') idle();
  });
  window.__vm = { renderer, play, idle, inspect, draw, drawInspect, rigBones, scene, camera, vm, charm };
  initStickerEditor();
  msg('Ready');
  $('start').style.display = '';
  $('start').onclick = async () => {
    if (actx && actx.state !== 'running') await actx.resume();
    $('status').classList.add('hide');
    drawInspect();
  };
  frame();
}).catch((e) => { console.error(e); msg('Error: ' + e.message); });
