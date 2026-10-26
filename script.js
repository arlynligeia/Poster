import * as THREE from 'three';

// ---------- Tamaños ----------
const PRESETS = [
  ['Vertical (pantalla)', '8K 4320×7680', 4320, 7680], ['Vertical (pantalla)', '4K DCI 2160×4096', 2160, 4096],
  ['Vertical (pantalla)', '4K 2160×3840', 2160, 3840], ['Vertical (pantalla)', '2K 1080×2048', 1080, 2048],
  ['Vertical (pantalla)', 'Full HD 1080×1920', 1080, 1920], ['Vertical (pantalla)', 'HD 720×1280', 720, 1280],
  ['Banner horizontal', '8K 7680×4320', 7680, 4320], ['Banner horizontal', '4K DCI 4096×2160', 4096, 2160],
  ['Banner horizontal', '4K 3840×2160', 3840, 2160], ['Banner horizontal', '2K 2048×1080', 2048, 1080],
  ['Banner horizontal', 'Full HD 1920×1080', 1920, 1080], ['Banner horizontal', 'HD 1280×720', 1280, 720],
  ['Impresión (pulgadas)', 'Six sheet 81×81 in', 81, 81, 1], ['Impresión (pulgadas)', 'Parada de bus 48×70 in', 48, 70, 1],
  ['Impresión (pulgadas)', 'Three sheet 41×81 in', 41, 81, 1], ['Impresión (pulgadas)', 'One sheet 27×40 in', 27, 40, 1],
  ['Impresión (pulgadas)', 'Half sheet 22×28 in', 22, 28, 1], ['Impresión (pulgadas)', 'Window card 14×22 in', 14, 22, 1],
];
const sizeEl = document.getElementById('size'), dpiEl = document.getElementById('dpi'), dpiBox = document.getElementById('dpiBox');
const fovEl = document.getElementById('fov'), info = document.getElementById('info'), bar = document.getElementById('bar');
let grp = null, og = null;
PRESETS.forEach((p, i) => {
  if (p[0] !== grp) { grp = p[0]; og = document.createElement('optgroup'); og.label = grp; sizeEl.appendChild(og); }
  og.appendChild(new Option(p[1], i, false, i === 8));
});
const preset = () => PRESETS[sizeEl.value];
function outSize() {
  const [, , w, h, inch] = preset();
  let W = inch ? Math.round(w * dpiEl.value) : w, H = inch ? Math.round(h * dpiEl.value) : h;
  const k = Math.min(1, 16000 / Math.max(W, H), Math.sqrt(2.4e8 / (W * H)));
  return [Math.round(W * k), Math.round(H * k), k < 1];
}

// ---------- Escena ----------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
stage.appendChild(renderer.domElement);
const cv = renderer.domElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
camera.rotation.order = 'YXZ';

