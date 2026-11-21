// 灯工的"缠丝"：烧软的玻璃被拉成细丝，一圈圈缠在转动的树干上。
// 丝上的每个点记在树干自己的坐标里：
//   a 绕树干的角度，r 离树干的距离，y 高度，w 丝的粗细，c 颜色序号，b=1 表示这里是一根新丝的开头
import * as THREE from 'three';

const RING = 6;   // 丝的截面分段。丝很细，6 段足够圆

export function createStrand(maxPoints = 6000) {
  const pos = new Float32Array(maxPoints * RING * 3);
  const nor = new Float32Array(maxPoints * RING * 3);
  const col = new Float32Array(maxPoints * RING * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const idx = new Uint32Array((maxPoints - 1) * RING * 6);
  for (let k = 0; k < maxPoints - 1; k++) {
    for (let j = 0; j < RING; j++) {
      const a = k * RING + j, b = k * RING + (j + 1) % RING, c = a + RING, d = b + RING, o = (k * RING + j) * 6;
      idx[o] = a; idx[o + 1] = b; idx[o + 2] = c; idx[o + 3] = b; idx[o + 4] = d; idx[o + 5] = c;
    }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 3);   // 固定包围球，省得每次增长都重算

  const P = new THREE.Vector3(), T = new THREE.Vector3(), Nn = new THREE.Vector3(), B = new THREE.Vector3(), Q = new THREE.Vector3();
  const at = (p, out) => out.set(Math.cos(p.a) * p.r, p.y, Math.sin(p.a) * p.r);
  let built = 0;

  // 只重算从 from 开始的点。palette 是 THREE.Color 数组。
  // now（秒）用来算余温：点上记着它被拉出来的时刻 t0，刚出火的丝是橙红的，不到两秒就淡回本色
  function build(points, palette, from = 0, now = 0) {
    const n = Math.min(points.length, maxPoints);
    const start = Math.max(Math.min(from, built) - 4, 0);   // 往回多算几个点：丝头的收尖会随着丝变长而移动
    for (let k = start; k < n; k++) {
      const p = points[k];
      const first = k === 0 || p.b === 1, last = k === n - 1 || points[k + 1].b === 1;
      at(p, P);
      at(last ? p : points[k + 1], T).sub(at(first ? p : points[k - 1], Q));
      if (T.lengthSq() < 1e-12) T.set(-Math.sin(p.a), 0, Math.cos(p.a));
      T.normalize();
      // 截面的朝向：一个方向朝外（离开树干），另一个同时垂直于它和丝的走向。绕着轴走的路径用这个不会拧麻花
      Nn.set(Math.cos(p.a), 0, Math.sin(p.a));
      Nn.addScaledVector(T, -Nn.dot(T));
      if (Nn.lengthSq() < 1e-8) Nn.set(0, 1, 0).addScaledVector(T, -T.y);
      Nn.normalize();
      B.crossVectors(T, Nn);
      // 丝的两头收成一个点：像被火烧断的丝头。两根丝之间因此只剩一条没有面积的线，看不见
      let toEnd = 0;
      while (toEnd < 3 && k + toEnd < n - 1 && points[k + toEnd + 1].b !== 1) toEnd++;
      let toStart = 0;
      while (toStart < 3 && k - toStart > 0 && points[k - toStart].b !== 1) toStart++;
      const e = Math.min(toEnd, toStart);
      const w = p.w * (e >= 3 ? 1 : Math.sin((e / 3) * Math.PI / 2));
      const c = palette[p.c] || palette[0];
      const glow = p.t0 ? Math.min(Math.exp(-Math.max(now - p.t0, 0) / 0.55), 1) : 0;
      const cr = c.r + (1.0 - c.r) * glow, cg = c.g + (0.5 - c.g) * glow, cb = c.b + (0.12 - c.b) * glow;
      for (let j = 0; j < RING; j++) {
        const ang = (j / RING) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang), o = (k * RING + j) * 3;
        const nx = Nn.x * ca + B.x * sa, ny = Nn.y * ca + B.y * sa, nz = Nn.z * ca + B.z * sa;
        pos[o] = P.x + nx * w; pos[o + 1] = P.y + ny * w; pos[o + 2] = P.z + nz * w;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
        col[o] = cr; col[o + 1] = cg; col[o + 2] = cb;
      }
    }
    built = n;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, Math.max(n - 1, 0) * RING * 6);
  }
  return { geo, build, maxPoints };
}

