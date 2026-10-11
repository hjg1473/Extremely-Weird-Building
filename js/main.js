// Impossible Architecture — WebGL2 raymarching explorer. No libraries, no meshes, no textures.
(() => {
'use strict';

// ---------- small vector helpers ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const wrap = (v, period) => ((v + period / 2) % period + period) % period - period / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- scene B portal logic (mirrors the shader) ----------
const B = { K: 30, SH: 3, DW: 0.8, DH: 2.4, C0: [0, 3, 0], C1: [0, -87, 0] };
function portalB(cam, np) {
  const p = cam.pos;
  const C = cam.lvl === 0 ? B.C0 : B.C1;
  const zp = C[2] + B.SH;
  if (p[2] > zp && np[2] <= zp) {
    const ip = lerp3(p, np, (p[2] - zp) / (p[2] - np[2]));
    if (Math.abs(ip[0] - C[0]) < B.DW && ip[1] > C[1] - B.SH && ip[1] < C[1] - B.SH + B.DH) {
      cam.pos = mul(sub(np, C), B.K); cam.lvl++; return true;
    }
  }
  if (cam.lvl > 0) {
    const zh = B.SH * B.K;
    if (p[2] < zh && np[2] >= zh) {
      const ip = lerp3(p, np, (zh - p[2]) / (np[2] - p[2]));
      if (Math.abs(ip[0]) < B.DW * B.K && ip[1] > -B.SH * B.K && ip[1] < -B.SH * B.K + B.DH * B.K) {
        cam.lvl--; cam.pos = add(mul(np, 1 / B.K), cam.lvl === 0 ? B.C0 : B.C1); return true;
      }
    }
  }
  return false;
}
function moveB(cam, np) {
  if (portalB(cam, np)) return;
  const C = cam.lvl === 0 ? B.C0 : B.C1;
  const d = sub(np, C), m = B.SH + 0.15;
  const inDoor = Math.abs(d[0]) < B.DW - 0.05 && d[1] > -B.SH && d[1] < -B.SH + B.DH && d[2] > 0;
  if (!inDoor && Math.abs(d[0]) < m && Math.abs(d[1]) < m && Math.abs(d[2]) < m) return;      // solid cube
  if (cam.lvl === 0) np[1] = Math.max(np[1], 0.25);
  else {
    np[1] = clamp(np[1], -89.7, 495);
    np[0] = clamp(np[0], -418, 418);
    np[2] = clamp(np[2], -1098, 89.8);                                               // only the doorway leads out
  }
  cam.pos = np;
}

// ---------- scenes ----------
const SCENES = [
  {
    key: 'A', name: '끝없이 이어지는 계단', en: 'ENDLESS STAIRWELL',
    desc: '네 겹의 나선 계단이 서로 반대로 돌며 위아래로 끝없이 이어진다. 벽 너머에는 같은 계단실이 무한히 반복된다.',
    src: SHADERS.A, fov: 1.35, speed: 5,
    spawn: { pos: [1.4, 3, 0.6], yaw: 0.3, pitch: -1.15, roll: 0 },
    wrapPos: p => [wrap(p[0], 64), wrap(p[1], 1260), wrap(p[2], 64)],
    tour(cam, dt, t) {
      const a = t * 0.11;
      cam.pos = [Math.cos(a) * 1.3, cam.pos[1] - dt * 1.6, Math.sin(a) * 1.3];
      cam.yaw = -a + 1.2; cam.pitch = -0.55 + 0.35 * Math.sin(t * 0.07); cam.roll = 0;
    }
  },
  {
    key: 'B', name: '외부보다 거대한 내부', en: 'LARGER INSIDE',
    desc: '6m짜리 정육면체의 문을 지나면 30배 큰 공간이 나온다. 그 안에도 같은 정육면체가 있고, 그 안에도… 끝이 없다.',
    src: SHADERS.B, fov: 1.25, speed: 3,
    spawn: { pos: [0, 1.6, 24], yaw: 0, pitch: 0.02, roll: 0, lvl: 0 },
    move: moveB,
    speedMul: cam => (cam.lvl > 0 ? 7 : 1),
    tour(cam, dt) {
      const target = cam.lvl === 0 ? [0, 1.2, 3] : [0, -88.8, 3];
      const d = sub(target, cam.pos);
      const dist = len(d);
      const v = Math.max(1.2, dist * 0.22);
      const dir = norm([d[0] * 1.5, d[1] * 1.5, Math.min(d[2], -0.5)]);
      moveB(cam, add(cam.pos, mul(dir, v * dt)));
      const look = norm(sub(target, cam.pos));
      cam.yaw = Math.atan2(-look[0], -look[2]) * 0.3;
      cam.pitch = clamp(Math.asin(clamp(look[1], -1, 1)) * 0.6 + 0.06, -0.6, 0.6); cam.roll = 0;
    }
  },
  {
    key: 'C', name: '재귀적으로 증식하는 타워', en: 'RECURSIVE TOWER',
    desc: '모든 탑은 다리를 뻗어 절반 크기의 탑 네 개를 낳고, 그 탑들도 다시 증식한다. 구조는 숨 쉬듯 계속 자라고 비틀린다.',
    src: SHADERS.C, fov: 1.3, speed: 9,
    spawn: { pos: [44, 6, 44], yaw: Math.PI / 4, pitch: 0.05, roll: 0 },
    wrapPos: p => [wrap(p[0], 180), wrap(p[1], 48 * 40), wrap(p[2], 180)],
    tour(cam, dt, t) {
      const a = t * 0.05 + 0.8;
      cam.pos = [Math.sin(a) * 40, cam.pos[1] + dt * 2.2, Math.cos(a) * 40];
      cam.yaw = a + 0.35; cam.pitch = 0.12 + 0.2 * Math.sin(t * 0.05); cam.roll = 0;
    }
  },
  {
    key: 'D', name: '공간이 뒤틀린 연결 구조', en: 'TWISTED CONNECTIONS',
    desc: '방마다 중력의 방향이 다르고, 모든 벽에 다른 방으로 통하는 문이 있다. 창밖에는 있을 수 없는 하늘이 보이고, 멀어질수록 공간이 비틀린다.',
    src: SHADERS.D, fov: 1.4, speed: 5,
    spawn: { pos: [12, 12, 30], yaw: 0, pitch: 0, roll: 0 },
    tour(cam, dt, t) {
      cam.pos = [12, 12, cam.pos[2] - dt * 4.5];
      cam.yaw = 0.25 * Math.sin(t * 0.13); cam.pitch = 0.15 * Math.sin(t * 0.09);
      cam.roll = 0.5 * Math.sin(t * 0.06);
    }
  }
];

// ---------- GL setup ----------
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
const errBox = document.getElementById('err');
function fail(msg) { errBox.textContent = msg; errBox.style.display = 'block'; console.error(msg); }
if (!gl) { fail('WebGL2를 지원하지 않는 브라우저입니다. (WebGL2 is required)'); return; }

const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

function compileShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  return s;
}
function buildProgram(scene) {
  const fsrc = SHADERS.header + scene.src.defs + SHADERS.lighting + scene.src.shade + SHADERS.main;
  const vs = compileShader(gl.VERTEX_SHADER, SHADERS.vert);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  return { prog, vs, fs, fsrc, ready: false };
}
const ext = gl.getExtension('KHR_parallel_shader_compile');
function programReady(p) {
  if (p.ready) return true;
  if (ext && !gl.getProgramParameter(p.prog, ext.COMPLETION_STATUS_KHR)) return false;
  if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS)) {
    const log = gl.getShaderInfoLog(p.fs) || gl.getProgramInfoLog(p.prog);
    fail('Shader error:\n' + log);
    p.failed = true; return false;
  }
  const u = n => gl.getUniformLocation(p.prog, n);
  p.u = { res: u('uRes'), time: u('uTime'), cam: u('uCam'), rot: u('uRot'), fov: u('uFov'), lvl: u('uLvl'), warp: u('uWarp') };
  p.ready = true;
  return true;
}
const programs = SCENES.map(() => null);
function getProgram(i) { if (!programs[i]) programs[i] = buildProgram(SCENES[i]); return programs[i]; }

