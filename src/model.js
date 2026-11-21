// 作品数据与塑形规则。纯函数，不碰 DOM，方便单独测试。
export const N = 40;            // 剖面采样点数：profile[i] 是第 i 个高度上的半径
export const NECK_R = 0.1;      // 吹管口半径，始终固定
export const R_MIN = 0.07;
export const R_MAX = 1.05;
export const L_MIN = 0.45;
export const L_MAX = 2.6;

// 温度是 0..1 的简化量。下面三个阈值决定"能不能动"
export const T_STIFF = 0.3;     // 低于它完全拉不动
export const T_SOFT = 0.62;     // 高于它完全柔软
export const COOL_SECONDS = 26; // 离炉后大约这么久从最热降到拉不动
export const HEAT_SECONDS = 2.4;// 回炉烧到最热需要的时间

export const BODIES = [
  { id: 'clear', swatch: '#eef2ef', name: 'Clear', tint: '#f6f8f5', deep: '#e4f1ea', accents: ['#5b8fd0', '#eeb25a', '#ffffff'], clear: true },
  { id: 'sea', swatch: '#86c3dc', name: 'Sea', tint: '#a9d8e8', deep: '#4a9cc4', accents: ['#ffffff', '#3f7fb0', '#d9f1f7'] },
  { id: 'amber', swatch: '#e9b05c', name: 'Amber', tint: '#f4cd86', deep: '#d68a2c', accents: ['#fff6dd', '#b8641c', '#ffe7a8'] },
  { id: 'moss', swatch: '#9cc48c', name: 'Moss', tint: '#bcd9a8', deep: '#5f9a5c', accents: ['#f6ffe9', '#3f7a48', '#e3f0c4'] },
  { id: 'rose', swatch: '#e896ae', name: 'Rose', tint: '#f3bccb', deep: '#d0668a', accents: ['#ffffff', '#b04670', '#ffe1e8'] },
  { id: 'smoke', swatch: '#a495cf', name: 'Smoke', tint: '#c9bde0', deep: '#7b68ad', accents: ['#f6f1ff', '#5a4a94', '#e4dcf5'] },
  { id: 'pine', swatch: '#62ad78', name: 'Pine', tint: '#9fd8a4', deep: '#2f8a4e', accents: ['#f1fff0', '#1f6a3a', '#d6f0c8'] },
  { id: 'berry', swatch: '#d4605f', name: 'Berry', tint: '#f29a96', deep: '#b3202c', accents: ['#fff1ee', '#8a1420', '#ffd0c8'] },
  { id: 'ink', swatch: '#2f2b36', name: 'Ink', tint: '#8f8a99', deep: '#1c1a24', accents: ['#f2f0f6', '#0f0e14', '#c9c5d4'] },
];
export const PATTERNS = [
  { id: 'plain', name: '纯色' },
  { id: 'frit', name: '碎料' },
  { id: 'swirl', name: '螺旋' },
];

export function bodyById(id) { return BODIES.find((b) => b.id === id) || BODIES[0]; }

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function softness(temp) { return smooth(T_STIFF, T_SOFT, temp); }

// 显示用的摄氏度。钠钙玻璃的简化刻度：退火点约 500°C，可塑区间约 700–1100°C
export function celsius(temp) { return Math.round((480 + clamp(temp, 0, 1) * 670) / 10) * 10; }

// 刚从炉里挑出来的一小团料
export function newPiece(seed) {
  const profile = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    profile.push(NECK_R + 0.16 * smooth(0, 0.35, t));
  }
  return { kind: 'blow', profile, length: 0.62, body: 'sea', pattern: 'frit', seed: seed || 1 };
}

// 吹气：料泡从吹管口往下逐渐鼓开，长度跟着直径一起长，吹出来是一只水滴形的泡。
// 越接近上限越慢。返回是否还吹得动
export function blow(piece, soft, dt) {
  if (soft <= 0) return false;
  const rate = 0.34 * soft * dt;
  let moved = false, maxR = 0;
  for (let i = 1; i < N; i++) {
    const t = i / (N - 1);
    const w = smooth(0, 0.62, t);
    const room = 1 - piece.profile[i] / R_MAX;
    if (room > 0.02) moved = true;
    piece.profile[i] = clamp(piece.profile[i] + rate * w * Math.max(room, 0), R_MIN, R_MAX);
    if (piece.profile[i] > maxR) maxR = piece.profile[i];
  }
  const wanted = Math.min(0.4 + 2.5 * maxR, L_MAX);
  if (piece.length < wanted) piece.length = Math.min(piece.length + rate * 3.2, wanted);
  return moved;
}

