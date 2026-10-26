import * as THREE from 'three';

// ---------- Sizes ----------
const PRESETS = [
  ['Vertical Poster', '8K 4320×7680', 4320, 7680], ['Vertical Poster', '4K DCI 2160×4096', 2160, 4096],
  ['Vertical Poster', '4K 2160×3840', 2160, 3840], ['Vertical Poster', '2K 1080×2048', 1080, 2048],
  ['Vertical Poster', 'Full HD 1080×1920', 1080, 1920], ['Vertical Poster', 'HD 720×1280', 720, 1280],
  ['Square Poster', '3000×3000', 3000, 3000], ['Square Poster', '2000×2000', 2000, 2000],
  ['Square Poster', '1200×1200', 1200, 1200], ['Square Poster', '1080×1080', 1080, 1080],
  ['Horizontal Banner', '8K 7680×4320', 7680, 4320], ['Horizontal Banner', '4K DCI 4096×2160', 4096, 2160],
  ['Horizontal Banner', '4K 3840×2160', 3840, 2160], ['Horizontal Banner', '2K 2048×1080', 2048, 1080],
  ['Horizontal Banner', 'Full HD 1920×1080', 1920, 1080], ['Horizontal Banner', 'HD 1280×720', 1280, 720],
  ['Print Poster', 'Six sheet 81×81 in', 81, 81, 1], ['Print Poster', 'Bus shelter 48×70 in', 48, 70, 1],
  ['Print Poster', 'Three sheet 41×81 in', 41, 81, 1], ['Print Poster', 'One sheet 27×40 in', 27, 40, 1],
  ['Print Poster', 'Half sheet 22×28 in', 22, 28, 1], ['Print Poster', 'Window card 14×22 in', 14, 22, 1],
];
const sizeEl = document.getElementById('size'), dpiEl = document.getElementById('dpi'), dpiBox = document.getElementById('dpiBox');
const fovEl = document.getElementById('fov'), info = document.getElementById('info'), bar = document.getElementById('bar');
let grp = null, og = null;
PRESETS.forEach((p, i) => {
  if (p[0] !== grp) { grp = p[0]; og = document.createElement('optgroup'); og.label = grp; sizeEl.appendChild(og); }
  og.appendChild(new Option(p[1], i, false, i === 2));
});
const preset = () => PRESETS[sizeEl.value];
function outSize() {
  const [, , w, h, inch] = preset();
  let W = inch ? Math.round(w * dpiEl.value) : w, H = inch ? Math.round(h * dpiEl.value) : h;
  const k = Math.min(1, 16000 / Math.max(W, H), Math.sqrt(2.4e8 / (W * H)));
  return [Math.round(W * k), Math.round(H * k), k < 1];
}

// ---------- Scene ----------
const W = 8, H = 5.5, L = 14, hw = W / 2, hl = L / 2, DX = 1.5;
const MAG = 0xff2bd6, CYA = 0x22b8ff, VIO = 0x8a3cff;
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
stage.appendChild(renderer.domElement);
const cv = renderer.domElement;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03010f);
scene.fog = new THREE.FogExp2(0x03010f, 0.045);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
camera.rotation.order = 'YXZ';

const S = 0.354;
const pyr = new THREE.ConeGeometry(0.25, 0.35, 4, 1, true);
pyr.rotateY(Math.PI / 4); pyr.translate(0, 0.175, 0);
const foam = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true });
const palette = [0x1c1160, 0x32157a, 0x4a1a90, 0x142a78, 0x26094f].map(c => new THREE.Color(c));
function panel(origin, u, v, lenU, lenV, normal, skip) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  const pts = [];
  for (let i = 0; i < Math.floor(lenU / S); i++)
    for (let j = 0; j < Math.floor(lenV / S); j++) {
      const p = origin.clone().addScaledVector(u, (i + .5) * S).addScaledVector(v, (j + .5) * S);
      if (!skip || !skip(p)) pts.push(p);
    }
  const mesh = new THREE.InstancedMesh(pyr, foam, pts.length);
  const m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  pts.forEach((p, i) => { m.compose(p, q, one); mesh.setMatrixAt(i, m); mesh.setColorAt(i, palette[(Math.random() * palette.length) | 0]); });
  scene.add(mesh);
}
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
panel(new THREE.Vector3(-hw, 0, -hl), Z, Y, L, H, X);
panel(new THREE.Vector3(hw, 0, -hl), Z, Y, L, H, X.clone().negate());
panel(new THREE.Vector3(-hw, 0, -hl), X, Y, W, H, Z, p => Math.abs(p.x - DX) < 0.95 && p.y < 2.6); // back wall, gap for the door
panel(new THREE.Vector3(-hw, 0, hl), X, Y, W, H, Z.clone().negate());
panel(new THREE.Vector3(-hw, H, -hl), X, Z, W, L, Y.clone().negate());

