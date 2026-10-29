import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- Ajustes rápidos (aquí afinas el look) ----------
const CFG = {
  exposure: 0.9,      // brillo general (también hay slider)
  bloom: 0.8,         // intensidad del glow (también hay slider)
  bloomRadius: 0.55,
  bloomThreshold: 0.75,
  neonBoost: 2.2,     // qué tan "caliente" es el neón (>1 hace que brille con bloom)
  stripLight: 12,     // intensidad de las luces de área del techo
  foamEnv: 0.45,      // cuánto refleja el entorno la espuma
  floorEnv: 1.3,      // cuánto refleja el entorno el piso
  vignette: 0.55,
  grain: 0.035,
  chroma: 0.02,       // aberración cromática en los bordes
  doorOpen: 0,        // puerta: 0 = cerrada; ~0.35 = entreabierta con luz del pasillo (radianes)
};

// ---------- Sizes ----------
const PRESETS = [
  ['Vertical Poster', '8K 4320×7680', 4320, 7680], ['Vertical Poster', '4K DCI 2160×4096', 2160, 4096],
  ['Vertical Poster', '4K 2160×3840', 2160, 3840], ['Vertical Poster', '2K 1080×2048', 1080, 2048],
  ['Vertical Poster', 'Full HD 1080×1920', 1080, 1920], ['Vertical Poster', 'HD 720×1280', 720, 1280],

  ['Square Poster', '(8100x8100', 8100, 8100], ['Square Poster', '4320×4320', 4320, 4320],
  ['Square Poster', '3000×3000', 3000, 3000], ['Square Poster', '2160x2160', 2160, 2160],
  ['Square Poster', '1080×1080', 1080, 1080], ['Square Poster', '720×720', 720, 720],
  
  ['Horizontal Banner', '8K 7680×4320', 7680, 4320], ['Horizontal Banner', '4K DCI 4096×2160', 4096, 2160],
  ['Horizontal Banner', '4K 3840×2160', 3840, 2160], ['Horizontal Banner', '2K 2048×1080', 2048, 1080],
  ['Horizontal Banner', 'Full HD 1920×1080', 1920, 1080], ['Horizontal Banner', 'HD 1280×720', 1280, 720],

  ['Print Poster', 'One Sheet 8100x12000', 8100, 12000], ['Print Poster', 'Bus Shelter 7200x10500', 7200, 10500], 
  ['Print Poster', 'Half Sheet 6600x8400', 6600, 8400],  ['Print Poster', 'Three Sheet 6150x12150', 6150, 12150],
  ['Print Poster', 'Roll-up Banner 5020x11811', 5020, 11811], ['Print Poster', 'Window Card 4200x6600', 4200, 6600], 
  ['Print Poster', 'Insert 4200x10800', 4200, 10800], ['Print Poster', 'Lobby Card 3300×4200', 3300, 4200],

  ['Print Poster', '24 Sheet 12300x5400', 12300, 5400],  
];



const sizeEl = document.getElementById('size'), dpiEl = document.getElementById('dpi'), dpiBox = document.getElementById('dpiBox');
const fovEl = document.getElementById('fov'), info = document.getElementById('info'), bar = document.getElementById('bar');
const exposureEl = document.getElementById('exposure'), glowEl = document.getElementById('glowAmt');
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

// ---------- Renderer / Scene ----------
const W = 8, H = 5.5, L = 14, hw = W / 2, hl = L / 2, DX = 1.5;
const MAG = 0xff2bd6, CYA = 0x22b8ff, VIO = 0x8a3cff;
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
stage.appendChild(renderer.domElement);
const cv = renderer.domElement;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CFG.exposure;
RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03010f);
scene.fog = new THREE.FogExp2(0x03010f, 0.04);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
camera.rotation.order = 'YXZ';
const maxAniso = renderer.capabilities.getMaxAnisotropy();

// ---------- Utilidades de textura ----------
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// ---------- Espuma acústica (pirámides) ----------
const S = 0.354;
const pyr = new THREE.ConeGeometry(0.25, 0.35, 4, 1, true);
pyr.rotateY(Math.PI / 4); pyr.translate(0, 0.175, 0);
{ // oclusión ambiental "pintada": la base de cada pirámide es más oscura que la punta
  const p = pyr.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i) / 0.35));
    const v = 0.18 + 0.82 * Math.pow(t, 0.75);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  pyr.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