// Cielo: casi negro arriba, resplandor morado en el horizonte
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(600, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDir;
      void main(){
        float y = vDir.y; float t = clamp(y / 0.5, 0.0, 1.0);
        vec3 hz = vec3(.15, .02, .20), top = vec3(.012, .0, .04);
        vec3 c = mix(hz, top, pow(t, .55));
        c += vec3(.25, .0, .22) * exp(-abs(y) * 30.0) * .35;
        gl_FragColor = vec4(c, 1.0);
      }`,
  })
);
sky.renderOrder = -1;
scene.add(sky);

// Siluetas lejanas
const mg = new THREE.CylinderGeometry(300, 300, 1, 360, 1, true);
const mp = mg.attributes.position;
for (let i = 0; i < mp.count; i++) {
  if (mp.getY(i) > 0) {
    const a = Math.atan2(mp.getZ(i), mp.getX(i));
    mp.setY(i, 4 + 9 * Math.abs(Math.sin(a * 7 + 1)) * Math.abs(Math.sin(a * 3.3)) + 4 * Math.abs(Math.sin(a * 23)));
  } else mp.setY(i, -1);
}
const mountains = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0x0b0114, side: THREE.DoubleSide }));
scene.add(mountains);

// Suelo agrietado: grietas generadas con diagramas de Voronoi en el shader (sin texturas)
const uniforms = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 } };
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vW; uniform vec3 uCam; uniform float uTime;
      float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = .5, s = 0.; for(int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + 17.0; a *= .5; } return s; }
      // x: distancia al borde de la celda, yz: id de la celda
      vec3 vor(vec2 x){
        vec2 n = floor(x), f = fract(x), mg, mr; float md = 8.0;
        for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){
          vec2 g = vec2(float(i), float(j)); vec2 o = h2(n + g); o = .5 + .5 * sin(6.2831 * o);
          vec2 r = g + o - f; float d = dot(r, r); if(d < md){ md = d; mr = r; mg = g; } }
        md = 8.0;
        for(int j = -2; j <= 2; j++) for(int i = -2; i <= 2; i++){
          vec2 g = mg + vec2(float(i), float(j)); vec2 o = h2(n + g); o = .5 + .5 * sin(6.2831 * o);
          vec2 r = g + o - f;
          if(dot(mr - r, mr - r) > .00001) md = min(md, dot(.5 * (mr + r), normalize(r - mr))); }
        return vec3(md, n + mg);
      }
      void main(){
        vec2 p = vW.xz; float dist = length(vW - uCam);
        // red de grietas brillantes
        vec2 q = p / 3.0; q += (vec2(vn(q * 1.6), vn(q * 1.6 + 7.3)) - .5) * .8;
        vec3 v = vor(q); float d = v.x * 3.0; float fw = fwidth(d) + 1e-4;
        float cell = h1(v.yz);
        float energy = .22 + 1.25 * smoothstep(.38, .72, fbm(p * .045 + 3.0)) + .35 * cell;
        energy *= .88 + .12 * sin(uTime * .8 + cell * 20.0);
        float wc = .03, aa = clamp(.04 / fw, .2, 1.0);
        float core = (1.0 - smoothstep(wc, wc + fw * 1.5, d)) * aa;
        float hot = (1.0 - smoothstep(0.0, wc * .5 + fw, d)) * aa;
        float halo = exp(-d * 2.6) * aa + exp(-d * .9) * .15;
        // superficie de barro seco
        float g = fbm(p * 9.0), g2 = fbm(p * 38.0);
        vec3 base = mix(vec3(.05, .008, .08), vec3(.26, .05, .30), g * .7 + g2 * .3);
        base *= .65 + .7 * cell;
        // grietas finas oscuras
        vec2 q2 = p / .8; q2 += (vec2(vn(q2 * 2.1), vn(q2 * 2.1 + 3.1)) - .5) * .6;
        vec3 v2 = vor(q2); float d2 = v2.x * .8; float fw2 = fwidth(d2) + 1e-4;
        float dl = (1.0 - smoothstep(.012, .024 + fw2 * 1.5, d2)) * clamp(.03 / fw2, .15, 1.0);
        base *= 1.0 - .85 * dl;
        // luz de las grietas sobre el suelo
        vec3 col = base * (.35 + halo * energy * 1.1);
        col += vec3(.95, .06, .85) * halo * energy * .55;
        col += vec3(1.0, .18, .95) * core * energy * 1.3;
        col += vec3(1.0, .8, 1.0) * hot * energy;
        float f = 1.0 - exp(-dist * .009);
        col = mix(col, vec3(.05, .004, .08), f);
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------- Controles ----------
const START = { x: 0, y: 1.7, z: 0, yaw: 0, pitch: -0.26 };
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
  pos.pitch = Math.max(-1.3, Math.min(1.0, pos.pitch - (e.clientY - drag.y) * .003));
  drag = { x: e.clientX, y: e.clientY };
});

function place() {
  camera.position.set(pos.x, pos.y, pos.z);
  camera.rotation.set(pos.pitch, pos.yaw, 0);
  uniforms.uCam.value.copy(camera.position);
  ground.position.set(pos.x, 0, pos.z);
  sky.position.copy(camera.position);
  mountains.position.set(pos.x, 0, pos.z);
}

// ---------- Vista previa ----------
function fit() {
  const [, , pw, ph] = preset();
  const r = pw / ph;
  let w = innerWidth, h = innerHeight;
  if (w / h > r) w = h * r; else h = w / r;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(Math.floor(w), Math.floor(h));
  camera.aspect = r; camera.fov = +fovEl.value; camera.updateProjectionMatrix();
  dpiBox.style.display = preset()[4] ? '' : 'none';
  const [ow, oh, cut] = outSize();
  info.textContent = `Se guardará: ${ow}×${oh} px${cut ? ' (reducido al límite del navegador)' : ''} · Arrastra: mirar · WASD: mover · Q/E: bajar/subir · R: reiniciar · H: ocultar barra`;
}
sizeEl.onchange = () => { fovEl.value = preset()[2] > preset()[3] ? 60 : 75; fit(); };
dpiEl.onchange = fovEl.oninput = fit;
addEventListener('resize', fit);

// ---------- Guardar PNG (por mosaicos, para tamaños enormes) ----------
const saveBtn = document.getElementById('save');
saveBtn.onclick = async () => {
  saveBtn.disabled = true;
  const [OW, OH] = outSize();
  const out = document.createElement('canvas'); out.width = OW; out.height = OH;
  const ctx = out.getContext('2d');
  camera.aspect = OW / OH;
  place();
  renderer.setPixelRatio(1);
  const T = 2048, cols = Math.ceil(OW / T), rows = Math.ceil(OH / T);
  for (let y = 0; y < OH; y += T) for (let x = 0; x < OW; x += T) {
    const tw = Math.min(T, OW - x), th = Math.min(T, OH - y);
    renderer.setSize(tw, th, false);
    camera.setViewOffset(OW, OH, x, y, tw, th); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    ctx.drawImage(cv, 0, 0, tw, th, x, y, tw, th);
    info.textContent = `Generando… ${Math.round(((y / T) * cols + x / T + 1) / (rows * cols) * 100)}%`;
    await new Promise(r => setTimeout(r));
  }
  camera.clearViewOffset();
  out.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `desierto-grietas-${OW}x${OH}.png`; a.click();
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
  const k = 4 * dt;
  pos.x += (-Math.sin(pos.yaw) * f + Math.cos(pos.yaw) * s) * k;
  pos.z += (-Math.cos(pos.yaw) * f - Math.sin(pos.yaw) * s) * k;
  pos.y = Math.max(.3, Math.min(40, pos.y + v * k));
  if (!saveBtn.disabled) {
    uniforms.uTime.value = now / 1000;
    place();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
fit();
requestAnimationFrame(frame);
