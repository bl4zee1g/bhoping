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
// [rotation deg from item.json, z along the receiver toward the muzzle, y up], AK model space
const STICKERS = [[-90, -0.030, 0.062], [93, 0.040, 0.064], [-105, 0.110, 0.060], [78, 0.180, 0.064]];
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

let rig, mixer, clipMap = {}, weaponRoot, stkRoot;
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
  const akColor = tex('assets/tex/ak_color.jpg');
  const akORM = tex('assets/tex/ak_orm.png', false);
  const akNormal = tex('assets/tex/ak_normal.jpg', false);
  let akWeaponBone;
  for (const m of akMeshes) {
    if (/sticker_gaps/.test(m.material.name)) { m.visible = false; }
    else {
      m.material = new THREE.MeshPhysicalMaterial({
        map: akColor, normalMap: akNormal, normalScale: new THREE.Vector2(0.85, -0.85),
        aoMap: akORM, roughnessMap: akORM, metalnessMap: akORM, roughness: 1, metalness: 1,
        envMapIntensity: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.35,
      });
    }
    akWeaponBone = m.skeleton.bones.findIndex((b) => b.name === 'weapon');
    const ibm = m.skeleton.boneInverses[akWeaponBone].clone();
    bindToRig(m);
    window.__akIBM = ibm;
  }

  // Foil stickers: four decals on the receiver's camera-facing side. Rotations are the ones
  // from item.json; positions follow the in-game slot band on the front half of the receiver.
  const stkTex = await texLoader.loadAsync('assets/tex/sticker_lightning.png');
  stkTex.colorSpace = THREE.SRGBColorSpace;
  stkTex.anisotropy = 8;
  const stkMat = new THREE.MeshStandardMaterial({
    map: stkTex, transparent: true, depthWrite: false, roughness: 0.3, metalness: 0.35,
    envMapIntensity: 1.2, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const stkGeo = new THREE.PlaneGeometry(0.072, 0.082);
  stkRoot = new THREE.Group();
  stkRoot.matrixAutoUpdate = false;
  stkRoot.matrix.copy(window.__akIBM);
  rigBones.get('weapon').add(stkRoot);
  const faceX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  for (const [deg, z, y] of STICKERS) {
    const s = new THREE.Mesh(stkGeo, stkMat);
    s.position.set(0.0305, y, z);
    s.quaternion.copy(faceX).multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(deg)));
    stkRoot.add(s);
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
// attachment point in AK model space (x = sticker side, y = up, z = toward muzzle)
const CHARM_ATTACH = new THREE.Vector3(0.040, 0.095, 0.180);
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
  window.__vm = { renderer, play, idle, inspect, draw, drawInspect, rigBones, scene, camera, vm, charm, stkRoot };
  msg('Ready');
  $('start').style.display = '';
  $('start').onclick = async () => {
    if (actx && actx.state !== 'running') await actx.resume();
    $('status').classList.add('hide');
    drawInspect();
  };
  frame();
}).catch((e) => { console.error(e); msg('Error: ' + e.message); });