// grano de la espuma (bump)
const foamBump = canvasTex(256, (g, n) => {
  const img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) {
    const v = 90 + Math.random() * 165;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}, false);
foamBump.repeat.set(3, 3);
const foam = new THREE.MeshStandardMaterial({
  roughness: 0.92, metalness: 0, flatShading: true, vertexColors: true,
  bumpMap: foamBump, bumpScale: 0.9, envMapIntensity: CFG.foamEnv,
});
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
  const m = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), twist = new THREE.Quaternion(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  pts.forEach((p, i) => {
    // pequeñas imperfecciones: giro, altura y tono
    twist.setFromAxisAngle(Y, (Math.random() - .5) * .06);
    tmpQ.copy(q).multiply(twist);
    const sx = .96 + Math.random() * .08;
    sc.set(sx, .9 + Math.random() * .18, sx);
    m.compose(p, tmpQ, sc);
    mesh.setMatrixAt(i, m);
    col.copy(palette[(Math.random() * palette.length) | 0]).multiplyScalar(.8 + Math.random() * .35);
    mesh.setColorAt(i, col);
  });
  scene.add(mesh);
}
panel(new THREE.Vector3(-hw, 0, -hl), Z, Y, L, H, X);
panel(new THREE.Vector3(hw, 0, -hl), Z, Y, L, H, X.clone().negate());
panel(new THREE.Vector3(-hw, 0, -hl), X, Y, W, H, Z, p => Math.abs(p.x - DX) < 0.95 && p.y < 2.6); // back wall, gap for the door
panel(new THREE.Vector3(-hw, 0, hl), X, Y, W, H, Z.clone().negate());
panel(new THREE.Vector3(-hw, H, -hl), X, Z, W, L, Y.clone().negate());

// ---------- Piso de rejilla metálica ----------
const floorMap = canvasTex(512, (g, n) => {
  g.fillStyle = '#100e30'; g.fillRect(0, 0, n, n);
  const cells = 8, cs = n / cells;
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const x = i * cs, y = j * cs, k = 26 + Math.random() * 14;
    g.fillStyle = `rgb(${k + 6},${k + 4},${k + 34})`; g.fillRect(x + 4, y + 4, cs - 8, cs - 8);
    g.fillStyle = '#04031a';                                  // perforaciones
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      g.beginPath(); g.arc(x + cs * (.2 + a * .2), y + cs * (.2 + b * .2), 2.4, 0, 7); g.fill();
    }
    g.strokeStyle = '#5a49d0'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, cs - 6, cs - 6);
  }
  g.strokeStyle = 'rgba(160,150,255,.10)'; g.lineWidth = 1;   // rayones
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * n, y = Math.random() * n, a = Math.random() * 6.28, l = 10 + Math.random() * 50;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
});
const floorRough = canvasTex(512, (g, n) => {
  g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, n, n);
  const cells = 8, cs = n / cells;
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const x = i * cs, y = j * cs, k = 70 + Math.random() * 40;
    g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(x + 4, y + 4, cs - 8, cs - 8);
    g.fillStyle = '#f2f2f2';
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      g.beginPath(); g.arc(x + cs * (.2 + a * .2), y + cs * (.2 + b * .2), 2.4, 0, 7); g.fill();
    }
  }
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * n, y = Math.random() * n, a = Math.random() * 6.28, l = 10 + Math.random() * 60;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}, false);
for (const t of [floorMap, floorRough]) t.repeat.set(W / .8, L / .8);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({
  map: floorMap, roughnessMap: floorRough, bumpMap: floorRough, bumpScale: -1.2,
  metalness: .85, roughness: .9, color: 0x9a88f0, envMapIntensity: CFG.floorEnv,
}));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

// Registro de luces por grupo (para poder apagarlas)
const G = { neon: [], glow: [], lamp: [], amb: [] };