// ---------- camera & input ----------
const cam = { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, lvl: 0, vel: [0, 0, 0] };
let sceneIdx = 0, tour = false, tourT = 0, speedMul = 1, warpAmt = 1;
const keys = new Set();

function camBasis() {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const fwd = [-Math.sin(cam.yaw) * cp, sp, -Math.cos(cam.yaw) * cp];
  let right = norm(cross(fwd, [0, 1, 0]));
  let up = cross(right, fwd);
  const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
  const r2 = add(mul(right, cr), mul(up, sr));
  const u2 = add(mul(up, cr), mul(right, -sr));
  return { fwd, right: r2, up: u2 };
}

function setScene(i, resetCam = true) {
  sceneIdx = i;
  const s = SCENES[i];
  if (resetCam) {
    Object.assign(cam, JSON.parse(JSON.stringify(s.spawn)));
    cam.lvl = s.spawn.lvl || 0; cam.vel = [0, 0, 0];
  }
  tourT = 0;
  getProgram(i);
  document.querySelectorAll('#tabs button').forEach((b, j) => b.classList.toggle('on', j === i));
  document.getElementById('sceneKey').textContent = s.key;
  document.getElementById('sceneName').textContent = s.name;
  document.getElementById('sceneEn').textContent = s.en;
  document.getElementById('sceneDesc').textContent = s.desc;
  document.getElementById('warpRow').style.display = s.key === 'D' ? '' : 'none';
  try { localStorage.setItem('ia.scene', String(i)); } catch (e) {}
}

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (/^Digit[1-4]$/.test(e.code)) setScene(+e.code[5] - 1);
  if (e.code === 'KeyT') toggleTour();
  if (e.code === 'KeyH') document.body.classList.toggle('nohud');
  if (e.code === 'KeyR') setScene(sceneIdx);
  if (e.code === 'BracketLeft') qualityMax = clamp(qualityMax - 0.1, 0.3, 1.5);
  if (e.code === 'BracketRight') qualityMax = clamp(qualityMax + 0.1, 0.3, 1.5);
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function toggleTour(force) {
  tour = force === undefined ? !tour : force;
  tourT = 0;
  document.getElementById('tourBtn').classList.toggle('on', tour);
}

