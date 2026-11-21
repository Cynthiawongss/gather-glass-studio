// 陈列架与额度。全部存在本机浏览器里（localStorage），清数据或换浏览器就会重置。
// 这只是演示用的计数，不是可靠的收费约束；正式收费需要账户 + 服务端校验。
import { sanitizePiece, packPiece } from './model.js';

export const FREE_PIECES = 3;   // 免费可完成的件数
export const PACK_SIZE = 3;     // 一个次数包包含的件数（演示值，价格未定）
const KEY = 'glass-studio.v1';

export function createStore(storage) {
  let state = { pieces: [], completed: 0, bonus: 0 };

  function load() {
    try {
      const raw = JSON.parse(storage.getItem(KEY) || 'null');
      if (raw && Array.isArray(raw.pieces)) {
        const pieces = [];
        for (const p of raw.pieces) {
          const shape = sanitizePiece(p.shape);
          if (!shape || typeof p.id !== 'string') continue;
          pieces.push({ id: p.id, name: String(p.name || '未命名').slice(0, 24), shape: packPiece(shape), thumb: typeof p.thumb === 'string' ? p.thumb : '', savedAt: Number(p.savedAt) || 0 });
        }
        const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
        state = { pieces, completed: Math.max(int(raw.completed), 0), bonus: int(raw.bonus) };
      }
    } catch { /* 存档损坏时从空架子开始 */ }
    return api;
  }

  function persist(next) {
    try {
      storage.setItem(KEY, JSON.stringify(next));
      state = next;
      return { ok: true };
    } catch (err) {
      const full = err && (err.name === 'QuotaExceededError' || err.code === 22);
      return { ok: false, reason: full ? 'full' : 'blocked' };
    }
  }

  const allowance = () => FREE_PIECES + state.bonus;
  const remaining = () => Math.max(allowance() - state.completed, 0);

  // 保存一件作品。新作品首次保存计 1 次；同一件再保存不再计。失败不计。
  function save({ id, name, shape, thumb }) {
    const existing = state.pieces.find((p) => p.id === id);
    if (!existing && remaining() <= 0) return { ok: false, reason: 'quota' };
    const entry = { id, name: String(name || '未命名').slice(0, 24), shape: packPiece(shape), thumb, savedAt: Date.now() };
    const pieces = existing ? state.pieces.map((p) => (p.id === id ? entry : p)) : [entry, ...state.pieces];
    const res = persist({ ...state, pieces, completed: state.completed + (existing ? 0 : 1) });
    return res.ok ? { ok: true, counted: !existing } : res;
  }

  // 删除不退还次数：免费的是"累计完成 3 件"，不是 3 个存储格
  function remove(id) {
    return persist({ ...state, pieces: state.pieces.filter((p) => p.id !== id) });
  }

  // 演示解锁：没有任何真实付款发生
  function demoUnlock() {
    return persist({ ...state, bonus: state.bonus + PACK_SIZE });
  }

  function resetAll() {
    try { storage.removeItem(KEY); } catch { /* ignore */ }
    state = { pieces: [], completed: 0, bonus: 0 };
  }

  const api = {
    load, save, remove, demoUnlock, resetAll, remaining, allowance,
    get pieces() { return state.pieces; },
    get completed() { return state.completed; },
    get bonus() { return state.bonus; },
    canStartNew: () => remaining() > 0,
  };
  return api;
}