// ---------- Neón ----------
const neon = hex => { const m = new THREE.MeshBasicMaterial({ color: hex }); m.color.multiplyScalar(CFG.neonBoost); return m; };
const box = (w, h, d, x, y, z, hex) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), neon(hex)); m.position.set(x, y, z); scene.add(m); G.neon.push(m); return m; };
// soft additive glow for halos and floor reflections
const gc = document.createElement('canvas'); gc.width = gc.height = 64;
const gg = gc.getContext('2d');
const gr = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
gg.fillStyle = gr; gg.fillRect(0, 0, 64, 64);
const glowTex = new THREE.CanvasTexture(gc);
function glow(x, y, z, hex, sx, sy, op = .5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hex, transparent: true, opacity: op * .8, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.set(x, y, z); s.scale.set(sx, sy, 1); scene.add(s); G.glow.push(s);
}
function floorGlow(x, z, hex, w, l, op = .3) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: glowTex, color: hex, transparent: true, opacity: op * .8, blending: THREE.AdditiveBlending, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .03, z); scene.add(m); G.glow.push(m);
}
// luz de área real: ilumina la espuma y deja reflejos alargados en el piso
function stripLight(hex, x, y, z) {
  const l = new THREE.RectAreaLight(hex, CFG.stripLight, .3, 1.6);
  l.position.set(x, y, z);
  l.up.set(0, 0, 1);
  l.lookAt(x, 0, z);
  scene.add(l); G.lamp.push(l);
}
// ceiling strips: outer row (long) and inner row (thin, offset)
for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
  const col = (i + (s > 0 ? 1 : 0)) % 2 ? CYA : MAG, z = -5.5 + i * 2.6;
  box(.12, .04, 1.6, s * 2.3, H - .37, z, col);
  stripLight(col, s * 2.3, H - .4, z);
  glow(s * 2.3, H - .6, z, col, 2.6, 1.6, .55);
  floorGlow(s * 2.3, z, col, 1.4, 3.4, .35);
}
for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
  const col = (i + (s > 0 ? 0 : 1)) % 2 ? VIO : CYA, z = -4.2 + i * 2.6;
  box(.05, .03, 1.1, s * 0.9, H - .37, z, col);
  glow(s * 0.9, H - .6, z, col, 1.6, 1.1, .35);
}

// continuous neon on all 12 edges (inset so the pyramids don't hide it)
const ix = hw - .42, iz = hl - .42, iy = H - .4, TH = .06;
const line = (x1, y1, z1, x2, y2, z2, hex) =>
  box(Math.abs(x2 - x1) + TH, Math.abs(y2 - y1) + TH, Math.abs(z2 - z1) + TH, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, hex);
for (const s of [-1, 1]) {
  const col = s < 0 ? MAG : CYA;
  line(s * ix, .03, -iz, s * ix, .03, iz, col);              // floor edge, long side
  line(s * ix, iy, -iz, s * ix, iy, iz, col);                // ceiling edge, long side
  for (const e of [-1, 1]) {
    line(s * ix, .03, e * iz, s * ix, iy, e * iz, col);      // vertical corners
    glow(s * ix, H / 2, e * iz, col, .9, H, .25);
  }
  for (let z = -5; z <= 5; z += 2.5) glow(s * ix, .25, z, col, 2.2, .8, .35);
}
for (const e of [-1, 1]) {
  line(-ix, .03, e * iz, ix, .03, e * iz, VIO);              // floor edge, end walls
  line(-ix, iy, e * iz, ix, iy, e * iz, VIO);                // ceiling edge, end walls
}

// ---------- Luces puntuales / ambiente ----------
const ambient = new THREE.AmbientLight(0x120a40, .3);
scene.add(ambient); G.amb.push(ambient);
const lamp = (hex, i, x, y, z, d = 12) => { const l = new THREE.PointLight(hex, i, d, 2); l.position.set(x, y, z); scene.add(l); G.lamp.push(l); };
lamp(MAG, 6, -2.3, H - .8, -4, 10); lamp(CYA, 6, -2.3, H - .8, 1, 10);
lamp(CYA, 6, 2.3, H - .8, -4, 10);  lamp(MAG, 6, 2.3, H - .8, 1, 10);
lamp(VIO, 8, 0, H - 1, -5, 9);
lamp(MAG, 9, DX - .6, 1.8, -hl + 1.1, 6);   // door frame light
lamp(CYA, 5, -2.5, 1.2, -hl + 1.2, 6);

// ---------- Puerta de cámara anecoica (blindada, acero cepillado) ----------
const dz = -hl + 0.08;

// acero cepillado: vetas horizontales finas + manchas suaves
function brushedCanvas(g, n, base, streaks) {
  g.fillStyle = base; g.fillRect(0, 0, n, n);
  for (let i = 0; i < streaks; i++) {
    const x = Math.random() * n, y = Math.random() * n, l = 60 + Math.random() * 500;
    const v = Math.random() < .5 ? 255 : 0;
    g.strokeStyle = `rgba(${v},${v},${v},${.02 + Math.random() * .06})`;
    g.lineWidth = .5 + Math.random() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - .5) * 1.5); g.stroke();
  }
  for (let i = 0; i < 40; i++) {                       // huellas / manchas
    const x = Math.random() * n, y = Math.random() * n, r = 40 + Math.random() * 110;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,.07)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