// Metal grate floor
const c = document.createElement('canvas'); c.width = c.height = 256;
const g = c.getContext('2d');
g.fillStyle = '#0b0a2a'; g.fillRect(0, 0, 256, 256);
g.strokeStyle = '#4b3ac0'; g.lineWidth = 3;
for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
g.lineWidth = 8; g.strokeRect(0, 0, 256, 256);
const tex = new THREE.CanvasTexture(c);
tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(W / .8, L / .8); tex.anisotropy = 8;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: tex, metalness: .75, roughness: .22, color: 0x6a58d0 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

// Neon lights
const neon = hex => new THREE.MeshBasicMaterial({ color: hex });
const box = (w, h, d, x, y, z, hex) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), neon(hex)); m.position.set(x, y, z); scene.add(m); return m; };
// soft additive glow for halos and floor reflections
const gc = document.createElement('canvas'); gc.width = gc.height = 64;
const gg = gc.getContext('2d');
const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
const glowTex = new THREE.CanvasTexture(gc);
function glow(x, y, z, hex, sx, sy, op = .5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.set(x, y, z); s.scale.set(sx, sy, 1); scene.add(s);
}
function floorGlow(x, z, hex, w, l, op = .3) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: glowTex, color: hex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .03, z); scene.add(m);
}
// ceiling strips: outer row (long) and inner row (thin, offset)
for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
  const col = (i + (s > 0 ? 1 : 0)) % 2 ? CYA : MAG, z = -5.5 + i * 2.6;
  box(.12, .04, 1.6, s * 2.3, H - .37, z, col);
  glow(s * 2.3, H - .6, z, col, 2.6, 1.6, .55);
  floorGlow(s * 2.3, z, col, 1.4, 3.4, .35);
}
for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
  const col = (i + (s > 0 ? 0 : 1)) % 2 ? VIO : CYA, z = -4.2 + i * 2.6;
  box(.05, .03, 1.1, s * 0.9, H - .37, z, col);
  glow(s * 0.9, H - .6, z, col, 1.6, 1.1, .35);
}
// floor neons and back corners
for (const s of [-1, 1]) {
  box(.06, .03, L - 1, s * (hw - .45), .02, 0, s < 0 ? MAG : CYA);
  box(1.8, .03, .06, s * (hw - 1.5), .02, -hl + .45, CYA);
  box(.04, 3.4, .04, s * (hw - .4), 1.7, -hl + .4, CYA);
  glow(s * (hw - 1.5), .25, -hl + .6, CYA, 2.4, .9, .6);
  glow(s * (hw - .5), 1.7, -hl + .6, CYA, .8, 3.8, .3);
}

// Lights: magenta on the left, green-turquoise on the right
scene.add(new THREE.AmbientLight(0x120a40, .35));
const lamp = (hex, i, x, y, z, d = 12) => { const l = new THREE.PointLight(hex, i, d, 2); l.position.set(x, y, z); scene.add(l); };
lamp(MAG, 14, -2.3, H - .8, -4, 10); lamp(CYA, 14, -2.3, H - .8, 1, 10);
lamp(CYA, 14, 2.3, H - .8, -4, 10);  lamp(MAG, 14, 2.3, H - .8, 1, 10);
lamp(VIO, 8, 0, H - 1, -5, 9);
lamp(MAG, 9, DX - .6, 1.8, -hl + 1.1, 6);   // door frame light
lamp(CYA, 5, -2.5, 1.2, -hl + 1.2, 6);

// ---------- Door (back wall, right of center) ----------
const dz = -hl + 0.08;
const dc = document.createElement('canvas'); dc.width = 256; dc.height = 512;
const dg = dc.getContext('2d');
dg.fillStyle = '#0c1a1d'; dg.fillRect(0, 0, 256, 512);
dg.strokeStyle = '#2e5a60'; dg.lineWidth = 2;
for (let y = 0; y < 512; y += 16) for (let x = 0; x < 256; x += 16) {
  const o = ((x + y) / 16) % 2 ? 0 : 8;
  dg.beginPath(); dg.moveTo(x + o, y + 2); dg.lineTo(x + o + 6, y + 10); dg.stroke();
}
const dtex = new THREE.CanvasTexture(dc);
const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, .08), new THREE.MeshStandardMaterial({ map: dtex, metalness: .6, roughness: .45 }));
door.position.set(DX, 1.1, dz); scene.add(door);
const dark = new THREE.MeshStandardMaterial({ color: 0x06060f, metalness: .5, roughness: .5 });
const part = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); scene.add(m); };
part(.1, 2.35, .16, DX - .72, 1.17, dz, dark);   // frame
part(.1, 2.35, .16, DX + .72, 1.17, dz, dark);
part(1.54, .1, .16, DX, 2.3, dz, dark);
const steel = new THREE.MeshStandardMaterial({ color: 0xc9d4dc, metalness: .9, roughness: .3 });
part(.2, .05, .06, DX - .45, 1.05, dz + .07, steel);  // handle
part(.05, .1, .05, DX - .55, 1.05, dz + .05, steel);
[.3, 1.1, 1.9].forEach(y => part(.05, .16, .05, DX + .68, y, dz + .06, steel)); // hinges (right)
// magenta neon frame around the door
box(.04, 2.42, .04, DX - .8, 1.21, dz + .1, MAG);
box(.04, 2.42, .04, DX + .8, 1.21, dz + .1, MAG);
box(1.64, .04, .04, DX, 2.42, dz + .1, MAG);
glow(DX, 1.2, dz + .3, MAG, 3.2, 3.8, .35);