// mouse look: pointer lock, or drag when not locked
let dragging = false, lastX = 0, lastY = 0;
const SENS = 0.0022;
function look(dx, dy) {
  if (tour) toggleTour(false);
  cam.yaw -= dx * SENS; cam.pitch = clamp(cam.pitch - dy * SENS, -1.55, 1.55);
}
canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('mouseup', () => dragging = false);
window.addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) look(e.movementX, e.movementY);
  else if (dragging) { look(e.clientX - lastX, e.clientY - lastY); lastX = e.clientX; lastY = e.clientY; }
});
canvas.addEventListener('dblclick', () => canvas.requestPointerLock && canvas.requestPointerLock());
window.addEventListener('wheel', e => { speedMul = clamp(speedMul * Math.pow(1.0015, -e.deltaY), 0.1, 40); }, { passive: true });

// touch: left half = move stick, right half = look
const touch = { move: null, look: null, mx: 0, my: 0 };
canvas.addEventListener('touchstart', e => {
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.45 && !touch.move) touch.move = { id: t.identifier, x: t.clientX, y: t.clientY };
    else if (!touch.look) touch.look = { id: t.identifier, x: t.clientX, y: t.clientY };
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (touch.move && t.identifier === touch.move.id) { touch.mx = clamp((t.clientX - touch.move.x) / 60, -1, 1); touch.my = clamp((t.clientY - touch.move.y) / 60, -1, 1); }
    if (touch.look && t.identifier === touch.look.id) { look((t.clientX - touch.look.x) * 1.6, (t.clientY - touch.look.y) * 1.6); touch.look.x = t.clientX; touch.look.y = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (touch.move && t.identifier === touch.move.id) { touch.move = null; touch.mx = touch.my = 0; }
    if (touch.look && t.identifier === touch.look.id) touch.look = null;
  }
});

// ---------- UI ----------
document.querySelectorAll('#tabs button').forEach((b, i) => b.addEventListener('click', () => setScene(i)));
document.getElementById('tourBtn').addEventListener('click', () => toggleTour());
document.getElementById('enter').addEventListener('click', () => {
  document.getElementById('intro').classList.add('gone');
  if (matchMedia('(pointer:fine)').matches && canvas.requestPointerLock) canvas.requestPointerLock();
});
document.getElementById('tourStart').addEventListener('click', () => {
  document.getElementById('intro').classList.add('gone');
  toggleTour(true);
});
document.getElementById('warp').addEventListener('input', e => { warpAmt = +e.target.value; });
const statsEl = document.getElementById('stats');
const depthEl = document.getElementById('depth');
const loadingEl = document.getElementById('loading');