// 拉/收：以 t0 为中心的一段跟着动，两侧按高斯衰减；随后轻轻抹平，避免尖刺
export function pull(piece, t0, dr, soft) {
  if (soft <= 0 || !Number.isFinite(dr)) return;
  const sigma = 0.11;
  const p = piece.profile;
  for (let i = 1; i < N; i++) {
    const t = i / (N - 1);
    const w = Math.exp(-((t - t0) ** 2) / (2 * sigma * sigma)) * smooth(0, 0.08, t);
    p[i] = clamp(p[i] + dr * soft * w, R_MIN, R_MAX);
  }
  for (let i = 1; i < N - 1; i++) {
    const t = i / (N - 1);
    const w = Math.exp(-((t - t0) ** 2) / (2 * (sigma * 1.6) ** 2));
    p[i] = clamp(p[i] + 0.12 * w * (p[i - 1] + p[i + 1] - 2 * p[i]), R_MIN, R_MAX);
  }
  p[0] = NECK_R;
}

// 抻长/墩短：抓着底部上下拖
export function stretch(piece, dl, soft) {
  if (soft <= 0 || !Number.isFinite(dl)) return;
  const before = piece.length;
  piece.length = clamp(before + dl * soft, L_MIN, L_MAX);
  // 抻长时料会变细一点，墩短时变粗一点，让动作有"料是守恒的"感觉
  const k = Math.sqrt(before / piece.length);
  for (let i = 1; i < N; i++) piece.profile[i] = clamp(piece.profile[i] * k, R_MIN, R_MAX);
}

export function clonePiece(p) {
  if (p.kind === 'wind') return { ...p, pts: p.pts.map((q) => ({ ...q })), dots: p.dots.map((d) => ({ ...d })), petals: p.petals.map((d) => ({ ...d })) };
  return { ...p, profile: p.profile.slice() };
}

// 读回存档时做体检：任何不合法的数字都修正，绝不把 NaN 交给渲染
export function sanitizePiece(raw) {
  if (raw && raw.kind === 'wind') return sanitizeWind(raw);
  if (!raw || !Array.isArray(raw.profile) || raw.profile.length !== N) return null;
  const profile = raw.profile.map((v) => (Number.isFinite(v) ? clamp(v, R_MIN, R_MAX) : NECK_R));
  profile[0] = NECK_R;
  return {
    kind: 'blow',
    profile,
    length: Number.isFinite(raw.length) ? clamp(raw.length, L_MIN, L_MAX) : 1,
    body: bodyById(raw.body).id,
    pattern: PATTERNS.some((p) => p.id === raw.pattern) ? raw.pattern : 'plain',
    seed: Number.isFinite(raw.seed) ? raw.seed : 1,
  };
}

// ---------- 缠丝（灯工）----------
// 一件缠丝作品 = 一根透明树干 + 许多根丝（pts）+ 点上去的小珠（dots）+ 可选的一颗星（star）。
// 所有位置都记在树干自己的坐标里：a 角度，r 离树干的距离，y 离台面的高度。
export const W_Y_MIN = 0.22;     // 丝能缠到的最低处
export const W_Y_MAX = 2.1;      // 最高处（树干顶）
export const W_R_MIN = 0.045;
export const W_R_MAX = 1.05;
export const W_MAX_POINTS = 16000; // 一根料棒能拉出的丝的总量
export const W_MAX_DOTS = 420;
export const W_MAX_PETALS = 72;
export const P_LEN_MIN = 0.14;   // 短于这个长度不算一片花瓣
export const P_LEN_MAX = 1.05;
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));   // 约 137.5°：真花的花瓣就是按这个角度一片片错开的
export const W_STEP = Math.PI * 2 / 18;   // 每转过这么多角度记一个点

// 丝是绕在一个六根玻璃条搭的锥形骨架上的，所以每一圈不是正圆，而是带六个棱角。
// 返回这个方向上半径要乘的系数：棱上是 1，两根棱中间略微凹进去
const RIB = Math.PI / 3;
export function ribFactor(a) {
  const d = ((a % RIB) + RIB) % RIB;
  return 1 - 0.55 * (1 - Math.cos(RIB / 2) / Math.cos(d - RIB / 2));
}