// ---------- Controls ----------
const START = { x: 0, y: 2.0, z: 0.5, yaw: 0, pitch: 0 };
const pos = { ...START };
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyH') bar.classList.toggle('off'); if (e.code === 'KeyR') Object.assign(pos, START); });
addEventListener('keyup', e => { keys[e.code] = false; });
let drag = null;
cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointerup', () => drag = null);
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  pos.yaw -= (e.clientX - drag.x) * .003;
  pos.pitch = Math.max(-1.2, Math.min(1.2, pos.pitch - (e.clientY - drag.y) * .003));
  drag = { x: e.clientX, y: e.clientY };
});

// ---------- Preview ----------
function fit() {
  const [, , pw, ph] = preset();
  const r = pw / ph;
  let w = innerWidth, h = innerHeight;
  if (w / h > r) w = h * r; else h = w / r;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(Math.floor(w), Math.floor(h));
  camera.aspect = r; camera.fov = +fovEl.value; camera.updateProjectionMatrix();
  dpiEl.disabled = !preset()[4];                      // dpi only applies to print (inch) sizes
  dpiBox.style.opacity = preset()[4] ? '' : '.4';
  const [ow, oh, cut] = outSize();
  info.textContent = `Will save: ${ow}×${oh} px${cut ? ' (reduced to browser limit)' : ''} · Drag: look · WASD: move · Q/E: down/up · R: reset · H: hide bar`;
}
sizeEl.onchange = () => { fovEl.value = preset()[2] > preset()[3] ? 55 : 70; fit(); };
dpiEl.onchange = fovEl.oninput = fit;
addEventListener('resize', fit);

// ---------- Save PNG (in tiles, for huge sizes) ----------
const saveBtn = document.getElementById('save');
saveBtn.onclick = async () => {
  saveBtn.disabled = true;
  const [OW, OH] = outSize();
  const out = document.createElement('canvas'); out.width = OW; out.height = OH;
  const ctx = out.getContext('2d');
  camera.aspect = OW / OH;
  camera.position.set(pos.x, pos.y, pos.z); camera.rotation.set(pos.pitch, pos.yaw, 0);
  renderer.setPixelRatio(1);
  const T = 2048;
  for (let y = 0; y < OH; y += T) for (let x = 0; x < OW; x += T) {
    const tw = Math.min(T, OW - x), th = Math.min(T, OH - y);
    renderer.setSize(tw, th, false);
    camera.setViewOffset(OW, OH, x, y, tw, th); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    ctx.drawImage(cv, 0, 0, tw, th, x, y, tw, th);
    info.textContent = `Generating… ${Math.round(((y / T) * Math.ceil(OW / T) + x / T + 1) / (Math.ceil(OH / T) * Math.ceil(OW / T)) * 100)}%`;
    await new Promise(r => setTimeout(r));
  }
  camera.clearViewOffset();
  out.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `anechoic-chamber-${OW}x${OH}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    saveBtn.disabled = false; fit();
  }, 'image/png');
};

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, .1); last = now;
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const v = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
  const k = 3 * dt;
  pos.x += (-Math.sin(pos.yaw) * f + Math.cos(pos.yaw) * s) * k;
  pos.z += (-Math.cos(pos.yaw) * f - Math.sin(pos.yaw) * s) * k;
  pos.y = Math.max(.4, Math.min(H - .6, pos.y + v * k));
  pos.x = Math.max(-hw + .8, Math.min(hw - .8, pos.x));
  pos.z = Math.max(-hl + .8, Math.min(hl - .8, pos.z));
  if (!saveBtn.disabled) {
    camera.position.set(pos.x, pos.y, pos.z); camera.rotation.set(pos.pitch, pos.yaw, 0);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
fit();
requestAnimationFrame(frame);
