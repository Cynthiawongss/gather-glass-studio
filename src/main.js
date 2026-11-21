// 工坊主流程：状态机、输入、界面。
import {
  BODIES, PATTERNS, bodyById, newPiece, clonePiece, blow, pull, stretch,
  softness, celsius, sanitizePiece, packPiece, newWind, addThreadPoint, addDot, threadWidth, makePetal, addPetal, petalWidth, ribFactor, frameR, frameBin, layerDepth, countLayers, F_Y0, W_Y_MAX, P_LEN_MIN, W_MAX_PETALS,
  W_STEP, W_MAX_POINTS, W_R_MIN, COOL_SECONDS, HEAT_SECONDS, T_STIFF, L_MAX,
} from './model.js';
import { createStore, FREE_PIECES } from './store.js';
import { createAudio } from './audio.js';
import { t, applyStatic, toggleLang, getLang } from './i18n.js';
import { wobble } from './coil.js';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const store = createStore(window.localStorage).load();
const audio = createAudio();
applyStatic();

let stage;
try {
  const mod = await import('./stage.js');
  stage = mod.createStage(canvas);
} catch (err) {
  const box = $('fatal');
  box.hidden = false;
  box.textContent = navigator.onLine === false ? t('fatal_offline') : t('fatal_gl');
  console.error(err);
  throw err;
}

// ---------- 状态 ----------
// mode: work 在吹管上制作 / cooling 敲下后正在凉 / done 已定型未保存 / view 看陈列架上的一件
const S = {
  mode: 'work', piece: newPiece(1), pieceId: null, pieceName: '',
  temp: 0.82, cold: 0, coldTarget: 0, viewAngle: 0,
  heating: false, blowing: false, drag: null, undo: [],
  learned: { blown: false, pulled: false, wound: false, dotted: false, petaled: false }, nudge: '', nudgeUntil: 0, atLimit: false,
  tool: 'thread', windSpin: 0, spinTarget: 0, viewPitch: null, ptr: { x: 0, y: 0, on: false },
};
const isWind = () => S.piece.kind === 'wind';
// 三个入口：blow 吹制 / tree 缠一棵树 / flower 拉一朵花
const entry = () => (isWind() ? S.piece.form : 'blow');
// 做树：有骨架。一件缠丝作品只要还没拉过花瓣，拿起"拉丝"就是在骨架上做树
const onFrame = () => entry() === 'tree';
let layers = new Float32Array(1);     // 各层已经叠了多少丝，见 countLayers

// 草稿：做到一半刷新或误关页面，回来还能接着做。只存在本机浏览器
const DRAFT_KEY = 'gather.draft';
function saveDraft() {
  if (S.mode !== 'work') return;
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ shape: packPiece(S.piece), pieceId: S.pieceId, name: S.pieceName })); } catch { /* 存不了就算了，不打断制作 */ }
}
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    const shape = d && sanitizePiece(d.shape);
    if (!shape) return false;
    const known = typeof d.pieceId === 'string' && store.pieces.some((p) => p.id === d.pieceId);
    if (!known && !store.canStartNew()) return false;
    S.piece = shape; S.pieceId = known ? d.pieceId : null; S.pieceName = known ? String(d.name || '') : '';
    return true;
  } catch { return false; }
}

function refreshLook(snap = false) {
  document.body.dataset.kind = entry();
  syncKinds();
  if (entry() === 'tree' && S.tool === 'petal') S.tool = 'thread';
  if (entry() === 'flower' && S.tool === 'thread') S.tool = 'petal';
  stage.setKind(S.piece.kind);
  if (isWind()) { layers = countLayers(S.piece); syncTools(); stage.setWind(S.piece); return; }
  stage.setColor(bodyById(S.piece.body), S.piece.pattern, S.piece.seed);
  stage.setShape(S.piece.profile, S.piece.length, S.cold, snap);
}

// 撤销：吹制存整件作品的副本；缠丝只记"当时有多少丝、多少珠"，撤销就是剪回那个长度
function pushUndo() {
  S.undo.push(isWind() ? { n: S.piece.pts.length, d: S.piece.dots.length, p: S.piece.petals.length, star: S.piece.star } : clonePiece(S.piece));
  if (S.undo.length > 40) S.undo.shift();
  $('undoBtn').disabled = false;
}
function undo() {
  if (S.mode !== 'work' || !S.undo.length) return;
  const u = S.undo.pop();
  if (isWind()) { S.piece.pts.length = Math.min(u.n, S.piece.pts.length); S.piece.dots.length = Math.min(u.d, S.piece.dots.length); S.piece.petals.length = Math.min(u.p, S.piece.petals.length); S.piece.star = u.star; }
  else S.piece = u;
  saveDraft();
  $('undoBtn').disabled = !S.undo.length;
  refreshLook(); syncTray();
}

