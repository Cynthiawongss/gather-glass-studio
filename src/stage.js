// 舞台：three.js 场景、玻璃几何与材质。只负责"画"，不保存任何业务状态。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { N, NECK_R, BODIES, W_Y_MIN, W_Y_MAX, W_MAX_POINTS, W_MAX_DOTS, W_MAX_PETALS, ribFactor, frameR, F_Y0 } from './model.js';
import { createStrand, createPetals } from './coil.js';

const SEG = 96;          // 圆周分段
const BODY_ROWS = 72;    // 轴向分段（瓶身）
const CAP_ROWS = 16;     // 轴向分段（圆底）
const PIPE_Y = 1.8;     // 吹管口在世界坐标的高度
const FLOOR_Y = -1.12;    // 展台台面高度

const ROWS = BODY_ROWS + CAP_ROWS + 1;

function sampleProfile(profile, t) {
  const x = Math.min(Math.max(t, 0), 1) * (N - 1);
  const i = Math.min(Math.floor(x), N - 2);
  const f = x - i;
  return profile[i] * (1 - f) + profile[i + 1] * f;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function backdropTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const blur = (px) => { if ('filter' in g) g.filter = px ? `blur(${px}px)` : 'none'; };
  // 两面墙：午后炉边是蜜桃色，退火后的清晨是鼠尾草绿。中间都有一个奶油色的拱形壁龛
  const P = kind === 'hot'
    ? { top: '#efc9a9', bottom: '#e2ad8a', niche: '#f8e3cb', nicheLow: '#f2d3b6', edge: 'rgba(150,80,40,0.22)', light: 'rgba(255,244,214,0.55)' }
    : { top: '#d3dbc6', bottom: '#c2ccb3', niche: '#f8f4e8', nicheLow: '#ece6d4', edge: 'rgba(70,90,60,0.2)', light: 'rgba(255,255,255,0.6)' };
  const wall = g.createLinearGradient(0, 0, 0, 512);
  wall.addColorStop(0, P.top); wall.addColorStop(1, P.bottom);
  g.fillStyle = wall; g.fillRect(0, 0, 1024, 512);
  if (kind === 'hot') {         // 左边看不见的炉口映在墙上的火光
    const fire = g.createRadialGradient(90, 330, 20, 90, 330, 380);
    fire.addColorStop(0, 'rgba(255,120,40,0.5)'); fire.addColorStop(0.5, 'rgba(255,140,60,0.16)'); fire.addColorStop(1, 'rgba(255,140,60,0)');
    g.fillStyle = fire; g.fillRect(0, 0, 1024, 512);
  }
  // 斜进来的窗光
  blur(12);
  g.fillStyle = P.light;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const x = 760 + i * 104 + j * 30, y = 60 + j * 150;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 84, y - 16); g.lineTo(x + 114, y + 118); g.lineTo(x + 30, y + 134); g.closePath(); g.fill();
    }
  }
  blur(0);
  // 壁龛
  const cx = 512, half = 168, top = 52;
  const arch = () => { g.beginPath(); g.moveTo(cx - half, 512); g.lineTo(cx - half, top + half); g.arc(cx, top + half, half, Math.PI, 0); g.lineTo(cx + half, 512); g.closePath(); };
  const niche = g.createLinearGradient(0, top, 0, 512);
  niche.addColorStop(0, P.nicheLow); niche.addColorStop(0.35, P.niche); niche.addColorStop(1, P.nicheLow);
  arch(); g.fillStyle = niche; g.fill();
  g.save(); arch(); g.clip();   // 壁龛内侧左上的一道影子，给它一点进深
  blur(14); g.strokeStyle = P.edge; g.lineWidth = 34;
  g.beginPath(); g.moveTo(cx - half - 6, 512); g.lineTo(cx - half - 6, top + half); g.arc(cx, top + half, half + 6, Math.PI, Math.PI * 1.75); g.stroke();
  blur(0); g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  r.addColorStop(0, 'rgba(60,35,20,0.5)'); r.addColorStop(0.55, 'rgba(60,35,20,0.16)'); r.addColorStop(1, 'rgba(60,35,20,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,190,110,0.9)'); r.addColorStop(0.4, 'rgba(255,120,40,0.35)'); r.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;   // 比 ACES 更保色，热玻璃的橙不会被洗白
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.1, 9.2);
  camera.lookAt(0, -0.05, 0);

  // 背景：一张不透明的面，在着色器里从"夜里的热作间"过渡到"退火后的早晨"
  const backdropMat = new THREE.ShaderMaterial({
    uniforms: { hot: { value: backdropTexture('hot') }, cold: { value: backdropTexture('cold') }, mixv: { value: 0 }, fire: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D hot; uniform sampler2D cold; uniform float mixv; uniform float fire; varying vec2 vUv;
      void main(){ vec3 a = texture2D(hot, vUv).rgb * (1.0 + 0.07 * fire); vec3 b = texture2D(cold, vUv).rgb;
      gl_FragColor = vec4(mix(a, b, mixv), 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
  });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), backdropMat);
  backdrop.position.set(0, 0.2, -6);
  scene.add(backdrop);

  // 桌面：热的时候是橡木工作台，凉了以后是浅色的陈列台
  const tableMat = new THREE.MeshStandardMaterial({ color: 0xe2cdb0, roughness: 0.78, metalness: 0 });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(40, 18), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.position.set(0, FLOOR_Y - 0.1, 3);
  scene.add(table);

  // 展台：一块奶油色的洞石圆台
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0xf3ecdf, roughness: 0.85, metalness: 0 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.1, 96), plinthMat);
  plinth.position.y = FLOOR_Y - 0.05;
  scene.add(plinth);

  // 两片假的接触阴影：作品落在展台上，展台落在桌面上
  const shadowTex = shadowTexture();
  const mkShadow = (y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; scene.add(m); return m;
  };
  const pieceShadow = mkShadow(FLOOR_Y + 0.004);
  const plinthShadow = mkShadow(FLOOR_Y - 0.094);

  // 吹管
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 5, 20),
    new THREE.MeshStandardMaterial({ color: 0xa9a39b, roughness: 0.32, metalness: 0.9 }),
  );
  pipe.position.y = PIPE_Y + 2.5;
  scene.add(pipe);

  // 灯光
  const fireLight = new THREE.PointLight(0xff8a3a, 12, 20, 1.6);
  fireLight.position.set(-4.5, 0.5, 2.5);
  scene.add(fireLight);
  const dayLight = new THREE.DirectionalLight(0xfff6e8, 1.4);
  dayLight.position.set(3, 5, 4);
  scene.add(dayLight);

  // 玻璃
  const group = new THREE.Group();
  group.position.y = PIPE_Y;
  scene.add(group);

  const vertCount = ROWS * (SEG + 1);
  const pos = new Float32Array(vertCount * 3);
  const nor = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const idx = [];
  for (let k = 0; k < ROWS; k++) {
    for (let j = 0; j <= SEG; j++) {
      const o = (k * (SEG + 1) + j) * 2;
      uv[o] = j / SEG; uv[o + 1] = k / (ROWS - 1);
    }
  }
  for (let k = 0; k < ROWS - 1; k++) {
    for (let j = 0; j < SEG; j++) {
      const a = k * (SEG + 1) + j, b = a + SEG + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const COS = new Float32Array(SEG + 1), SIN = new Float32Array(SEG + 1);
  for (let j = 0; j <= SEG; j++) { COS[j] = Math.cos(j / SEG * Math.PI * 2); SIN[j] = Math.sin(j / SEG * Math.PI * 2); }

  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = patternCanvas.height = 512;
  const patternTex = new THREE.CanvasTexture(patternCanvas);
  patternTex.colorSpace = THREE.SRGBColorSpace;
  patternTex.wrapS = THREE.RepeatWrapping;
  patternTex.anisotropy = 4;

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: patternTex,
    transmission: 1, thickness: 0.3, ior: 1.5, roughness: 0.05, metalness: 0,
    attenuationColor: new THREE.Color(0xffffff), attenuationDistance: 1.2,
    emissive: new THREE.Color(0xff5a12), emissiveIntensity: 0, dispersion: 0.3,
    specularIntensity: 1, envMapIntensity: 1.1, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, glass);
  group.add(mesh);

  // 瓶口的唇边：敲下来之后火抛光出的一圈圆润的边
  const lip = new THREE.Mesh(new THREE.TorusGeometry(NECK_R, 0.02, 12, 48), glass);
  lip.rotation.x = Math.PI / 2;
  group.add(lip);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  scene.add(glow);

  const rowR = new Float32Array(ROWS), rowY = new Float32Array(ROWS);
  let curLength = 1, curMaxR = 0.3;

  // 把剖面数据变成网格。flat∈[0,1]：定型时把圆底压出一个能站住的平底
  function build(profile, length, flat) {
    curLength = length; curMaxR = 0;
    const yFloor = -length * (1 - 0.045 * flat);
    // 圆底的高度跟着底部半径走，这样无论胖瘦都收成一个接近半球的底
    const endR = sampleProfile(profile, 0.8);
    const capStart = 1 - Math.min(Math.max(0.85 * endR / length, 0.06), 0.45);
    for (let k = 0; k < ROWS; k++) {
      let t, cap = 1;
      if (k < BODY_ROWS) t = (k / BODY_ROWS) * capStart;
      else {
        const a = ((k - BODY_ROWS) / CAP_ROWS) * Math.PI / 2;
        t = capStart + (1 - capStart) * Math.sin(a); cap = Math.cos(a);
      }
      rowR[k] = sampleProfile(profile, Math.min(t, capStart)) * cap;
      rowY[k] = Math.max(-length * t, yFloor);
      if (rowR[k] > curMaxR) curMaxR = rowR[k];
    }
    for (let k = 0; k < ROWS; k++) {
      const a = Math.max(k - 1, 0), b = Math.min(k + 1, ROWS - 1);
      let dr = rowR[b] - rowR[a], dy = rowY[b] - rowY[a];
      let nr = -dy, ny = dr;
      const len = Math.hypot(nr, ny) || 1;
      nr /= len; ny /= len;
      if (k === ROWS - 1) { nr = 0; ny = -1; }
      for (let j = 0; j <= SEG; j++) {
        const o = (k * (SEG + 1) + j) * 3;
        pos[o] = rowR[k] * COS[j]; pos[o + 1] = rowY[k]; pos[o + 2] = rowR[k] * SIN[j];
        nor[o] = nr * COS[j]; nor[o + 1] = ny; nor[o + 2] = nr * SIN[j];
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  // 目标形状和显示形状分开：显示形状以约 70ms 的半衰期追上目标，拖动时既跟手又不生硬
  const shown = new Float32Array(N), target = new Float32Array(N);
  let shownLen = 1, targetLen = 1, shownFlat = 0, targetFlat = 0, settled = false;
  function setShape(profile, length, flat = 0, snap = false) {
    target.set(profile); targetLen = length; targetFlat = flat; settled = false;
    if (snap) { shown.set(profile); shownLen = length; shownFlat = flat; build(shown, shownLen, shownFlat); settled = true; }
  }
  function ease(dt) {
    if (settled) return;
    const k = dt > 0 ? 1 - Math.exp(-0.693 * dt / 0.07) : 1;
    let err = Math.abs(targetLen - shownLen) + Math.abs(targetFlat - shownFlat);
    for (let i = 0; i < N; i++) { const d = target[i] - shown[i]; shown[i] += d * k; err += Math.abs(d); }
    shownLen += (targetLen - shownLen) * k; shownFlat += (targetFlat - shownFlat) * k;
    if (err < 1e-4) { shown.set(target); shownLen = targetLen; shownFlat = targetFlat; settled = true; }
    build(shown, shownLen, shownFlat);
  }

  // 料色：底色 + 碎料/螺旋纹。纹样让"转料"看得见
  function setColor(body, pattern, seed) {
    const g = patternCanvas.getContext('2d');
    const rnd = mulberry(seed || 1);
    g.globalAlpha = 1;
    g.fillStyle = body.tint; g.fillRect(0, 0, 512, 512);
    if (pattern === 'frit') {
      for (let i = 0; i < 230; i++) {
        const x = rnd() * 512, y = rnd() * 512, w = 3 + rnd() * 9, h = 6 + rnd() * 26;
        g.fillStyle = body.accents[Math.floor(rnd() * body.accents.length)];
        g.globalAlpha = 0.55 + rnd() * 0.4;
        for (const dx of [-512, 0, 512]) { g.beginPath(); g.ellipse(x + dx, y, w, h, 0, 0, Math.PI * 2); g.fill(); }
      }
    } else if (pattern === 'swirl') {
      const stripes = 7;
      g.lineCap = 'round';
      for (let i = 0; i < stripes; i++) {
        g.strokeStyle = body.accents[i % body.accents.length];
        g.globalAlpha = 0.85; g.lineWidth = 14 + rnd() * 12;
        const x0 = (i / stripes) * 512;
        for (const dx of [-1024, -512, 0, 512]) { g.beginPath(); g.moveTo(x0 + dx, -20); g.lineTo(x0 + dx + 512, 532); g.stroke(); }
      }
    }
    g.globalAlpha = 1;
    patternTex.needsUpdate = true;
    glass.attenuationColor.set(body.deep);
    glass.attenuationDistance = body.clear ? 6 : 1.1;
  }

  // ---------- 缠丝作品：透明树干 + 底座 + 丝 + 小珠 + 星 ----------
  const wind = new THREE.Group();
  wind.position.y = FLOOR_Y;
  wind.visible = false;
  scene.add(wind);
  const clearGlass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, thickness: 0.2, ior: 1.5, roughness: 0.03,
    attenuationColor: new THREE.Color(0xe6f3ec), attenuationDistance: 2,
  });
  // 树干单独一份材质：做树时是透明的，做花时染成花茎的绿
  const stemGlass = clearGlass.clone();
  const STEM_CLEAR = new THREE.Color(0xffffff), STEM_GREEN = new THREE.Color(0x8fce8f);
  let stemGreen = 0;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, W_Y_MAX + 0.12, 16), stemGlass);
  stem.position.y = (W_Y_MAX + 0.12) / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.48, 0.05, 48), clearGlass);
  foot.position.y = 0.025;
  wind.add(stem, foot);
  // 丝很细又层层叠叠，用半透明 + 强高光来表现，比透射更像真的：能一层层看进去
  const threadMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, transparent: true, opacity: 0.74, roughness: 0.04, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.7, depthWrite: false, side: THREE.DoubleSide,
  });
  const strand = createStrand(W_MAX_POINTS);
  const strandMesh = new THREE.Mesh(strand.geo, threadMat);
  strandMesh.renderOrder = 2;
  wind.add(strandMesh);
  const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
  const threadPalette = BODIES.map((b) => (b.clear ? new THREE.Color(0xf4fbf7) : mix(b.tint, b.deep, 0.45)));
  const bodyPalette = BODIES.map((b) => (b.clear ? new THREE.Color(0xf2f8f4) : mix(b.tint, b.deep, 0.6)));
  const dropPalette = BODIES.map((b) => (b.clear ? new THREE.Color(0xffffff) : mix(b.tint, '#ffffff', 0.45)));
  const dotPalette = BODIES.map((b) => (b.clear ? new THREE.Color(0xf7fbf8) : mix(b.deep, '#000000', 0.12)));
  // 骨架：六根玻璃条从底圈的六个角收到树干顶，再加一圈底边。做树时一开始就摆在那里
  const cage = new THREE.Group();
  cage.visible = false;
  wind.add(cage);
  {
    const UP = new THREE.Vector3(0, 1, 0);
    const bar = (ax, ay, az, bx, by, bz, rad) => {
      const A = new THREE.Vector3(ax, ay, az), B = new THREE.Vector3(bx, by, bz), d = B.clone().sub(A);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, d.length(), 8), clearGlass);
      m.position.copy(A).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(UP, d.normalize());
      cage.add(m);
    };
    const rb = frameR(F_Y0), rt = frameR(W_Y_MAX);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, b = (k + 1) * Math.PI / 3;
      bar(Math.cos(a) * rb, F_Y0, Math.sin(a) * rb, Math.cos(a) * rt, W_Y_MAX, Math.sin(a) * rt, 0.017);     // 棱
      bar(Math.cos(a) * rb, F_Y0, Math.sin(a) * rb, Math.cos(b) * rb, F_Y0, Math.sin(b) * rb, 0.017);          // 底边
      bar(Math.cos(a) * rb, F_Y0, Math.sin(a) * rb, 0, F_Y0 - 0.12, 0, 0.011);                                 // 底圈连回树干的撑
    }
  }
  let frameHint = true;
  function setFrameHint(v) { frameHint = v; }

  // 玻璃体：丝缠得够密以后，看上去就不再是一圈圈线，而是一整块通透的玻璃，丝只是它表面的纹理。
  // 这里用一层随着缠绕慢慢"长"出来的壳来表现：哪一层缠得多，哪一层就越饱满、颜色越浓
  const BODY_ROWS_W = 44, BODY_SEG = 48;
  const bodyPos = new Float32Array((BODY_ROWS_W + 1) * (BODY_SEG + 1) * 3);
  const bodyCol = new Float32Array((BODY_ROWS_W + 1) * (BODY_SEG + 1) * 3);
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(bodyPos, 3).setUsage(THREE.DynamicDrawUsage));
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(bodyCol, 3).setUsage(THREE.DynamicDrawUsage));
  {
    const bi = [];
    for (let k = 0; k < BODY_ROWS_W; k++) for (let j = 0; j < BODY_SEG; j++) {
      const a = k * (BODY_SEG + 1) + j, b = a + BODY_SEG + 1;
      bi.push(a, a + 1, b, b, a + 1, b + 1);
    }
    bodyGeo.setIndex(bi);
  }
  bodyGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 3);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, transmission: 0.92, thickness: 0.5, ior: 1.45, roughness: 0.22,
    envMapIntensity: 0.9, side: THREE.DoubleSide,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  wind.add(bodyMesh);
  const binR = new Float32Array(BODY_ROWS_W + 1), binN = new Float32Array(BODY_ROWS_W + 1);
  const binC = new Float32Array((BODY_ROWS_W + 1) * 3), tmpR = new Float32Array(BODY_ROWS_W + 1);
  function buildBody(pts) {
    binR.fill(0); binN.fill(0); binC.fill(0);
    const span = W_Y_MAX - W_Y_MIN;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const b = Math.min(Math.max(Math.round(((p.y - W_Y_MIN) / span) * BODY_ROWS_W), 0), BODY_ROWS_W);
      if (p.r > binR[b]) binR[b] = p.r;
      binN[b]++;
      const c = bodyPalette[p.c] || bodyPalette[0];
      binC[b * 3] += c.r; binC[b * 3 + 1] += c.g; binC[b * 3 + 2] += c.b;
    }
    // 一层的丝越多，壳越接近丝的外沿；丝很少时壳缩在里面几乎看不见
    // 几圈的时候看得见骨架，壳还没有；叠到上百圈，壳才长出来贴在丝的里侧
    for (let b = 0; b <= BODY_ROWS_W; b++) {
      const k = Math.min(Math.max((binN[b] - 50) / 420, 0), 1);
      tmpR[b] = binR[b] * (0.8 + 0.14 * k) * Math.sqrt(k);
    }
    for (let b = 0; b <= BODY_ROWS_W; b++) {
      const lo = tmpR[Math.max(b - 1, 0)], hi = tmpR[Math.min(b + 1, BODY_ROWS_W)];
      const r = Math.max(tmpR[b] * 0.6 + (lo + hi) * 0.2, 0.0005);
      const n = Math.max(binN[b], 1), y = W_Y_MIN + (b / BODY_ROWS_W) * span;
      const cr = binN[b] ? binC[b * 3] / n : 1, cg = binN[b] ? binC[b * 3 + 1] / n : 1, cb = binN[b] ? binC[b * 3 + 2] / n : 1;
      for (let j = 0; j <= BODY_SEG; j++) {
        const a = (j / BODY_SEG) * Math.PI * 2, rr = r * ribFactor(a), o = (b * (BODY_SEG + 1) + j) * 3;
        bodyPos[o] = Math.cos(a) * rr; bodyPos[o + 1] = y; bodyPos[o + 2] = Math.sin(a) * rr;
        bodyCol[o] = cr; bodyCol[o + 1] = cg; bodyCol[o + 2] = cb;
      }
    }
    bodyGeo.attributes.position.needsUpdate = true;
    bodyGeo.attributes.color.needsUpdate = true;
    bodyGeo.computeVertexNormals();
    bodyMesh.visible = pts.length > 0;
  }

  // 花瓣：薄玻璃片，颜色靠顶点色
  const petalMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, transmission: 0.86, thickness: 0.22, ior: 1.5, roughness: 0.05,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5,
  });
  const petals = createPetals(W_MAX_PETALS + 1);     // 多留一片给"正在拉、还没松手"的那片
  const petalPalette = BODIES.map((b) => (b.clear ? new THREE.Color(0xf7fbf8) : mix(b.tint, b.deep, 0.72)));   // 真的玻璃花颜色很浓
  wind.add(new THREE.Mesh(petals.geo, petalMat));
  const dots = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.036, 16, 12),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05 }),
    W_MAX_DOTS,
  );
  dots.count = 0; dots.frustumCulled = false;
  wind.add(dots);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.07 : 0.16, a = Math.PI / 2 + i * Math.PI / 5;
    starShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  const starMat = new THREE.MeshPhysicalMaterial({ color: 0xf2d24a, roughness: 0.22, clearcoat: 1 });
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.028, bevelThickness: 0.028, bevelSegments: 4 }), starMat);
  star.position.set(0, W_Y_MAX + 0.24, -0.04);
  star.visible = false;
  wind.add(star);
  // 手里那根料棒：烧红的头就在指针的位置
  const rod = new THREE.Group();
  const rodBody = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 12), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, thickness: 0.1, roughness: 0.05 }));
  rodBody.position.y = 2;
  const rodTipMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const rodTip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), rodTipMat);
  rod.add(rodBody, rodTip);
  rod.visible = false;
  scene.add(rod);

  let kind = 'blow', pitchShown = 0;
  const STEM_FULL = W_Y_MAX + 0.12;
  let stemCut = STEM_FULL, stemShown = STEM_FULL, hasPetals = false;
  const dummy = new THREE.Object3D();
  function setKind(k) { kind = k; }
  // 把整件缠丝作品画出来。from 给出时只补画新长出来的那一段丝
  // preview：正在拉的那片花瓣，只画不存
  function setWind(piece, from = 0, preview = null, now = performance.now() / 1000) {
    strand.build(piece.pts, threadPalette, from, now);
    cage.visible = Boolean(piece.frame) || (frameHint && piece.pts.length === 0 && piece.petals.length === 0 && !preview);
    buildBody(piece.pts);
    petals.build(preview ? piece.petals.concat(preview) : piece.petals, petalPalette);
    const n = Math.min(piece.dots.length, W_MAX_DOTS);
    for (let i = 0; i < n; i++) {
      const d = piece.dots[i];
      dummy.position.set(Math.cos(d.a) * d.r, d.y, Math.sin(d.a) * d.r);
      dummy.scale.setScalar(d.k ? 0.62 : (d.r < 0.14 ? 2.1 : 1));     // 花心的那颗大一些；丝尾的水滴小一些
      dummy.updateMatrix();
      dots.setMatrixAt(i, dummy.matrix);
      dots.setColorAt(i, (d.k ? dropPalette : dotPalette)[d.c] || dotPalette[0]);
    }
    dots.count = n;
    dots.instanceMatrix.needsUpdate = true;
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
    // 定型时把多出来的树干烧断：只留到最高的那片花瓣/那圈丝为止
    let top = 0.5;
    for (const q of piece.pts) if (q.y > top) top = q.y;
    for (const q of piece.petals) if (q.y > top) top = q.y;
    for (const q of piece.dots) if (q.r < 0.14 && q.y > top) top = q.y;
    stemCut = Math.min(top + (piece.star !== null ? 0.12 : 0.0), STEM_FULL);
    hasPetals = piece.petals.length > 0 || Boolean(preview);
    star.visible = piece.star !== null;
    if (piece.star !== null) starMat.color.copy(BODIES[piece.star].clear ? new THREE.Color(0xf2d24a) : mix(BODIES[piece.star].tint, BODIES[piece.star].deep, 0.5));
  }
  // 料棒头放到 (x, y)，和 windPoint 用同一套坐标；heat 决定它有多亮
  function setRod(x, y, visible, heat) {
    rod.visible = visible && kind === 'wind';
    rod.position.set(x, y + FLOOR_Y, 0.35);
    rod.rotation.z = x >= 0 ? -0.9 : 0.9;
    rodTipMat.color.copy(GLOW_LOW).lerp(GLOW_HIGH, Math.min(Math.max(heat, 0), 1));
    rodTip.scale.setScalar(0.8 + 0.6 * heat);
  }
  // 指针在 z=0 那个竖直平面上的位置，相对树干底部：x 是离树干的水平距离（带正负），y 是高度
  const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  function windPoint(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(planeZ, tmpV)) return null;
    return { x: tmpV.x, y: tmpV.y - FLOOR_Y };
  }
  // 点在丝上时，返回丝上那一点在树干坐标里的位置
  function windHit(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(strandMesh, false)[0];
    if (!hit) return null;
    const l = wind.worldToLocal(hit.point.clone());
    return { a: Math.atan2(l.z, l.x), r: Math.hypot(l.x, l.z), y: l.y };
  }

  const tmpV = new THREE.Vector3();
  // 黑体辐射的颜色：暗红 → 橙 → 蜜黄
  const GLOW_LOW = new THREE.Color(0xe22d00), GLOW_MID = new THREE.Color(0xff7600), GLOW_HIGH = new THREE.Color(0xffb969);
  let spin = 0, baseZ = 8.6, aspectFit = 1;

  // temp∈[0,1] 玻璃温度；cold∈[0,1] 0=在吹管上，1=已定型立在展台上；fire 炉火强度
  function frame({ temp, cold, fire, spinSpeed, dt, viewAngle, windSpin, pitch }) {
    ease(dt);
    spin += spinSpeed * dt;
    const e = cold < 1 ? cold * cold * (3 - 2 * cold) : 1;
    // 敲下后朝向不变：吹管口就是瓶口，圆底落到展台上
    mesh.rotation.y = spin + (viewAngle || 0);
    const standY = FLOOR_Y + curLength * (1 - 0.045);
    group.position.y = PIPE_Y + (standY - PIPE_Y) * e;
    // 定型后镜头推近，让作品成为画面主角；展台跟着作品的大小走
    const size = Math.max(curLength, curMaxR * 2.2);
    const nearZ = Math.max(4.2, size * 3.7) * aspectFit;
    camera.position.z = baseZ + (nearZ - baseZ) * e;
    camera.position.y = 0.1 + (FLOOR_Y + curLength * 0.62 - 0.1) * e;
    camera.lookAt(0, -0.05 + (FLOOR_Y + curLength * 0.5 - size * 0.2 + 0.05) * e, 0);
    const ps = Math.max(curMaxR * 1.7, 0.55) / 1.45;
    plinth.scale.set(ps, 1, ps);
    const isWind = kind === 'wind';
    group.visible = !isWind;
    wind.visible = isWind;
    if (!isWind) rod.visible = false;
    pipe.visible = !isWind && e < 0.02;
    lip.visible = e > 0.3;
    lip.scale.setScalar(0.6 + 0.4 * e);
    plinth.visible = isWind || e > 0.02;
    if (isWind) {
      // 缠丝：作品从头到尾都立在转台上，镜头只在定型时稍微推近
      wind.rotation.y = (windSpin || 0) + (viewAngle || 0);
      star.rotation.y = -wind.rotation.y;      // 星星始终正对着看的人
      // 有花瓣以后，树干只留到花心；没有花瓣时（比如一棵树）到定型才烧断多余的一截
      stemShown += ((hasPetals ? stemCut : STEM_FULL + (stemCut - STEM_FULL) * e) - stemShown) * (dt > 0 ? 1 - Math.exp(-dt / 0.2) : 1);
      const sh = stemShown;
      stemGreen += ((hasPetals ? 1 : 0) - stemGreen) * (dt > 0 ? 1 - Math.exp(-dt / 0.3) : 1);
      stemGlass.color.copy(STEM_CLEAR).lerp(STEM_GREEN, stemGreen);
      stemGlass.transmission = 1 - 0.35 * stemGreen;
      stem.scale.y = sh / STEM_FULL; stem.position.y = sh / 2;
      star.position.y = sh + 0.12;
      // 镜头绕着作品抬高或放平：看树用平视，看花要俯视才看得到花面
      pitchShown += ((pitch || 0) - pitchShown) * (dt > 0 ? 1 - Math.exp(-dt / 0.22) : 1);
      const dist = (7.6 - 0.9 * e) * aspectFit, ty = FLOOR_Y + 0.98 + 0.1 * e + 0.25 * pitchShown;
      camera.position.set(0, ty + Math.sin(pitchShown + 0.06) * dist, Math.cos(pitchShown + 0.06) * dist);
      camera.lookAt(0, ty, 0);
      plinth.scale.set(0.62, 1, 0.62);
    }
    tableMat.color.setHex(0xe2cdb0).lerp(tmpColor.setHex(0xefe6d6), e);
    pieceShadow.material.opacity = isWind ? 0.7 : e * 0.9;
    pieceShadow.scale.setScalar(isWind ? 1.5 : Math.max(curMaxR * 2.6, 0.5));
    plinthShadow.material.opacity = isWind ? 0.7 : e * 0.75;
    plinthShadow.scale.setScalar((isWind ? 0.62 : ps) * 1.45 * 2.9);

    const heat = Math.max(temp, 0);
    const glowAmt = Math.pow(heat, 1.6);
    if (heat < 0.55) glass.emissive.copy(GLOW_LOW).lerp(GLOW_MID, heat / 0.55);
    else glass.emissive.copy(GLOW_MID).lerp(GLOW_HIGH, (heat - 0.55) / 0.45);
    glass.emissiveIntensity = glowAmt * 1.25;
    glass.envMapIntensity = 1.1 - 0.75 * glowAmt;
    glass.color.setRGB(1, 1, 1).lerp(tmpColor.setHex(0xf2601a), Math.min(glowAmt * 1.1, 1));
    glass.transmission = 1 - 0.9 * Math.min(glowAmt * 1.2, 1);
    glass.roughness = 0.05 + 0.25 * glowAmt;
    glass.thickness = 0.1 + 0.12 * curMaxR;

    group.getWorldPosition(tmpV);
    const midY = tmpV.y - curLength * 0.55;
    glow.position.set(0, midY, 0.2);
    const gs = (curMaxR * 2 + curLength) * 1.9;
    glow.scale.set(gs, gs, 1);
    glow.material.opacity = isWind ? 0 : glowAmt * 0.38;

    backdropMat.uniforms.mixv.value = e;
    backdropMat.uniforms.fire.value = fire;
    fireLight.intensity = (1 - e) * (10 + 45 * fire);
    dayLight.intensity = 1.4 + 0.8 * e;
    renderer.toneMappingExposure = 1.05;
    renderer.render(scene, camera);
  }
  const tmpColor = new THREE.Color();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 窄屏时拉远一点，保证作品完整入画
    aspectFit = Math.max(1, 1.15 / camera.aspect);
    baseZ = 8.6 * aspectFit;
    camera.position.z = baseZ;
    camera.updateProjectionMatrix();
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // 命中玻璃时返回沿轴位置 t∈[0,1]（0=吹管口，1=底），没命中返回 null
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit) return null;
    const local = mesh.worldToLocal(hit.point.clone());
    return Math.min(Math.max(-local.y / curLength, 0), 1);
  }

  // 作品轴线在屏幕上的 x，以及"1 个世界单位 = 多少像素"
  function metrics() {
    const r = canvas.getBoundingClientRect();
    camera.updateMatrixWorld();
    tmpV.set(0, group.position.y, 0).project(camera);
    const axisX = r.left + (tmpV.x * 0.5 + 0.5) * r.width;
    const pxPerUnit = r.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z);
    return { axisX, pxPerUnit };
  }

  // 截一张方形小图。必须紧跟在一次渲染之后调用
  function snapshot(size = 320) {
    const src = renderer.domElement;
    const side = Math.min(src.width, src.height) * 0.86;
    const out = document.createElement('canvas');
    out.width = out.height = size;
    out.getContext('2d').drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, size, size);
    return out.toDataURL('image/jpeg', 0.82);
  }
  // 导出一张 4:5 的作品卡片：拱形窗里是作品，下面是名字。必须紧跟在一次渲染之后调用
  function card(name, line) {
    const src = renderer.domElement;
    const W = 1080, H = 1350, out = document.createElement('canvas');
    out.width = W; out.height = H;
    const g = out.getContext('2d');
    g.fillStyle = '#f6efe2'; g.fillRect(0, 0, W, H);
    const x0 = 110, x1 = 970, top = 90, bottom = 1010, r = (x1 - x0) / 2;
    const arch = () => { g.beginPath(); g.moveTo(x0, bottom); g.lineTo(x0, top + r); g.arc(x0 + r, top + r, r, Math.PI, 0); g.lineTo(x1, bottom); g.closePath(); };
    g.save(); arch(); g.clip();
    const sh = src.height * 0.94, sw = Math.min(sh * (x1 - x0) / (bottom - top), src.width);
    g.drawImage(src, (src.width - sw) / 2, src.height * 0.02, sw, sh, x0, top, x1 - x0, bottom - top);
    g.restore();
    arch(); g.strokeStyle = '#dcd3bf'; g.lineWidth = 3; g.stroke();
    g.textAlign = 'center'; g.fillStyle = '#26332a';
    let size = 84;
    do { g.font = `italic 500 ${size}px Fraunces, "Songti SC", Georgia, serif`; size -= 4; } while (g.measureText(name).width > W - 200 && size > 36);
    g.fillText(name, W / 2, 1142);
    g.fillStyle = '#5f6e60'; g.font = 'italic 400 32px Fraunces, "Songti SC", Georgia, serif';
    g.fillText(line, W / 2, 1218);
    g.fillStyle = '#f2d98d'; g.beginPath(); g.arc(W / 2, 1276, 9, 0, Math.PI * 2); g.fill();
    return out.toDataURL('image/png');
  }

  return { setShape, setColor, frame, resize, pick, metrics, snapshot, card, setKind, setWind, setFrameHint, setRod, windPoint, windHit };
}