// ---------- resolution / adaptive quality ----------
let scale = 0.7, qualityMax = 1.0, frameAcc = 0, frameN = 0;
const fixedScale = parseFloat(new URLSearchParams(location.search).get('scale'));
if (fixedScale > 0) scale = fixedScale;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(innerWidth * dpr * scale));
  const h = Math.max(1, Math.round(innerHeight * dpr * scale));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

// ---------- main loop ----------
let last = performance.now(), time = 0, fpsShown = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  time += dt;
  const s = SCENES[sceneIdx];

  // movement
  if (tour) { tourT += dt; s.tour(cam, dt, tourT); }
  else {
    const { fwd, right, up } = camBasis();
    let w = [0, 0, 0];
    const k = c => keys.has(c) ? 1 : 0;
    const f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') - touch.my;
    const r = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + touch.mx;
    const u = k('KeyE') + k('Space') - k('KeyQ') - k('KeyC');
    w = add(add(mul(fwd, f), mul(right, r)), mul(up, u));
    if (keys.has('KeyZ')) cam.roll -= dt * 0.8;
    if (keys.has('KeyX')) cam.roll += dt * 0.8;
    const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5 : 1;
    const sp = s.speed * speedMul * boost * (s.speedMul ? s.speedMul(cam) : 1);
    const target = mul(w, sp);
    cam.vel = lerp3(cam.vel, target, 1 - Math.exp(-dt * 7));
    const np = add(cam.pos, mul(cam.vel, dt));
    if (s.move) s.move(cam, np); else cam.pos = np;
  }
  if (s.wrapPos) cam.pos = s.wrapPos(cam.pos);

  // adaptive resolution
  frameAcc += dt; frameN++;
  if (frameN >= 20 && !(fixedScale > 0)) {
    const avg = frameAcc / frameN;
    if (avg > 1 / 40) scale = Math.max(0.3, scale * 0.9);
    else if (avg < 1 / 55) scale = Math.min(qualityMax, scale * 1.05);
    fpsShown = 1 / avg; frameAcc = 0; frameN = 0;
  }
  resize();

  const prog = getProgram(sceneIdx);
  if (!programReady(prog)) { loadingEl.style.display = prog.failed ? 'none' : 'block'; return; }
  loadingEl.style.display = 'none';

  const { fwd, right, up } = camBasis();
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(prog.prog);
  gl.uniform2f(prog.u.res, canvas.width, canvas.height);
  gl.uniform1f(prog.u.time, time);
  gl.uniform3fv(prog.u.cam, cam.pos);
  gl.uniformMatrix3fv(prog.u.rot, false, [...right, ...up, ...mul(fwd, -1)]);
  gl.uniform1f(prog.u.fov, s.fov);
  gl.uniform1i(prog.u.lvl, cam.lvl | 0);
  gl.uniform1f(prog.u.warp, warpAmt);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  statsEl.textContent = `${fpsShown.toFixed(0)} FPS · ${canvas.width}×${canvas.height} · 속도 ×${speedMul.toFixed(1)}`;
  if (s.key === 'B') {
    depthEl.style.display = 'block';
    depthEl.innerHTML = cam.lvl === 0
      ? '<b>깊이 0</b> · 바깥 · 축척 1:1'
      : `<b>깊이 ${cam.lvl}</b> · 내부 · 축척 1:${cam.lvl <= 4 ? Math.pow(30, cam.lvl).toLocaleString() : '30<sup>' + cam.lvl + '</sup>'}`;
  } else depthEl.style.display = 'none';
}

// expose for testing
window.__IA = { cam, setScene, SCENES, toggleTour, get time() { return time; }, set time(v) { time = v; } };

let start = 0;
try { start = clamp(parseInt(localStorage.getItem('ia.scene') || '0', 10) || 0, 0, 3); } catch (e) {}
const hashKey = location.hash.replace('#', '').toUpperCase();
const hi = SCENES.findIndex(s => s.key === hashKey);
if (hi >= 0) start = hi;
setScene(start);
// warm up the other programs in the background
setTimeout(() => SCENES.forEach((_, i) => getProgram(i)), 1500);
requestAnimationFrame(frame);
})();