const steelMap = canvasTex(1024, (g, n) => brushedCanvas(g, n, '#8c969c', 9000));
const steelRough = canvasTex(1024, (g, n) => brushedCanvas(g, n, '#9a9a9a', 9000), false);

const doorSteel = new THREE.MeshStandardMaterial({ map: steelMap, roughnessMap: steelRough, bumpMap: steelRough, bumpScale: .25, color: 0xb4c6cf, metalness: .92, roughness: .8, envMapIntensity: 1.5 });
const doorPaint = new THREE.MeshStandardMaterial({ color: 0x24343c, metalness: .55, roughness: .42, envMapIntensity: 1.2 });
const frameMat = new THREE.MeshStandardMaterial({ map: steelMap, roughnessMap: steelRough, color: 0x5a6a73, metalness: .9, roughness: .75, envMapIntensity: 1.3 });
const kickMat = new THREE.MeshStandardMaterial({ color: 0xb8c4ca, metalness: 1, roughness: .35, envMapIntensity: 1.4 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x040404, roughness: .95, metalness: 0 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, metalness: 1, roughness: .18, envMapIntensity: 1.6 });

// marco pesado fijo + juntas de goma
const fm = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, .012), mat); m.position.set(x, y, z); scene.add(m); return m; };
const sm = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); scene.add(m); return m; };
fm(.12, 2.4, .18, DX - .73, 1.2, dz, frameMat);
fm(.12, 2.4, .18, DX + .73, 1.2, dz, frameMat);
fm(1.58, .12, .18, DX, 2.3, dz, frameMat);
sm(.016, 2.22, .1, DX - .668, 1.11, dz, rubber);   // junta izquierda
sm(.016, 2.22, .1, DX + .668, 1.11, dz, rubber);   // junta derecha
sm(1.34, .04, .1, DX, 2.22, dz, rubber);           // junta superior
fm(1.46, .025, .3, DX, .012, dz + .12, kickMat);   // umbral metálico

// hoja de la puerta (gira sobre el eje de las bisagras, a la derecha)
const doorPivot = new THREE.Group();
doorPivot.position.set(DX + .65, 0, dz);
doorPivot.rotation.y = CFG.doorOpen;
scene.add(doorPivot);
const dm = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; doorPivot.add(m); return m; };
dm(new RoundedBoxGeometry(1.3, 2.2, .1, 3, .015), doorSteel, -.65, 1.1, 0);          // hoja
dm(new RoundedBoxGeometry(1.0, 1.7, .02, 2, .008), doorPaint, -.65, 1.15, .055);     // panel central
dm(new RoundedBoxGeometry(1.0, .22, .012, 1, .004), kickMat, -.65, .2, .07);         // placa inferior
// manija vertical con soportes + placa
dm(new RoundedBoxGeometry(.09, .34, .012, 1, .004), doorSteel, -1.225, 1.05, .07);
dm(new THREE.CylinderGeometry(.01, .01, .07, 12), chrome, -1.225, .85, .09, Math.PI / 2);
dm(new THREE.CylinderGeometry(.01, .01, .07, 12), chrome, -1.225, 1.25, .09, Math.PI / 2);
dm(new THREE.CylinderGeometry(.017, .017, .5, 16), chrome, -1.225, 1.05, .125);
// lector de tarjeta con pantalla verde
dm(new RoundedBoxGeometry(.09, .13, .03, 2, .01), rubber, -1.225, 1.5, .07);
{
  const led = new THREE.Mesh(new THREE.BoxGeometry(.06, .025, .006), neon(0x30ff90));
  led.position.set(-1.225, 1.535, .088); doorPivot.add(led); G.neon.push(led);
}
// bisagras grandes
for (const y of [.3, 1.1, 1.9]) {
  dm(new THREE.CylinderGeometry(.03, .03, .2, 16), kickMat, 0, y, .02);
  dm(new THREE.BoxGeometry(.14, .18, .014), frameMat, -.07, y, .062);
}
// tornillos del borde
{
  const boltGeo = new THREE.CylinderGeometry(.011, .011, .012, 10); boltGeo.rotateX(Math.PI / 2);
  const pts = [];
  for (let x = -1.225; x <= -.07; x += .165) { pts.push([x, .075], [x, 2.125]); }
  for (let y = .24; y <= 2.0; y += .17) {
    pts.push([-.075, y]);
    if (Math.abs(y - 1.05) > .4) pts.push([-1.225, y]);
  }
  const bolts = new THREE.InstancedMesh(boltGeo, chrome, pts.length), mm = new THREE.Matrix4();
  pts.forEach(([x, y], i) => { mm.makeTranslation(x, y, .056); bolts.setMatrixAt(i, mm); });
  doorPivot.add(bolts);
}
// luz roja de aviso sobre la puerta
fm(.2, .07, .06, DX, 2.505, dz + .04, rubber);
box(.16, .035, .02, DX, 2.505, dz + .075, 0xff2a20);
glow(DX, 2.505, dz + .25, 0xff2a20, .9, .45, .5);