function setMode(mode) {
  S.mode = mode;
  document.body.dataset.mode = mode;
  $('workControls').hidden = mode !== 'work';
  $('doneControls').hidden = mode !== 'done';
  $('viewControls').hidden = mode !== 'view';
  if (mode !== 'work') stopHolds();
}

function startNew(kind = entry()) {
  if (!store.canStartNew()) { $('payDialog').showModal(); return; }
  const seed = Math.floor(Math.random() * 1e9) + 1;
  S.piece = kind === 'blow' ? newPiece(seed) : newWind(seed, kind);
  S.tool = kind === 'flower' ? 'petal' : 'thread'; S.spinTarget = S.windSpin;
  S.cold = 0;
  S.pieceId = null; S.pieceName = '';
  S.undo = []; $('undoBtn').disabled = true; clearDraft();
  S.temp = 0.82; S.coldTarget = 0; S.viewAngle = 0;
  setMode('work'); refreshLook(true); syncTray(); syncQuota();
}

function finish() {
  if (S.mode !== 'work') return;
  setMode('cooling');
  S.coldTarget = 1;
}

function rework() {
  S.temp = 0.82; S.coldTarget = 0; S.viewAngle = 0; S.viewPitch = null;
  setMode('work');
}

function openPiece(id) {
  const entry = store.pieces.find((p) => p.id === id);
  if (!entry) return;
  S.piece = sanitizePiece(entry.shape);
  if (!S.piece) return;
  S.pieceId = entry.id; S.pieceName = entry.name;
  S.undo = []; $('undoBtn').disabled = true;
  S.temp = 0; S.cold = 1; S.coldTarget = 1; S.viewAngle = 0; S.viewPitch = null; clearDraft();
  $('viewName').textContent = entry.name;
  setMode('view'); refreshLook(true); syncTray(); syncQuota();
  $('shelf').hidden = true;
}