// 一点平滑的随机起伏，让丝不那么"机器"
export function wobble(x) {
  return Math.sin(x) * 0.5 + Math.sin(x * 2.3 + 1.7) * 0.3 + Math.sin(x * 5.1 + 0.4) * 0.2;
}

// ---------- 花瓣 ----------
// 一片花瓣是一小团被钳子压扁的玻璃：根部窄，往外是一个圆圆的扇面，有厚度，边缘是圆的，
// 正面留着钳子压出来的几道放射状的棱。做成上下两层面合起来的一块实心薄片。
const PU = 14, PV = 10;                 // 沿长度、沿宽度的分段
const GRID = (PU + 1) * (PV + 1);
const PVERTS = GRID * 2;                // 正面 + 背面
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

export function createPetals(maxPetals) {
  const pos = new Float32Array(maxPetals * PVERTS * 3);
  const col = new Float32Array(maxPetals * PVERTS * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const idx = new Uint32Array(maxPetals * PU * PV * 12);
  let o = 0;
  for (let p = 0; p < maxPetals; p++) {
    for (let f = 0; f < 2; f++) {
      for (let i = 0; i < PU; i++) {
        for (let j = 0; j < PV; j++) {
          const a = p * PVERTS + f * GRID + i * (PV + 1) + j, b = a + 1, c = a + PV + 1, d = c + 1;
          if (f === 0) { idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
          else { idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = b; idx[o++] = d; idx[o++] = c; }
        }
      }
    }
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 3);

  // 花瓣：{a 朝向, y 根部高度, len 长度, tilt 仰角, wd 宽长比, c 颜色}
  function build(petals, palette) {
    const n = Math.min(petals.length, maxPetals);
    for (let p = 0; p < n; p++) {
      const q = petals[p];
      const ca = Math.cos(q.a), sa = Math.sin(q.a);
      const width = q.len * (q.wd || 0.7) * 0.5;
      const thick = Math.min(Math.max(q.len * 0.05, 0.014), 0.034);
      const c = palette[q.c] || palette[0];
      let r = 0.03, y = q.y;
      const ds = q.len / PU;
      for (let i = 0; i <= PU; i++) {
        const u = i / PU;
        const th = q.tilt + 0.22 - 0.5 * u;                    // 中线微微往外翻
        if (i > 0) { r += Math.cos(th) * ds; y += Math.sin(th) * ds; }
        // 扇面的轮廓：根部细，过了三分之一迅速展开，尖端是圆的
        const half = width * Math.sqrt(Math.sin(Math.PI * Math.pow(u, 1.25))) * (0.22 + 0.78 * smooth(0, 0.42, u)) + 0.006;
        const nr = -Math.sin(th), ny = Math.cos(th);            // 花瓣面的法线（在"径向-竖直"平面里）
        const lengthwise = Math.sqrt(Math.max(Math.sin(Math.PI * Math.pow(u, 0.8)), 0));
        for (let j = 0; j <= PV; j++) {
          const v = (j / PV) * 2 - 1;
          const cup = 0.3 * half * v * v;                       // 两边微微往上兜
          const t = thick * Math.sqrt(Math.max(1 - v * v, 0)) * (0.35 + 0.65 * lengthwise);   // 中间厚，边缘收成圆边
          const rib = 0.3 * thick * Math.cos(v * Math.PI * 3.5) * smooth(0.12, 0.5, u) * (1 - v * v);   // 钳子的压痕
          const side = v * half;
          for (let f = 0; f < 2; f++) {
            const off = cup + (f === 0 ? t + rib : -t);
            const rr = r + nr * off, yy = y + ny * off;
            const k = (p * PVERTS + f * GRID + i * (PV + 1) + j) * 3;
            pos[k] = ca * rr - sa * side; pos[k + 1] = yy; pos[k + 2] = sa * rr + ca * side;
            const shade = 0.86 + 0.22 * u;                      // 根部颜色浓一点，尖端透一点
            col[k] = Math.min(c.r * shade, 1); col[k + 1] = Math.min(c.g * shade, 1); col[k + 2] = Math.min(c.b * shade, 1);
          }
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, n * PU * PV * 12);
    geo.computeVertexNormals();
  }
  return { geo, build };
}
