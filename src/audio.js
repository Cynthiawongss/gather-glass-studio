// 声音全部现场合成，没有音频文件：炉火、吹气、玻璃的一声"叮"。
export function createAudio() {
  let ctx = null, fire = null, breath = null, master = null, on = true;

  function noiseBuffer(c) {
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    return buf;
  }
  function voice(c, buf, type, freq, q) {
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(master); src.start();
    return g;
  }
  // 浏览器要求先有一次用户操作才能出声
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = on ? 0.6 : 0; master.connect(ctx.destination);
    const buf = noiseBuffer(ctx);
    fire = voice(ctx, buf, 'lowpass', 420, 0.5);
    breath = voice(ctx, buf, 'bandpass', 1500, 0.8);
  }
  const ramp = (g, v) => { if (ctx && g) g.gain.setTargetAtTime(v, ctx.currentTime, 0.12); };
  function setFire(level) { ramp(fire, level * 1.1); }
  function setBreath(level) { ramp(breath, level * 0.5); }
  function quiet() { ramp(fire, 0); ramp(breath, 0); }
  // 冷玻璃被敲下来的声音：几个不成倍数的泛音，各自很快衰减
  function tink(vol = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    [[1206, 0.5, 1.1], [2240, 0.4, 0.4], [3919, 0.45, 0.55], [5965, 0.3, 0.3]].forEach(([f, amp, dur]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(amp * 0.25 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function setOn(v) { on = v; if (master) master.gain.setTargetAtTime(v ? 0.6 : 0, ctx.currentTime, 0.05); }
  return { unlock, setFire, setBreath, quiet, tink, setOn, get on() { return on; } };
}