function save() {
  const name = $('nameInput').value.trim() || t('untitled');
  renderFrame(0);
  const thumb = stage.snapshot(320);
  const id = S.pieceId || `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const res = store.save({ id, name, shape: S.piece, thumb });
  if (!res.ok) {
    if (res.reason === 'quota') { $('payDialog').showModal(); return; }
    toast(t(res.reason === 'full' ? 't_full' : 't_blocked'));
    return;
  }
  S.pieceId = id; S.pieceName = name; clearDraft();
  $('viewName').textContent = name;
  setMode('view'); syncShelf(); syncQuota();
  toast(t(res.counted ? 't_saved' : 't_updated', { name }));
}

// ---------- 输入：按住类动作 ----------
function canWork() { return S.mode === 'work'; }
function nudge(key) { S.nudge = key; S.nudgeUntil = performance.now() + 2600; $('thermo').classList.remove('shake'); void $('thermo').offsetWidth; $('thermo').classList.add('shake'); }

function setHeating(on) {
  if (on && !canWork()) return;
  S.heating = on; $('heatBtn').classList.toggle('active', on);
}
function setBlowing(on) {
  if (on) {
    if (!canWork() || S.blowing || isWind()) return;
    if (softness(S.temp) <= 0) { nudge('n_cold_blow'); return; }
    pushUndo();
  }
  if (!on && S.blowing) saveDraft();
  S.blowing = on; $('blowBtn').classList.toggle('active', on);
}
function stopHolds() { setHeating(false); setBlowing(false); endDrag(); }

function bindHold(btn, set) {
  btn.addEventListener('pointerdown', (e) => { audio.unlock(); btn.setPointerCapture(e.pointerId); set(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, () => set(false));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindHold($('heatBtn'), setHeating);
bindHold($('blowBtn'), setBlowing);

const typing = (e) => e.isComposing || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
const dialogOpen = () => $('payDialog').open;

window.addEventListener('keydown', (e) => {
  if (typing(e) || dialogOpen()) return;
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') {
    e.preventDefault();           // 不让空格滚动页面或触发聚焦中的按钮
    if (!e.repeat) { audio.unlock(); setBlowing(true); }
  } else if (e.code === 'KeyF') {
    if (!e.repeat) { audio.unlock(); setHeating(true); }
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { if (!typing(e)) e.preventDefault(); setBlowing(false); }
  if (e.code === 'KeyF') setHeating(false);
});
// 切走窗口或标签页时，所有按住的动作都松开
window.addEventListener('blur', stopHolds);
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopHolds(); audio.quiet(); } });

// ---------- 输入：在玻璃上拖 ----------
function capture(e) { try { canvas.setPointerCapture(e.pointerId); } catch { /* 指针已经不在了，照常继续 */ } }
const reticle = document.createElement('div');
reticle.className = 'reticle'; reticle.hidden = true;
document.body.appendChild(reticle);

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  audio.unlock();
  if (S.mode === 'view' || S.mode === 'done') {
    S.drag = { rotate: true, lastX: e.clientX, lastY: e.clientY };
    capture(e);
    return;
  }
  if (!canWork()) return;
  if (isWind()) { windPress(e); return; }
  const t = stage.pick(e.clientX, e.clientY);
  if (t === null) return;
  if (softness(S.temp) <= 0) { nudge('n_cold_pull'); return; }
  pushUndo();
  const { axisX } = stage.metrics();
  S.drag = { t, lastX: e.clientX, lastY: e.clientY, side: e.clientX >= axisX ? 1 : -1, tip: t > 0.82 };
  capture(e);
  canvas.classList.add('grabbing');
});

canvas.addEventListener('pointermove', (e) => {
  S.ptr.x = e.clientX; S.ptr.y = e.clientY; S.ptr.on = true;
  const d = S.drag;
  if (isWind() && canWork()) { reticle.hidden = true; canvas.classList.remove('over'); return; }
  if (!d) {
    const over = canWork() && stage.pick(e.clientX, e.clientY) !== null;
    canvas.classList.toggle('over', over);
    reticle.hidden = !over;
    if (over) reticle.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    return;
  }
  if (d.rotate) {
    S.viewAngle += (e.clientX - d.lastX) * 0.01;
    if (isWind()) S.viewPitch = Math.min(Math.max((S.viewPitch ?? wantPitch()) + (e.clientY - d.lastY) * 0.006, 0), 1.2);
    d.lastX = e.clientX; d.lastY = e.clientY;
    return;
  }
  const { pxPerUnit } = stage.metrics();
  const dx = (e.clientX - d.lastX) / pxPerUnit, dy = (e.clientY - d.lastY) / pxPerUnit;
  d.lastX = e.clientX; d.lastY = e.clientY;
  const soft = softness(S.temp);
  if (soft <= 0) { nudge('n_went_cold'); endDrag(); return; }
  pull(S.piece, d.t, dx * d.side, soft);
  if (d.tip) stretch(S.piece, dy, soft);
  else d.t = Math.min(Math.max(d.t + dy / S.piece.length, 0.02), 1);   // 手往上下带，作用点跟着走
  S.learned.pulled = true;
  stage.setShape(S.piece.profile, S.piece.length, S.cold);
  reticle.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
});

// ---------- 缠丝 ----------
function windPress(e) {
  S.ptr.x = e.clientX; S.ptr.y = e.clientY; S.ptr.on = true;
  const wp = stage.windPoint(e.clientX, e.clientY);
  if (!wp) return;
  if (softness(S.temp) <= 0) { nudge('n_cold_wind'); return; }
  if (S.tool === 'dot') {
    pushUndo();
    const hit = stage.windHit(e.clientX, e.clientY);
    const ok = hit
      ? addDot(S.piece, hit.a, hit.r + 0.03, hit.y, S.piece.body)
      : addDot(S.piece, (wp.x >= 0 ? 0 : Math.PI) + S.windSpin, Math.abs(wp.x), wp.y, S.piece.body);
    if (!ok) { S.undo.pop(); nudge('n_w_dots_full'); return; }
    S.learned.dotted = true;
    audio.tink(0.35);
    stage.setWind(S.piece, S.piece.pts.length); saveDraft();
    return;
  }
  if (S.tool === 'petal') {
    if (S.piece.petals.length >= W_MAX_PETALS) { nudge('n_w_petals_full'); return; }
    // 花瓣的根在树干上按下去的那个高度；往哪边拉，就朝哪边长
    S.drag = { petal: true, side: wp.x >= 0 ? 0 : Math.PI, y: wp.y, preview: null };
    capture(e);
    return;
  }
  if (S.piece.pts.length >= W_MAX_POINTS) { nudge('n_w_full'); return; }
  pushUndo();
  // 每根丝有自己的脾气：缠得歪一点还是正一点、松一点还是紧一点。几百根叠起来才像手缠的
  if (onFrame()) { S.piece.frame = true; }
  S.drag = {
    wind: true, framed: onFrame(), ang: (wp.x >= 0 ? 0 : Math.PI) + S.windSpin, r: Math.max(Math.abs(wp.x), W_R_MIN), y: wp.y, acc: W_STEP, first: true,
    seed: Math.random() * 100, lean: (Math.random() - 0.5) * 0.07, leanAt: Math.random() * 6.283, loose: 0.94 + Math.random() * 0.12,
  };
  capture(e);
}
const THREAD_SPEED = 30;   // 弧度/秒，约每秒 4.8 圈
function windStep(dt) {
  const d = S.drag;
  const nowSec = performance.now() / 1000;
  const soft = softness(S.temp);
  if (soft <= 0) { nudge('n_went_cold'); endDrag(); return; }
  const wp = stage.windPoint(S.ptr.x, S.ptr.y);
  if (!wp) return;
  const k = 1 - Math.exp(-dt / 0.09);                  // 丝跟着指针走，但带一点粘滞，像真的在拉
  const r1 = d.r + (Math.abs(wp.x) - d.r) * k, y1 = d.y + (wp.y - d.y) * k;
  const speed = Math.hypot(r1 - d.r, y1 - d.y) / Math.max(dt, 1e-3);
  const from = S.piece.pts.length;
  // 丝绕上去的速度比树干看起来转得快得多：烧软的玻璃丝是被甩着缠上去的，一秒能绕好几圈
  const laid = dt * THREAD_SPEED;
  d.acc += laid;
  const steps = Math.floor(d.acc / W_STEP);
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    const a = d.ang + laid * f;
    const yc = d.y + (y1 - d.y) * f;
    let rr, r;
    if (d.framed) {
      // 做树：丝贴着骨架，落在这一层已经叠起来的丝的最外面。指针只决定缠到多高
      const yy = Math.min(Math.max(yc, F_Y0), W_Y_MAX - 0.02), bin = frameBin(yy);
      rr = frameR(yy) + layerDepth(layers[bin]);
      layers[bin]++;
      r = rr * ribFactor(a) * (1 + 0.025 * wobble(a * 0.31 + d.seed)) + 0.01 * wobble(a * 2.3 + d.seed * 2);
    } else {
      // 没有骨架（比如在花茎上绕）：指针离多远就绕多宽
      rr = d.r + (r1 - d.r) * f;
      r = rr * ribFactor(a) * d.loose * (1 + 0.07 * wobble(a * 0.31 + d.seed)) + 0.014 * wobble(a * 2.3 + d.seed * 2);
    }
    // 每一圈都稍微歪着：一侧高一侧低。不同的丝歪的方向不同，于是互相交叠
    const yb = d.framed ? Math.min(Math.max(yc, F_Y0), W_Y_MAX - 0.02) : yc;
    const y = yb + d.lean * (0.35 + rr) * Math.sin(a + d.leanAt) + 0.018 * wobble(a * 0.19 + d.seed * 3);
    // 粗细：整体跟温度走，偶尔积一小滴玻璃
    const bead = Math.max(wobble(a * 0.53 + d.seed * 7) - 0.62, 0) * 2.2;
    const w = threadWidth(soft) * (0.72 + 0.4 * wobble(a * 0.9 + d.seed * 5) + bead) / (1 + speed * 1.2);
    if (!addThreadPoint(S.piece, a, r, y, w, S.piece.body, d.first)) { nudge('n_w_full'); endDrag(); break; }
    S.piece.pts[S.piece.pts.length - 1].t0 = nowSec;
    d.first = false;
  }
  d.acc -= steps * W_STEP;
  d.ang += laid;
  d.r = r1; d.y = y1;
  if (S.piece.pts.length > from) S.learned.wound = true;
}
// 还带着余温的丝每一帧都要重画颜色，直到淡回本色
let warmFrom = -1;
function warmThreads() {
  const pts = S.piece.pts, nowSec = performance.now() / 1000;
  if (warmFrom < 0 || warmFrom > pts.length) warmFrom = pts.length;
  while (warmFrom > 0 && pts[warmFrom - 1].t0 && nowSec - pts[warmFrom - 1].t0 < 3) warmFrom--;   // 新长出来的点
  while (warmFrom < pts.length && (!pts[warmFrom].t0 || nowSec - pts[warmFrom].t0 >= 3)) { delete pts[warmFrom].t0; warmFrom++; }
  if (warmFrom < pts.length) stage.setWind(S.piece, warmFrom, S.drag && S.drag.petal ? S.drag.preview : null, nowSec);
}
// 正在拉的那片花瓣：长度 = 指针离树干多远，仰角 = 指针比花瓣根高多少
function petalStep() {
  const d = S.drag;
  const wp = stage.windPoint(S.ptr.x, S.ptr.y);
  if (!wp) return;
  const dx = Math.abs(wp.x), dy = wp.y - d.y;
  const len = Math.hypot(dx, dy);
  d.preview = len >= P_LEN_MIN ? makePetal(d.side + S.windSpin, d.y, len, Math.atan2(dy, Math.max(dx, 0.02)), S.piece.body, petalWidth(softness(S.temp))) : null;
  stage.setWind(S.piece, S.piece.pts.length, d.preview);
}
function petalRelease(d) {
  if (d.preview) {
    pushUndo();
    if (addPetal(S.piece, d.preview)) {
      S.learned.petaled = true;
      // 树干转过五分之二圈：五片正好均匀围成一朵。每拉满五片再多错开半格，下一层就落在上一层的缝里
      S.spinTarget += Math.PI * 4 / 5 + (S.piece.petals.length % 5 === 0 ? Math.PI / 5 : 0);
      audio.tink(0.25);
    } else S.undo.pop();
  }
  stage.setWind(S.piece, S.piece.pts.length);
}
function syncTools() {
  stage.setFrameHint(entry() === 'tree');     // 做树：空树干上先把骨架摆出来
  $('toolPetal').setAttribute('aria-checked', String(S.tool === 'petal'));
  $('toolThread').setAttribute('aria-checked', String(S.tool === 'thread'));
  $('toolDot').setAttribute('aria-checked', String(S.tool === 'dot'));
  $('starBtn').setAttribute('aria-pressed', String(isWind() && S.piece.star !== null));
  syncKinds();
}
// 顶部三个入口的高亮：吹制也要更新，否则在 Blow 里没有一个亮，或者从 Tree 切回来时 Tree 还亮着
function syncKinds() {
  for (const k of ['blow', 'tree', 'flower']) $(`kind_${k}`).setAttribute('aria-checked', String(entry() === k));
}
$('toolThread').addEventListener('click', () => { if (entry() !== 'tree') return; S.tool = 'thread'; syncTools(); showFrame(); });
$('toolPetal').addEventListener('click', () => { if (entry() !== 'flower') return; S.tool = 'petal'; S.spinTarget = S.windSpin; syncTools(); showFrame(); });
function showFrame() { if (isWind()) stage.setWind(S.piece, S.piece.pts.length); }
$('toolDot').addEventListener('click', () => { S.tool = 'dot'; syncTools(); showFrame(); });
$('starBtn').addEventListener('click', () => {
  if (!canWork() || entry() !== 'tree') return;
  pushUndo();
  S.piece.star = S.piece.star === null ? Math.max(BODIES.findIndex((b) => b.id === S.piece.body), 0) : null;
  stage.setWind(S.piece, S.piece.pts.length); syncTools(); saveDraft();
});
// 换玩法 = 重新挑一根料。手上那件还没保存的会被放下
for (const k of ['blow', 'tree', 'flower']) $(`kind_${k}`).addEventListener('click', () => { if (entry() !== k && canWork()) startNew(k); });

// 丝被火烧断的地方会缩成一颗小水滴，挂在丝尾
function dropBead() {
  const p = S.piece.pts[S.piece.pts.length - 1];
  if (!p || p.b === 1) return;
  if (addDot(S.piece, p.a, p.r + 0.012, p.y - 0.03, S.piece.body, 1)) stage.setWind(S.piece, S.piece.pts.length);
}
function endDrag() {
  if (!S.drag) return;
  if (S.drag.petal) petalRelease(S.drag);
  if (S.drag.wind) dropBead();
  if (!S.drag.rotate) saveDraft();
  S.drag = null;
  canvas.classList.remove('grabbing');
}
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(ev, endDrag);
canvas.addEventListener('pointerleave', () => { if (!S.drag) { reticle.hidden = true; canvas.classList.remove('over'); } });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// 触控板双指捏合：捏 = 收细，张 = 撑开，作用在指针所在的高度。
// Chrome 把它报成 ctrlKey 的滚轮事件；Safari 用自己的 gesture 事件
let pinchUndoAt = 0;
function squeeze(clientX, clientY, dr) {
  if (!canWork() || isWind()) return;
  const t0 = stage.pick(clientX, clientY);
  if (t0 === null) return;
  const soft = softness(S.temp);
  if (soft <= 0) { nudge('n_cold_pull'); return; }
  if (performance.now() - pinchUndoAt > 600) pushUndo();   // 一次连续的捏合只记一步撤销
  pinchUndoAt = performance.now();
  pull(S.piece, t0, Math.max(Math.min(dr, 0.08), -0.08), soft);
  S.learned.pulled = true;
  stage.setShape(S.piece.profile, S.piece.length, S.cold);
  clearTimeout(squeeze.timer); squeeze.timer = setTimeout(saveDraft, 500);
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();                       // 不让页面被缩放或滚动
  if (e.ctrlKey) squeeze(e.clientX, e.clientY, -e.deltaY * 0.006);
}, { passive: false });
let lastScale = 1;
canvas.addEventListener('gesturestart', (e) => { e.preventDefault(); lastScale = 1; });
canvas.addEventListener('gesturechange', (e) => {
  e.preventDefault();
  squeeze(e.clientX, e.clientY, (e.scale / lastScale - 1) * 0.6);
  lastScale = e.scale;
});
canvas.addEventListener('gestureend', (e) => e.preventDefault());

// ---------- 界面：料色 ----------
function syncTray() {
  for (const el of $('bodies').children) el.setAttribute('aria-checked', String(el.dataset.id === S.piece.body));
  for (const el of $('patterns').children) el.setAttribute('aria-checked', String(el.dataset.id === S.piece.pattern));
}
for (const b of BODIES) {
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'swatch'; el.dataset.id = b.id; el.dataset.tLabel = `body_${b.id}`;
  el.setAttribute('role', 'radio');
  el.style.setProperty('--c', b.swatch);
  el.addEventListener('click', () => {
    if (!canWork()) return;
    if (isWind()) { S.piece.body = b.id; syncTray(); return; }   // 缠丝：只是换一根料棒，已经缠上去的不变
    pushUndo(); S.piece.body = b.id; refreshLook(); syncTray(); saveDraft();
  });
  $('bodies').appendChild(el);
}
for (const p of PATTERNS) {
  const el = document.createElement('button');
  el.type = 'button'; el.className = 'chip'; el.dataset.id = p.id; el.dataset.t = `pat_${p.id}`;
  el.setAttribute('role', 'radio');
  el.addEventListener('click', () => { if (!canWork() || isWind()) return; pushUndo(); S.piece.pattern = p.id; refreshLook(); syncTray(); saveDraft(); });
  $('patterns').appendChild(el);
}

// ---------- 界面：额度与陈列架 ----------
function quotaLine() {
  const left = store.remaining();
  if (store.bonus === 0) return left > 0 ? t('q_free_left', { n: left }) : t('q_free_done');
  return left > 0 ? t('q_left', { n: left }) : t('q_none');
}
function syncQuota() {
  const making = S.mode !== 'view' && !S.pieceId;
  $('quota').textContent = `${making ? `${t('q_making', { n: store.completed + 1 })} · ` : ''}${quotaLine()}`;
}
function syncShelf() {
  const list = $('shelfList');
  list.textContent = '';
  for (const p of store.pieces) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    const img = document.createElement('img');
    img.src = p.thumb; img.alt = ''; img.width = 160; img.height = 160;
    const cap = document.createElement('span'); cap.textContent = p.name;
    btn.append(img, cap);
    btn.addEventListener('click', () => openPiece(p.id));
    li.appendChild(btn); list.appendChild(li);
  }
  $('shelfEmpty').hidden = store.pieces.length > 0;
  $('shelfCount').textContent = String(store.pieces.length);
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}

$('undoBtn').addEventListener('click', undo);
$('restartBtn').addEventListener('click', () => {
  if (S.pieceId) { openPiece(S.pieceId); return; }   // 正在改已有作品时，"重新挑料"意味着放弃修改
  startNew(entry());
});
$('finishBtn').addEventListener('click', finish);
$('reworkBtn').addEventListener('click', rework);
$('doneControls').addEventListener('submit', (e) => { e.preventDefault(); save(); });
$('editBtn').addEventListener('click', rework);
$('newBtn').addEventListener('click', () => startNew(entry()));
$('shelfBtn').addEventListener('click', () => { $('shelf').hidden = !$('shelf').hidden; });
$('shelfClose').addEventListener('click', () => { $('shelf').hidden = true; });
$('soundBtn').addEventListener('click', () => {
  audio.unlock(); audio.setOn(!audio.on); syncSound();
});
function syncSound() {
  $('soundBtn').textContent = t(audio.on ? 'sound_on' : 'sound_off');
  $('soundBtn').setAttribute('aria-pressed', String(audio.on));
}
$('langBtn').addEventListener('click', () => { toggleLang(); syncSound(); syncQuota(); lastCoach = ''; });
$('exportBtn').addEventListener('click', () => {
  renderFrame(0);
  const date = new Intl.DateTimeFormat(getLang() === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium' }).format(new Date());
  const a = document.createElement('a');
  a.href = stage.card(S.pieceName || t('untitled'), t('card_line', { date })); a.download = `${S.pieceName || t('file_name')}.png`;
  a.click();
});
let deleteArmed = 0;
$('deleteBtn').addEventListener('click', () => {
  const btn = $('deleteBtn');
  if (performance.now() > deleteArmed) {      // 第一次点只是询问，3 秒内再点才真的删
    deleteArmed = performance.now() + 3000; btn.textContent = t('del_confirm');
    setTimeout(() => { btn.textContent = t('del'); }, 3000);
    return;
  }
  deleteArmed = 0; btn.textContent = t('del');
  const name = S.pieceName;
  const res = store.remove(S.pieceId);
  if (!res.ok) { toast(t('t_del_fail')); return; }
  syncShelf(); syncQuota();
  toast(t('t_deleted', { name }));
  if (store.canStartNew()) startNew(entry());
  else if (store.pieces[0]) openPiece(store.pieces[0].id);
  else { S.pieceId = null; $('viewName').textContent = t('shelf_cleared'); $('payDialog').showModal(); }
});
$('payCancel').addEventListener('click', () => $('payDialog').close());
$('payDemo').addEventListener('click', () => {
  const res = store.demoUnlock();
  $('payDialog').close();
  if (!res.ok) { toast(t('t_unlock_fail')); return; }
  syncQuota();
  toast(t('t_unlock'));
  if (S.mode === 'view' || !S.pieceId) startNew(entry());
});

// ---------- 每一帧 ----------
function coachKey() {
  if (performance.now() < S.nudgeUntil) return S.nudge;
  if (S.mode === 'cooling') return 'c_cooling';
  if (S.mode === 'done') return isWind() ? 'c_w_done' : 'c_done';
  if (S.mode === 'view') return 'c_view';
  const soft = softness(S.temp);
  if (isWind()) {
    if (S.heating) return 'c_w_heating';
    if (soft <= 0) return 'c_w_cold';
    if (entry() === 'flower') return S.piece.petals.length ? 'c_w_petal_more' : 'c_w_petal';
    if (!S.learned.wound) return 'c_w_start';
    if (S.piece.pts.length < 1500) return 'c_w_shape';
    if (!S.learned.dotted && S.piece.dots.length === 0) return 'c_w_dot';
    return soft < 0.5 ? 'c_w_thick' : 'c_w_flow';
  }
  if (S.heating) return S.temp > 0.9 ? 'c_hot_enough' : 'c_heating';
  if (soft <= 0) return 'c_cold';
  if (S.atLimit && S.blowing) return 'c_limit';
  if (S.temp > 0.9) return 'c_sag';
  if (!S.learned.blown) return 'c_blow';
  if (!S.learned.pulled) return 'c_pull';
  return soft < 0.5 ? 'c_stiffening' : 'c_flow';
}

// 缠丝作品的观看仰角：花要从上往下看，树平着看。成品可以上下拖动自己调
function wantPitch() {
  if (!isWind()) return 0;
  if (S.mode === 'work') return entry() === 'flower' ? 0.44 : 0.1;
  if (S.viewPitch !== null) return S.viewPitch;
  return entry() === 'flower' ? 0.46 : 0.1;
}

let lastCoach = '', lastTempShown = -1;
function renderFrame(dt) {
  stage.frame({
    temp: S.temp, cold: S.cold, dt,
    fire: S.heating ? 1 : 0,
    spinSpeed: S.mode === 'work' ? (S.blowing ? 1.7 : 0.9) : (S.mode === 'cooling' ? 0.5 : (S.drag ? 0 : 0.18)),
    viewAngle: S.viewAngle, windSpin: S.windSpin, pitch: wantPitch(),
  });
}

let prev = performance.now();
function tick(now) {
  const dt = Math.min((now - prev) / 1000, 0.1);
  prev = now;

  // 缠丝的树干一直在转：缠的时候转得快，停手时慢慢转着给你看
  const winding = Boolean(S.drag && S.drag.wind);
  if (isWind()) {
    let spinDelta;
    if (S.mode === 'work' && entry() === 'flower') {
      // 拉花瓣时树干不自己转，只在每片之后转到下一个位置
      spinDelta = (S.spinTarget - S.windSpin) * (1 - Math.exp(-dt / 0.16));
    } else {
      spinDelta = dt * (S.mode === 'work' ? (winding ? 7 : 0.7) : (S.mode === 'cooling' ? 0.5 : (S.drag ? 0 : 0.18)));
      S.spinTarget = S.windSpin + spinDelta;
    }
    S.windSpin += spinDelta;
    if (winding) windStep(dt);
    if (S.drag && S.drag.petal) petalStep();
    warmThreads();
    const wp = S.ptr.on && S.mode === 'work' ? stage.windPoint(S.ptr.x, S.ptr.y) : null;
    stage.setRod(wp ? wp.x : 0, wp ? wp.y : 0, Boolean(wp) && S.tool !== 'dot', S.temp);
  }

  if (S.mode === 'work') {
    if (S.heating) S.temp = Math.min(S.temp + dt / HEAT_SECONDS, 1);
    else S.temp = Math.max(S.temp - dt * (1 - T_STIFF) / COOL_SECONDS * (winding ? 1.6 : 1), 0.12);
    let changed = false;
    if (S.blowing && !isWind()) {
      const moved = blow(S.piece, softness(S.temp), dt);
      S.atLimit = !moved; S.learned.blown = true; changed = true;
      if (softness(S.temp) <= 0) { setBlowing(false); nudge('n_went_cold'); }
    }
    if (!isWind() && S.temp > 0.9 && S.piece.length < L_MAX) {     // 太烫：料自己往下坠
      stretch(S.piece, dt * 0.12 * (S.temp - 0.9) / 0.1, 1); changed = true;
    }
    if (changed) stage.setShape(S.piece.profile, S.piece.length, S.cold);
  } else if (S.mode === 'cooling') {
    S.temp = Math.max(S.temp - dt * 0.9, 0);
  }

  if (S.cold !== S.coldTarget && (S.mode !== 'cooling' || S.temp < 0.35)) {
    const step = dt / 1.3;
    S.cold = S.coldTarget > S.cold ? Math.min(S.cold + step, S.coldTarget) : Math.max(S.cold - step, S.coldTarget);
    if (!isWind()) stage.setShape(S.piece.profile, S.piece.length, S.cold);
    if (S.mode === 'cooling' && S.cold === 1) {
      audio.tink();
      $('nameInput').value = S.pieceName;
      setMode('done');
    }
  }

  audio.setFire(S.mode === 'work' ? (S.heating ? 1 : 0.15) : 0);
  audio.setBreath(S.blowing ? 1 : (winding ? 0.35 : 0));

  const root = document.documentElement.style;
  root.setProperty('--cold', S.cold.toFixed(3));
  const shown = S.mode === 'work' || S.mode === 'cooling' ? celsius(S.temp) : 20;
  if (shown !== lastTempShown) {
    lastTempShown = shown;
    $('tempNum').textContent = String(shown);
    $('tempMark').style.bottom = `${Math.min(Math.max(S.temp, 0), 1) * 100}%`;
    const soft = softness(S.temp);
    $('thermo').dataset.state = soft <= 0 ? 'stiff' : S.temp > 0.9 ? 'soft' : 'work';
    document.body.dataset.heat = soft <= 0 ? 'stiff' : 'ok';
  }
  const coach = coachKey();
  if (coach !== lastCoach) { lastCoach = coach; $('coach').textContent = t(coach); }

  renderFrame(dt);
  requestAnimationFrame(tick);
}

new ResizeObserver(() => stage.resize()).observe(canvas);
stage.resize();
setMode('work');
if (!store.canStartNew() && store.pieces[0]) openPiece(store.pieces[0].id);
else { if (loadDraft()) S.learned = { blown: true, pulled: true, wound: S.piece.kind === 'wind' && S.piece.pts.length > 0, dotted: false, petaled: false }; refreshLook(true); if (!S.pieceId && !store.canStartNew()) $('payDialog').showModal(); }
applyStatic(); syncSound(); syncTray(); syncShelf(); syncQuota();
requestAnimationFrame(tick);

// 给自动化检查用的只读窗口
window.__glass = { S, store, stage };