// puerta entreabierta: luz que se cuela desde el pasillo (solo si CFG.doorOpen > 0)
if (CFG.doorOpen > .02) {
  const bc = canvasTex(256, (g, n) => {
    const gr = g.createLinearGradient(0, 0, 0, n);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#9fc4e8');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
  });
  const corr = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.6), new THREE.MeshBasicMaterial({ map: bc, color: new THREE.Color(0xbfdcff).multiplyScalar(1.4) }));
  corr.position.set(DX, 1.3, dz - .3); scene.add(corr); G.neon.push(corr);
  const spill = new THREE.RectAreaLight(0xcfe6ff, 6, 1.3, 2.2);
  spill.position.set(DX, 1.15, dz - .12); spill.lookAt(DX, 1.15, dz + 5);
  scene.add(spill); G.lamp.push(spill);
  floorGlow(DX, dz + 1.6, 0xcfe6ff, 1.5, 3.2, .45);
}

// magenta neon frame around the door
box(.04, 2.42, .04, DX - .8, 1.21, dz + .1, MAG);
box(.04, 2.42, .04, DX + .8, 1.21, dz + .1, MAG);
box(1.64, .04, .04, DX, 2.42, dz + .1, MAG);
glow(DX, 1.2, dz + .3, MAG, 3.2, 3.8, .35);

// ---------- Reflejos del entorno (mapa de entorno horneado, se rehace al cambiar luces) ----------
const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
const cubeCam = new THREE.CubeCamera(.1, 60, cubeRT);
cubeCam.position.set(0, 2.4, 0);
const pmrem = new THREE.PMREMGenerator(renderer);
let envRT = null;
function updateEnv() {
  floor.visible = false; scene.environment = null;
  try {
    cubeCam.update(renderer, scene);
    const next = pmrem.fromCubemap(cubeRT.texture);
    if (envRT) envRT.dispose();
    envRT = next; scene.environment = next.texture;
  } catch (err) {
    console.error('updateEnv falló:', err);
  } finally {
    floor.visible = true;                 // el piso siempre vuelve a mostrarse, pase lo que pase
  }
}

// ---------- Postprocesado (bloom + grano + viñeta + aberración) ----------
const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), CFG.bloom, CFG.bloomRadius, CFG.bloomThreshold);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTile: { value: new THREE.Vector4(0, 0, 1, 1) },   // región (px) que se está dibujando dentro de la imagen final
    uFull: { value: new THREE.Vector2(1, 1) },          // tamaño (px) de la imagen final
    uVig: { value: CFG.vignette }, uGrain: { value: CFG.grain }, uCA: { value: CFG.chroma },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec4 uTile; uniform vec2 uFull;
    uniform float uVig, uGrain, uCA;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      // coordenadas globales (así el efecto es idéntico aunque se renderice por mosaicos)
      vec2 gp = vec2(uTile.x + vUv.x * uTile.z, uTile.y + (1.0 - vUv.y) * uTile.w);
      vec2 guv = vec2(gp.x / uFull.x, 1.0 - gp.y / uFull.y);
      vec2 d = guv - 0.5; d.x *= uFull.x / uFull.y;
      vec2 off = d * dot(d, d) * uCA * vec2(uFull.x / uTile.z, uFull.y / uTile.w);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= mix(1.0, smoothstep(1.0, 0.3, length(d)), uVig);
      vec2 cell = floor(gp / max(1.0, uFull.y / 1500.0));
      float n = hash(cell) - 0.5;
      col += n * uGrain * (1.0 - 0.6 * dot(col, vec3(0.333)));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(finalPass);
function setTile(x, y, w, h, FW, FH) { finalPass.uniforms.uTile.value.set(x, y, w, h); finalPass.uniforms.uFull.value.set(FW, FH); }

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