// ---- 骨架：做树之前先用玻璃条搭好的那个锥形。树的形状从一开始就在这里，丝只是一层层叠上去 ----
export const F_Y0 = 0.5;          // 骨架底圈的高度（下面留一截光树干）
export const F_R0 = 0.6;          // 骨架底圈的半径
export const F_BINS = 44;         // 沿高度分成这么多层，各层分别记已经叠了多少丝
// 骨架在高度 y 处的半径：底下宽，到树干顶收成一个尖
export function frameR(y) {
  const u = clamp((y - F_Y0) / (W_Y_MAX - F_Y0), 0, 1);
  return 0.045 + F_R0 * (1 - u);
}
export function frameBin(y) { return clamp(Math.round(((y - F_Y0) / (W_Y_MAX - F_Y0)) * F_BINS), 0, F_BINS); }
// 这一层已经有 n 个点的丝时，丝堆出来的厚度。开始长得快，越厚越慢
export function layerDepth(n) { return 0.19 * (1 - Math.exp(-n / 320)); }
// 数一遍各层现在叠了多少丝（读档、撤销之后用）
export function countLayers(piece) {
  const bins = new Float32Array(F_BINS + 1);
  for (const p of piece.pts) bins[frameBin(p.y)]++;
  return bins;
}

// form：'tree' 在骨架上缠一棵树；'flower' 在花茎上拉一朵花。两种是分开的入口，工具互不混用
export function newWind(seed, form = 'tree') {
  return { kind: 'wind', form: form === 'flower' ? 'flower' : 'tree', pts: [], dots: [], petals: [], star: null, frame: false, body: form === 'flower' ? 'rose' : 'pine', seed: seed || 1 };
}

// 丝的粗细跟着玻璃的软硬走：刚烧透时拉出来像头发丝，快凉时是一条粗带
export function threadWidth(soft) { return 0.008 + 0.017 * (1 - clamp(soft, 0, 1)) ** 1.3; }

const colorIndex = (id) => Math.max(BODIES.findIndex((b) => b.id === id), 0);

export function addThreadPoint(piece, a, r, y, w, bodyId, first) {
  if (piece.pts.length >= W_MAX_POINTS) return false;
  if (![a, r, y, w].every(Number.isFinite)) return false;
  piece.pts.push({ a, r: clamp(r, W_R_MIN, W_R_MAX), y: clamp(y, W_Y_MIN, W_Y_MAX), w: clamp(w, 0.003, 0.03), c: colorIndex(bodyId), b: first ? 1 : 0 });
  return true;
}
// k=1 表示这是丝尾烧断时留下的一颗小水滴，不是用户点上去的珠子
export function addDot(piece, a, r, y, bodyId, k = 0) {
  if (piece.dots.length >= W_MAX_DOTS || ![a, r, y].every(Number.isFinite)) return false;
  piece.dots.push({ a, r: clamp(r, 0, W_R_MAX + 0.1), y: clamp(y, 0.05, W_Y_MAX + 0.1), c: colorIndex(bodyId), k: k ? 1 : 0 });
  return true;
}

// 一片花瓣：从树干上高度 y 的地方、朝 a 这个方向长出去，长 len，仰角 tilt（0 = 平伸，正 = 往上翘）
// wd 是宽长比：玻璃越软，压出来的花瓣越圆越宽；快凉时压出来是窄长的
export function makePetal(a, y, len, tilt, bodyId, wd = 0.7) {
  if (![a, y, len, tilt].every(Number.isFinite)) return null;
  return { a, y: clamp(y, 0.1, W_Y_MAX + 0.05), len: clamp(len, P_LEN_MIN, P_LEN_MAX), tilt: clamp(tilt, -0.9, 1.45), wd: Number.isFinite(wd) ? clamp(wd, 0.35, 1) : 0.7, c: colorIndex(bodyId) };
}
export function petalWidth(soft) { return 0.5 + 0.42 * clamp(soft, 0, 1); }
export function addPetal(piece, petal) {
  if (!petal || piece.petals.length >= W_MAX_PETALS) return false;
  piece.petals.push(petal);
  return true;
}

// 存盘时把丝压成一串整数，省地方
export function packPiece(p) {
  if (p.kind !== 'wind') return { ...p, profile: p.profile.slice() };
  const q = [];
  for (const t of p.pts) q.push(Math.round(t.a * 100), Math.round(t.r * 1000), Math.round(t.y * 1000), Math.round(t.w * 10000), t.c, t.b);
  const d = [];
  for (const t of p.dots) d.push(Math.round(t.a * 100), Math.round(t.r * 1000), Math.round(t.y * 1000), t.c, t.k ? 1 : 0);
  const pp = [];
  for (const t of p.petals) pp.push(Math.round(t.a * 100), Math.round(t.y * 1000), Math.round(t.len * 1000), Math.round(t.tilt * 100), t.c, Math.round(t.wd * 100));
  return { kind: 'wind', form: p.form, q, d2: d, pp, star: p.star, frame: p.frame ? 1 : 0, body: p.body, seed: p.seed };
}