// ---------- Control de luces ----------
const lightsBtn = document.getElementById('lights');
const chk = {
  neon: document.getElementById('gNeon'),
  glow: document.getElementById('gGlow'),
  lamp: document.getElementById('gLamp'),
  amb: document.getElementById('gAmb'),
};
const anyLightOn = () => Object.values(chk).some(c => c.checked);
function applyLights() {
  for (const k in G) G[k].forEach(o => o.visible = chk[k].checked);
  lightsBtn.textContent = anyLightOn() ? 'Luces: ON' : 'Luces: OFF';
  updateEnv();                                    // los reflejos siguen el estado de las luces
}
function toggleAllLights() {
  const on = !anyLightOn();                       // si alguna está encendida, apaga todo; si no, enciende todo
  Object.values(chk).forEach(c => c.checked = on);
  applyLights();
}
lightsBtn.onclick = toggleAllLights;
Object.values(chk).forEach(c => c.onchange = applyLights);
addEventListener('keydown', e => { if (e.code === 'KeyL') toggleAllLights(); });
applyLights();

// ---------- Sliders de look ----------
exposureEl.value = CFG.exposure; glowEl.value = CFG.bloom;
exposureEl.oninput = () => { renderer.toneMappingExposure = +exposureEl.value; };
glowEl.oninput = () => { bloom.strength = +glowEl.value; };

// ---------- Preview ----------
function fit() {
  const [, , pw, ph] = preset();
  const r = pw / ph;
  let w = innerWidth, h = innerHeight;
  if (w / h > r) w = h * r; else h = w / r;
  w = Math.floor(w); h = Math.floor(h);
  const pr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  renderer.setSize(w, h); composer.setSize(w, h);
  setTile(0, 0, w * pr, h * pr, w * pr, h * pr);
  camera.clearViewOffset();
  camera.aspect = r; camera.fov = +fovEl.value; camera.updateProjectionMatrix();
  dpiEl.disabled = !preset()[4];                      // dpi only applies to print (inch) sizes
  dpiBox.style.opacity = preset()[4] ? '' : '.4';
  const [ow, oh, cut] = outSize();
  info.textContent = `Will save: ${ow}×${oh} px${cut ? ' (reduced to browser limit)' : ''} · Drag: look · WASD: move · Q/E: down/up · L: lights · R: reset · H: hide bar`;
}
sizeEl.onchange = () => { fovEl.value = preset()[2] > preset()[3] ? 55 : 70; fit(); };
dpiEl.onchange = fovEl.oninput = fit;
addEventListener('resize', fit);

// ---------- Save PNG (por mosaicos con margen, para tamaños enormes) ----------
// El margen evita costuras: el bloom necesita ver los píxeles vecinos de cada mosaico.
const saveBtn = document.getElementById('save');
saveBtn.onclick = async () => {
  saveBtn.disabled = true;
  const [OW, OH] = outSize();
  const out = document.createElement('canvas'); out.width = OW; out.height = OH;
  const ctx = out.getContext('2d');
  camera.aspect = OW / OH;
  camera.position.set(pos.x, pos.y, pos.z); camera.rotation.set(pos.pitch, pos.yaw, 0);
  renderer.setPixelRatio(1); composer.setPixelRatio(1);
  const T = 1536, M = 256;
  const cols = Math.ceil(OW / T), rows = Math.ceil(OH / T);
  for (let y = 0; y < OH; y += T) for (let x = 0; x < OW; x += T) {
    const cw = Math.min(T, OW - x), ch = Math.min(T, OH - y);
    const rw = cw + 2 * M, rh = ch + 2 * M;
    renderer.setSize(rw, rh, false); composer.setSize(rw, rh);
    camera.setViewOffset(OW, OH, x - M, y - M, rw, rh); camera.updateProjectionMatrix();
    setTile(x - M, y - M, rw, rh, OW, OH);
    composer.render();
    ctx.drawImage(cv, M, M, cw, ch, x, y, cw, ch);
    info.textContent = `Generating… ${Math.round(((y / T) * cols + x / T + 1) / (rows * cols) * 100)}%`;
    await new Promise(r => setTimeout(r));
  }
  camera.clearViewOffset();
  out.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `AC57 - ${OW}x${OH}.png`; a.click();
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
    composer.render();
  }
  requestAnimationFrame(frame);
}
fit();
requestAnimationFrame(frame);