function sanitizeWind(raw) {
  const out = newWind(Number.isFinite(raw.seed) ? raw.seed : 1);
  out.body = bodyById(raw.body).id;
  out.frame = raw.frame === 1 || raw.frame === true;
  const ci = (v) => (Number.isInteger(v) && v >= 0 && v < BODIES.length ? v : 0);
  out.star = Number.isInteger(raw.star) && raw.star >= 0 && raw.star < BODIES.length ? raw.star : null;
  if (Array.isArray(raw.q)) {
    for (let i = 0; i + 5 < raw.q.length && out.pts.length < W_MAX_POINTS; i += 6) {
      const [a, r, y, w, c, b] = raw.q.slice(i, i + 6);
      if (![a, r, y, w].every(Number.isFinite)) continue;
      out.pts.push({ a: a / 100, r: clamp(r / 1000, W_R_MIN, W_R_MAX), y: clamp(y / 1000, W_Y_MIN, W_Y_MAX), w: clamp(w / 10000, 0.003, 0.03), c: ci(c), b: b === 1 || out.pts.length === 0 ? 1 : 0 });
    }
  } else if (Array.isArray(raw.pts)) {
    for (const t of raw.pts) {
      if (!t || ![t.a, t.r, t.y, t.w].every(Number.isFinite) || out.pts.length >= W_MAX_POINTS) continue;
      out.pts.push({ a: t.a, r: clamp(t.r, W_R_MIN, W_R_MAX), y: clamp(t.y, W_Y_MIN, W_Y_MAX), w: clamp(t.w, 0.003, 0.03), c: ci(t.c), b: t.b === 1 || out.pts.length === 0 ? 1 : 0 });
    }
  }
  if (Array.isArray(raw.d2)) {
    for (let i = 0; i + 4 < raw.d2.length && out.dots.length < W_MAX_DOTS; i += 5) {
      const [a, r, y, c, k] = raw.d2.slice(i, i + 5);
      if ([a, r, y].every(Number.isFinite)) out.dots.push({ a: a / 100, r: clamp(r / 1000, 0, W_R_MAX + 0.1), y: clamp(y / 1000, 0.05, W_Y_MAX + 0.1), c: ci(c), k: k === 1 ? 1 : 0 });
    }
  } else if (Array.isArray(raw.d)) {
    for (let i = 0; i + 3 < raw.d.length && out.dots.length < W_MAX_DOTS; i += 4) {
      const [a, r, y, c] = raw.d.slice(i, i + 4);
      if ([a, r, y].every(Number.isFinite)) out.dots.push({ a: a / 100, r: clamp(r / 1000, 0, W_R_MAX + 0.1), y: clamp(y / 1000, 0.05, W_Y_MAX + 0.1), c: ci(c) });
    }
  } else if (Array.isArray(raw.dots)) {
    for (const t of raw.dots) {
      if (t && [t.a, t.r, t.y].every(Number.isFinite) && out.dots.length < W_MAX_DOTS) out.dots.push({ a: t.a, r: clamp(t.r, 0, W_R_MAX + 0.1), y: clamp(t.y, 0.05, W_Y_MAX + 0.1), c: ci(t.c), k: t.k === 1 ? 1 : 0 });
    }
  }
  if (Array.isArray(raw.pp)) {
    for (let i = 0; i + 5 < raw.pp.length; i += 6) {
      const [a, y, len, tilt, c, wd] = raw.pp.slice(i, i + 6);
      const petal = makePetal(a / 100, y / 1000, len / 1000, tilt / 100, BODIES[ci(c)].id, wd / 100);
      if (!addPetal(out, petal)) continue;
    }
  } else if (Array.isArray(raw.petals)) {
    for (const t of raw.petals) if (t) addPetal(out, makePetal(t.a, t.y, t.len, t.tilt, BODIES[ci(t.c)].id, t.wd));
  }
  // 早先存的作品没有记是树还是花：有花瓣又没骨架的算花，其余算树
  out.form = raw.form === 'flower' || raw.form === 'tree' ? raw.form : (out.petals.length > 0 && !out.frame ? 'flower' : 'tree');
  return out;
}
