// An Ordinary House — one continuous raymarched world explored on foot.
// No libraries, no meshes, no textures. Collision reads the same distance field the GPU draws.
(() => {
'use strict';

// ---------- vector helpers ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const wrap = (v, period) => ((v + period / 2) % period + period) % period - period / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// rotate v around unit axis k by angle a (Rodrigues)
function rotAxis(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

// ---------- world constants (mirror js/shaders/world.js + sceneTower.js) ----------
const TOWER = 0, ROOMS = 1;
const FH = 3.6, SQ_IN = 30, SQ_OUT = 42, UW = 12, R_ATR = 26.5;
const RD_D = [12, 9, 24], BED_D = 2.6, BED_L = -4.1;
const sideOf = p => Math.abs(p[0]) >= Math.abs(p[2]) ? (p[0] > 0 ? 0 : 2) : (p[2] > 0 ? 1 : 3);
const toSide = (p, s) => s === 0 ? p.slice() : s === 1 ? [p[2], p[1], -p[0]] : s === 2 ? [-p[0], p[1], -p[2]] : [-p[2], p[1], p[0]];
const fromSide = (c, s) => s === 0 ? c.slice() : s === 1 ? [-c[2], c[1], c[0]] : s === 2 ? [-c[0], c[1], -c[2]] : [c[2], c[1], -c[0]];
function crossT(a, b, v, dir) {
  if (dir < 0 ? (a > v && b <= v) : (a < v && b >= v)) return (a - v) / (a - b);
  return -1;
}
// rooms: same integer hash as the shader -> same gravity as what you see
function roomHash(id) {
  const c = id.map(v => (v + (1 << 20)) >>> 0);
  let h = (Math.imul(c[0], 73856093) ^ Math.imul(c[1], 19349663) ^ Math.imul(c[2], 83492791)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 0x5bd1e995) >>> 0; h = (h ^ (h >>> 15)) >>> 0;
  return h;
}
function roomUp(pos) {
  const id = pos.map(v => Math.floor(v / 24));
  if (id[0] === 0 && id[1] === 0 && id[2] === 0) return [0, 1, 0];
  const h = roomHash(id);
  const axis = [1, 2, 0, 2, 0, 1][h % 6];
  const s = (h & 16) ? 1 : -1;
  const u = [0, 0, 0]; u[axis] = s; return u;
}
function roomWindow(q) {
  const aq = q.map(Math.abs), mx = Math.max(...aq);
  if (mx < 11.5) return null;
  const ax = aq[0] >= mx ? 0 : aq[1] >= mx ? 1 : 2;
  const fw = [0, 1, 2].filter(i => i !== ax).map(i => q[i]);
  if (Math.max(Math.abs(Math.abs(fw[0]) - 7), Math.abs(Math.abs(fw[1]) - 7)) > 2.05) return null;
  return q.map((v, i) => Math.sign(v) * (i === ax ? 11.6 : 7));
}
// the flat the player entered the rooms from: [side, floor base y, unit centre]
const home = [0, 1202 * 3.6, 24];
const inGallery = p => p[0] > 25 && p[0] < 42.4 && Math.abs(p[2]) < 18 && p[1] > 1202*FH-.3 && p[1] < 1208*FH+.3;

// Crossing from p to np: returns {pos, space, rot} if a portal took us somewhere else.
// rot(v) re-expresses a direction in the new space.
function camPortal(space, p, np) {
  let f;
  if (space === TOWER) {
    const s = sideOf(p), c0 = toSide(p, s), c1 = toSide(np, s);
    if (Math.abs(c0[2]) < SQ_IN && c0[0] > SQ_IN && c0[0] < SQ_IN + 6) {
      const uz = clamp(Math.round(c0[2] / UW), -2, 2);
      if ((f = crossT(c0[2] - uz * UW, c1[2] - uz * UW, BED_L, -1)) >= 0) {
        const ip = lerp3(c0, c1, f);
        const fl = Math.floor(ip[1] / FH), fy = ip[1] - fl * FH;
        if (Math.abs(ip[0] - SQ_IN - BED_D) < 0.6 && fy > -0.5 && fy < 2.6 && !isLounge(fl) && !inGallery(fromSide(ip,s))) {
          home[0] = s; home[1] = fl * FH; home[2] = uz * UW;
          const fy1 = c1[1] - fl * FH;
          return { pos: add(RD_D, [c1[0] - SQ_IN - BED_D, fy1, c1[2] - uz * UW - BED_L]), space: ROOMS, rot: v => toSide(v, s) };
        }
      }
    }
  } else {
    const inRoom0 = p.every(v => v >= 0 && v < 24);
    if (inRoom0 && (f = crossT(p[2], np[2], RD_D[2], 1)) >= 0) {
      const ip = lerp3(p, np, f);
      if (Math.abs(ip[0] - RD_D[0]) < 0.6 && ip[1] > RD_D[1] - 0.5 && ip[1] < RD_D[1] + 2.6) {
        const v = sub(np, RD_D), hs = home[0];
        return { pos: fromSide([SQ_IN + BED_D + v[0], home[1] + v[1], home[2] + BED_L + v[2]], hs), space: TOWER, rot: w => fromSide(w, hs) };
      }
    }
    const c = p.map(v => (Math.floor(v / 24) + 0.5) * 24);
    const q0 = sub(p, c), q1 = sub(np, c);
    const m0 = Math.max(...q0.map(Math.abs)), m1 = Math.max(...q1.map(Math.abs));
    if (m0 < 11.6 && m1 >= 11.6) {
      const ipq = lerp3(q0, q1, (11.6 - m0) / (m1 - m0));
      const wc = roomWindow(ipq.map(v => v + Math.sign(v) * 0.001));
      if (wc) return { pos: add([47, home[1] + 24, 0], sub(q1, wc)), space: TOWER, rot: v => v };
    }
  }
  return null;
}

// every 12 floors, three storeys are one lounge (mirrors isLounge() in the shader)
const isLounge = n => { const L = ((n % 12) + 12) % 12; return L > 2.5 && L < 5.5; };
const loungeBase = n => n - ((((n % 12) + 12) % 12) - 3);
const LOUNGE_LINES = [
  '거대한 아치와 다리로 이어진 라운지. 어디가 바깥이고 어디가 안쪽인지 모호하다',
  '어디선가 본 듯한 가구와 책들이 끝없이 반복된다',
  '물에 비친 방이 진짜 방과 이어져 있는 것 같다',
  '같은 라운지로 계속 돌아오는 것 같다',
  '창밖이 또 다른 안쪽으로 이어진다'
];

// where in the tower are we? (for the HUD)
function region(pos) {
  if (P.space === ROOMS) return { key: 'rooms', name: '침실', sub: '방마다 아래가 다른 곳을 향한다' };
  if (inGallery(pos)) return {key:'gallery',name:'동쪽 호텔 갤러리',sub:'붉은 복도 너머, 라운지와 경사로가 여섯 층의 공동을 가로지른다'};
  const s = sideOf(pos), c = toSide(pos, s);
  const fl = Math.floor((pos[1] - 0.2) / FH);
  const floorNo = fl + 1;
  const r = Math.hypot(pos[0], pos[2]);
  const fl0 = Math.floor(pos[1] / FH);
  if (isLounge(fl0) && r > R_ATR && c[0] < SQ_OUT) {
    const nb = loungeBase(fl0);
    return { key: 'lounge' + nb, name: `${nb + 1}층 라운지`, sub: LOUNGE_LINES[((nb / 12 | 0) % 5 + 5) % 5] };
  }
  if (c[0] > SQ_IN && c[0] < SQ_OUT && Math.abs(c[2]) < SQ_IN) {
    const uz = clamp(Math.round(c[2] / UW), -2, 2);
    const mine = fl === SPAWN_FLOOR && s === 0 && uz === 2;
    return { key: 'flat' + fl + '/' + s + '/' + uz, name: `${floorNo}층 ${s * 5 + uz + 3}호`, sub: mine ? '평범한 집. 우리 집이다.' : '누군가의 집. 우리 집과 똑같다.' };
  }
  if (c[0] <= SQ_IN && r > R_ATR) return { key: 'corr' + fl, name: `${floorNo}층 복도`, sub: '복도는 계단을 둘러싸고 있다' };
  if (r <= R_ATR) return { key: 'atrium', name: '계단', sub: '위로도 아래로도 끝이 없다' };
  return { key: 'out', name: '바깥', sub: '모든 창문이 누군가의 집이다' };
}

const SPAWN_FLOOR = 1202;   // you live in 1203호 (floor 1203)
const SPAWNS = [
  { space: TOWER, pos: [SQ_IN + 7.5, SPAWN_FLOOR * FH + 1.6, 25.5], yaw: -Math.PI / 2 + 0.25, pitch: 0.02 },    // preserved flat beside the gallery
  { space: TOWER, pos: [28.2, SPAWN_FLOOR * FH + 1.6, 4], yaw: Math.PI, pitch: 0 },                           // corridor
  (() => { const a = -2 * Math.PI * SPAWN_FLOOR / 5, cx = Math.cos(a), cz = Math.sin(a);                    // atrium bridge
    return { space: TOWER, pos: [cx * 24.6, SPAWN_FLOOR * FH + 1.6, cz * 24.6], yaw: Math.atan2(cx, cz), pitch: -0.35 }; })(),
  { space: TOWER, pos: [SQ_IN + 13.1, SPAWN_FLOOR * FH + 1.6, 0], yaw: Math.PI / 2 + 0.6, pitch: 0.15 },      // balcony
  { space: ROOMS, pos: [12, 10.6, 21], yaw: 0, pitch: 0 },
  { space: TOWER, pos: [-32.5, (SPAWN_FLOOR + 1) * FH + 1.6, -9], yaw: Math.PI / 2 - 0.5, pitch: 0.08 },      // preserved west lounge
  { space: TOWER, pos: [28.2, SPAWN_FLOOR*FH+1.6,4], yaw:-Math.PI/2-.55,pitch:.1 }
];

// ---------- GL ----------
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
const $ = id => document.getElementById(id);
function fail(msg) { $('err').textContent = msg; $('err').style.display = 'block'; console.error(msg); }
if (!gl) { fail('WebGL2를 지원하지 않는 브라우저입니다. (WebGL2 is required)'); return; }
const floatRT = !!gl.getExtension('EXT_color_buffer_float');
// if the GPU gives up on a frame (driver timeout), say so and come back at a lower resolution
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  try { localStorage.setItem('ia.lost', '1'); } catch (er) {}
  fail('GPU가 한 프레임을 끝내지 못해 연결이 끊어졌습니다. 새로고침하면 낮은 해상도로 다시 시작합니다.\n(The GPU timed out. Reload to restart at a lower resolution.)');
});
const pext = gl.getExtension('KHR_parallel_shader_compile');

const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

const BODY = SHADERS.header + SHADERS.worldConsts +
  SHADERS.Tower.defs + SHADERS.D.defs + SHADERS.Gallery +
  SHADERS.worldDispatch + SHADERS.lighting +
  SHADERS.GalleryShade + SHADERS.Tower.shade + SHADERS.D.shade +
  SHADERS.worldShade;

function makeProgram(fsrc) {
  const p = { prog: gl.createProgram(), ready: false, failed: false };
  const vs = gl.createShader(gl.VERTEX_SHADER); gl.shaderSource(vs, SHADERS.vert); gl.compileShader(vs);
  p.fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(p.fs, fsrc); gl.compileShader(p.fs);
  gl.attachShader(p.prog, vs); gl.attachShader(p.prog, p.fs);
  gl.bindAttribLocation(p.prog, 0, 'aPos');
  gl.linkProgram(p.prog);
  return p;
}
function ready(p, names) {
  if (p.ready) return true;
  if (p.failed) return false;
  if (pext && !gl.getProgramParameter(p.prog, pext.COMPLETION_STATUS_KHR)) return false;
  if (!gl.getProgramParameter(p.prog, gl.LINK_STATUS)) { fail('Shader error:\n' + (gl.getShaderInfoLog(p.fs) || gl.getProgramInfoLog(p.prog))); p.failed = true; return false; }
  p.u = {}; for (const n of names) p.u[n] = gl.getUniformLocation(p.prog, n);
  p.ready = true; return true;
}
const UN = ['uRes', 'uTime', 'uCam', 'uRot', 'uFov', 'uSpace', 'uDepth', 'uWarp', 'uWarpC', 'uProbe', 'uHome', 'uDip', 'uSupply'];
const render = makeProgram(BODY + SHADERS.main);
const probe = floatRT ? makeProgram(BODY.replace('#version 300 es', '#version 300 es\n#define PROBE') + SHADERS.probeMain) : null;

let probeFB = null;
if (probe) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 8, 1, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  probeFB = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, probeFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
const probeBuf = new Float32Array(32);

let time = 0, warpAmt = 1;
function drawQuad() {
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
// evaluate the distance field (and its normal) at up to 8 points in a given space
function sampleSDF(space, points, warpC) {
  if (!probe || !ready(probe, UN)) return null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, probeFB);
  gl.viewport(0, 0, points.length, 1);
  gl.useProgram(probe.prog);
  gl.uniform1f(probe.u.uTime, time);
  gl.uniform1i(probe.u.uSpace, space);
  gl.uniform1i(probe.u.uDepth, 0);
  gl.uniform1f(probe.u.uWarp, warpAmt);
  gl.uniform3fv(probe.u.uWarpC, warpC);
  gl.uniform3fv(probe.u.uHome, home);
  gl.uniform1f(probe.u.uDip, 0);
  const flat = new Float32Array(24); points.forEach((p, i) => flat.set(p, i * 3));
  gl.uniform3fv(probe.u.uProbe, flat);
  drawQuad();
  gl.readPixels(0, 0, points.length, 1, gl.RGBA, gl.FLOAT, probeBuf);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return points.map((_, i) => ({ n: [probeBuf[i * 4], probeBuf[i * 4 + 1], probeBuf[i * 4 + 2]], d: probeBuf[i * 4 + 3] }));
}

// ---------- player ----------
const P = {
  space: TOWER, pos: [37.5, 1.6, 1.5], vel: [0, 0, 0],
  up: [0, 1, 0], fwd0: [0, 0, -1],    // view frame (eases toward the gravity frame)
  gUp: [0, 1, 0],                     // gravity "up" (changes room by room)
  yaw: 0, pitch: 0, grounded: false, fly: false, noclip: false
};
// body: three spheres kept above step height (walls, ceilings), plus three 'leg' probes that find the floor
const EYE = 1.6, STEP = 0.5;
const BODYS = [{ off: 1.0, r: 0.32 }, { off: 0.52, r: 0.3 }, { off: 0.12, r: 0.22 }];
const LEGS = [0.5, 0.3, 0.1];   // heights above the feet
const G = 22, JUMP = 7.4, WALK = 4.6, RUN = 8.5, FLY = 8, FLYRUN = 36, TERMINAL = 55;

function viewBasis() {
  const U = P.up, F0 = P.fwd0, L0 = cross(U, F0);    // left
  const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw), cp = Math.cos(P.pitch), sp = Math.sin(P.pitch);
  const horiz = add(mul(F0, cy), mul(L0, sy));
  const fwd = add(mul(horiz, cp), mul(U, sp));
  const right = norm(cross(fwd, U));
  const up = cross(right, fwd);
  return { fwd, right, up, horiz };
}
function setGravity(u) { P.gUp = u; }
function easeViewUp(dt) {
  const a = Math.acos(clamp(dot(P.up, P.gUp), -1, 1));
  if (a < 1e-4) { P.up = P.gUp.slice(); return; }
  let axis = cross(P.up, P.gUp);
  if (len(axis) < 1e-5) axis = norm(cross(P.up, P.fwd0)); else axis = norm(axis);
  const step = Math.min(a, a * (1 - Math.exp(-dt * 5)) + dt * 0.4);
  P.up = norm(rotAxis(P.up, axis, step));
  P.fwd0 = norm(rotAxis(P.fwd0, axis, step));
  P.fwd0 = norm(sub(P.fwd0, mul(P.up, dot(P.fwd0, P.up))));
}
function spawn(i) {
  const s = SPAWNS[i];
  P.space = s.space; P.pos = s.pos.slice(); P.vel = [0, 0, 0];
  P.up = [0, 1, 0]; P.gUp = [0, 1, 0]; P.fwd0 = [0, 0, -1]; P.yaw = s.yaw; P.pitch = s.pitch;
  if (P.space === ROOMS) setGravity(roomUp(P.pos));
  announce(true);
}

// ---------- input ----------
const keys = new Set();
let lastSpace = -1, jumpQueued = false;
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space' && !e.repeat) {
    const now = performance.now();
    if (now - lastSpace < 300) { P.fly = !P.fly; lastSpace = -1; P.vel = mul(P.vel, 0.3); jumpQueued = false; showMode(); }
    else { lastSpace = now; jumpQueued = true; }
  }
  keys.add(e.code);
  if (/^Digit[1-7]$/.test(e.code)) spawn(+e.code[5] - 1);
  if (e.code === 'KeyN') { P.noclip = !P.noclip; showMode(); }
  if (e.code === 'KeyH') document.body.classList.toggle('nohud');
  if (e.code === 'KeyR') spawn(0);
  if (e.code === 'BracketLeft') qualityMax = clamp(qualityMax - 0.1, 0.3, 1.5);
  if (e.code === 'BracketRight') qualityMax = clamp(qualityMax + 0.1, 0.3, 1.5);
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const SENS = 0.0022;
function look(dx, dy) { P.yaw -= dx * SENS; P.pitch = clamp(P.pitch - dy * SENS, -1.5, 1.5); }
let dragging = false, lx = 0, ly = 0;
canvas.addEventListener('mousedown', e => { dragging = true; lx = e.clientX; ly = e.clientY; });
window.addEventListener('mouseup', () => dragging = false);
window.addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) look(e.movementX, e.movementY);
  else if (dragging) { look(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; }
});
canvas.addEventListener('click', () => { if (matchMedia('(pointer:fine)').matches && canvas.requestPointerLock && $('intro').classList.contains('gone')) canvas.requestPointerLock(); });

// touch: left = stick, right = look, double-tap right = jump / fly
const touch = { move: null, look: null, mx: 0, my: 0, lastTap: 0 };
canvas.addEventListener('touchstart', e => {
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.45 && !touch.move) touch.move = { id: t.identifier, x: t.clientX, y: t.clientY };
    else if (!touch.look) {
      touch.look = { id: t.identifier, x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 };
    }
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (touch.move && t.identifier === touch.move.id) { touch.mx = clamp((t.clientX - touch.move.x) / 60, -1, 1); touch.my = clamp((t.clientY - touch.move.y) / 60, -1, 1); }
    if (touch.look && t.identifier === touch.look.id) {
      const dx = t.clientX - touch.look.x, dy = t.clientY - touch.look.y;
      touch.look.moved += Math.abs(dx) + Math.abs(dy);
      look(dx * 1.6, dy * 1.6); touch.look.x = t.clientX; touch.look.y = t.clientY;
    }
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (touch.move && t.identifier === touch.move.id) { touch.move = null; touch.mx = touch.my = 0; }
    if (touch.look && t.identifier === touch.look.id) {
      if (touch.look.moved < 12 && performance.now() - touch.look.t0 < 250) {   // a tap = Space
        const now = performance.now();
        if (now - touch.lastTap < 320) { P.fly = !P.fly; touch.lastTap = 0; showMode(); } else { touch.lastTap = now; jumpQueued = true; }
      }
      touch.look = null;
    }
  }
});

// ---------- HUD ----------
let announced = '', pendingKey = '', pendingT = 0;
function announce(force) {
  const rg = region(P.pos);
  if (rg.key === announced) { pendingKey = ''; return; }
  // only announce places you actually stay in for a moment
  if (!force && rg.key !== pendingKey) { pendingKey = rg.key; pendingT = performance.now(); return; }
  if (!force && performance.now() - pendingT < 500) return;
  announced = rg.key; pendingKey = '';
  $('placeName').textContent = rg.name;
  $('placeSub').textContent = rg.sub;
  const el = $('place'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function showMode() {
  $('mode').textContent = (P.noclip ? '유령' : P.fly ? '비행' : '걷기') + (P.noclip ? ' · N' : P.fly ? ' · 스페이스 두 번: 중력' : ' · 스페이스 두 번: 비행');
  $('mode').classList.toggle('fly', P.fly || P.noclip);
}
$('enter').addEventListener('click', () => {
  $('intro').classList.add('gone');
  startAudio();
  if (matchMedia('(pointer:fine)').matches && canvas.requestPointerLock) canvas.requestPointerLock();
});
$('warp').addEventListener('input', e => { warpAmt = +e.target.value; });


// ---------- sound: fluorescent hum, brown-outs, and a voice from somewhere in the building ----------
let AC = null, humGain = null, rumble = null, dip = 0, dipUntil = 0, nextDip = 12 + Math.random() * 20;
const power = createBuildingPower();
let nextVoice = 35 + Math.random() * 30, voice = null;
const LINE = '야. 개 짖는 소리 좀 안나게 해라.';
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang));
  voice = vs.find(v => /InJoon|Hyunsu|male|남성/i.test(v.name) && !/female|여성/i.test(v.name)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

function startAudio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    // mains hum of old tubes: 120 Hz and its harmonics
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    humGain = AC.createGain(); humGain.gain.value = 0;
    for (const [f, type, g] of [[120, 'sawtooth', 0.6], [240, 'sine', 0.3], [60, 'sine', 0.5]]) {
      const o = AC.createOscillator(); o.type = type; o.frequency.value = f;
      const og = AC.createGain(); og.gain.value = g; o.connect(og); og.connect(lp); o.start();
    }
    lp.connect(humGain); humGain.connect(AC.destination);
    // a long reverb tail made of noise, used to give the voice a room it doesn't have
    const len = AC.sampleRate * 4, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    rumble = buf;
  } catch (e) { AC = null; }
}
function swell() {
  // a low, distant swell of air while the voice speaks
  if (!AC || !rumble) return;
  const src = AC.createBufferSource(); src.buffer = rumble;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
  const g = AC.createGain(); const t = AC.currentTime;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.8); g.gain.linearRampToValueAtTime(0, t + 4);
  src.connect(f); f.connect(g); g.connect(AC.destination); src.start();
}
function subtitle(text) {
  const el = $('voice'); el.textContent = text;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function speak() {
  dipUntil = time + 4.5;
  swell();
  subtitle('— ' + LINE);
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  // the line, then its own tail coming back fainter and slower: an echo down the corridors
  const parts = [[LINE, 1.0, 0.72, 0.15], ['안나게 해라.', 0.35, 0.66, 0.08], ['해라.', 0.14, 0.6, 0.02]];
  for (const [t, v, r, p] of parts) {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'ko-KR'; if (voice) u.voice = voice;
    u.volume = v; u.rate = r; u.pitch = p;
    speechSynthesis.speak(u);
  }
}
function updateSound(dt) {
  power.update(dt);
  // brown-outs: during the voice, and now and then on their own
  if (time > nextDip) { dipUntil = Math.max(dipUntil, time + 0.25 + Math.random() * 0.6); nextDip = time + 15 + Math.random() * 35; }
  const target = time < dipUntil ? 1 : 0;
  dip += (target - dip) * Math.min(1, dt * 12);
  if (time > nextVoice && $('intro').classList.contains('gone')) { speak(); nextVoice = time + 75 + Math.random() * 100; }
  if (!humGain) return;
  const rg = region(P.pos).key;
  let h = rg.startsWith('corr') ? 0.03 : rg.startsWith('flat') ? 0.008 : rg === 'atrium' ? 0.01 : 0.002;
  if (dip > 0.1) h *= Math.random() < 0.5 ? 0.1 : 1.6;     // the tubes crackle when the power sags
  h *= power.state().supply;
  humGain.gain.setTargetAtTime(h, AC.currentTime, 0.05);
}

// ---------- physics ----------
function warpCenterFor(space, pos) { return space === ROOMS ? pos : [12, 12, 12]; }

function applyPortal(r) {
  // directions are re-expressed in the new space (portals may turn you around)
  P.vel = r.rot(P.vel); P.fwd0 = norm(r.rot(P.fwd0)); P.up = norm(r.rot(P.up));
  P.space = r.space; P.pos = r.pos;
  if (P.space === ROOMS) setGravity(roomUp(sub(P.pos, mul(P.gUp, 0.8))));
  else setGravity([0, 1, 0]);
  announce(true);
}
function wrapSpace() {}

function physics(dt) {
  const { fwd, right } = viewBasis();
  const k = c => keys.has(c) ? 1 : 0;
  const f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') - touch.my;
  const s = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + touch.mx;
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const U = P.gUp;

  if (P.fly || P.noclip) {
    const vert = k('Space') + k('KeyE') - k('KeyC') - k('ControlLeft') - k('KeyQ');
    const sp = run ? FLYRUN : FLY;
    const wish = mul(add(add(mul(fwd, f), mul(right, s)), mul(U, vert)), sp);
    P.vel = lerp3(P.vel, wish, 1 - Math.exp(-dt * 6));
    jumpQueued = false;
  } else {
    const hf = norm(sub(fwd, mul(U, dot(fwd, U))));
    const hr = norm(sub(right, mul(U, dot(right, U))));
    let wish = add(mul(hf, f), mul(hr, s));
    if (len(wish) > 1) wish = norm(wish);
    wish = mul(wish, run ? RUN : WALK);
    const vu = dot(P.vel, U);
    let vh = sub(P.vel, mul(U, vu));
    vh = lerp3(vh, wish, 1 - Math.exp(-dt * (P.grounded ? 12 : 2.2)));
    if (P.space === TOWER && !P.grounded && vu < -16) {
      // falling past the facade: the tower draws you onto a balcony
      const sd = sideOf(P.pos), c = toSide(P.pos, sd);
      if (c[0] > SQ_OUT + 0.3) {
        const uz = clamp(Math.round(c[2] / UW), -2, 2);
        const tgt = fromSide([SQ_OUT + 0.9, c[1], uz * UW], sd);
        const hv = sub(tgt, P.pos); hv[1] = 0;
        const dh = len(hv);
        if (dh > 0.3) vh = add(vh, mul(norm(hv), Math.min(dh * 1.5, 14) * dt * 1.2));
      }
    }
    let nvu = Math.max(vu - G * dt, -TERMINAL);
    if (jumpQueued && P.grounded) { nvu = JUMP; P.grounded = false; }
    jumpQueued = false;
    P.vel = add(vh, mul(U, nvu));
  }

  const travel = len(P.vel) * dt;
  const n = clamp(Math.ceil(travel / 0.22), 1, 12);
  const h = dt / n;
  let grounded = false;
  for (let i = 0; i < n; i++) {
    let np = add(P.pos, mul(P.vel, h));
    const r = camPortal(P.space, P.pos, np);
    if (r) { applyPortal(r); continue; }
    if (!P.noclip) {
      const Ub = P.gUp;
      const feet = sub(np, mul(Ub, EYE));
      const pts = BODYS.map(b => sub(np, mul(Ub, b.off))).concat(LEGS.map(hh => add(feet, mul(Ub, hh))));
      const res = sampleSDF(P.space, pts, warpCenterFor(P.space, np));
      if (res) {
        // walls and ceilings
        for (let j = 0; j < BODYS.length; j++) {
          const { n: nn, d } = res[j];
          if (!(d < BODYS[j].r) || !isFinite(nn[0]) || len(nn) < 1e-6) continue;
          const nv = norm(nn);
          if (j === 0 && dot(nv, Ub) > 0.6) continue;            // floors are the legs' job
          np = add(np, mul(nv, BODYS[j].r - d));
          const vn = dot(P.vel, nv);
          if (vn < 0) P.vel = sub(P.vel, mul(nv, vn));
        }
        // floor: highest walkable surface under the legs
        let g = -1e9;
        for (let j = 0; j < LEGS.length; j++) {
          const { n: nn, d } = res[BODYS.length + j];
          if (!isFinite(nn[0]) || len(nn) < 1e-6) continue;
          if (dot(norm(nn), Ub) < 0.45) continue;
          g = Math.max(g, LEGS[j] - d);
        }
        const vu = dot(P.vel, Ub);
        const reach = P.grounded ? 0.32 : 0.02;                   // follow stairs down only when already standing
        if (g > -reach && vu <= 0.5) {
          grounded = true;
          np = add(np, mul(Ub, clamp(g, -reach, STEP)));
          if (vu < 0) P.vel = sub(P.vel, mul(Ub, vu));
        } else if (g > 0) {
          np = add(np, mul(Ub, Math.min(g, STEP)));                 // never sink into the floor (flying, jumping)
          if (vu < 0) P.vel = sub(P.vel, mul(Ub, vu));
        }
      }
    }
    P.pos = np;
    if (P.space === ROOMS) {
      // gravity follows the room you are in, once you are properly inside it (no flicker in doorways)
      const body = sub(P.pos, mul(P.gUp, 0.8));
      const q = body.map(v => v - (Math.floor(v / 24) + 0.5) * 24);
      if (12 - Math.max(...q.map(Math.abs)) > 0.9) {
        const g = roomUp(body);
        if (dot(g, P.gUp) < 0.99) setGravity(g);
      }
    }
    wrapSpace();
  }
  P.grounded = grounded;
  easeViewUp(dt);
  announce();
}

// ---------- resolution ----------
let lowStart = false;
try { lowStart = localStorage.getItem('ia.lost') === '1'; } catch (e) {}
let scale = lowStart ? 0.3 : 0.45, qualityMax = 1.0, frameAcc = 0, frameN = 0, fpsShown = 0;
const fixedScale = parseFloat(new URLSearchParams(location.search).get('scale'));
if (fixedScale > 0) scale = fixedScale;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(1, Math.round(innerWidth * dpr * scale)), h = Math.max(1, Math.round(innerHeight * dpr * scale));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

// ---------- loop ----------
let last = performance.now();
const t0 = performance.now();
const autoStep = { on: false };
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = document.hidden ? 0 : Math.min(1, (now-last)/1000);
  const dt = Math.min(0.05, elapsed); last = now;
  time += elapsed;
  const allReady = ready(render, UN) && (!probe || ready(probe, UN));
  if (allReady && !autoStep.on) physics(dt);
  if (allReady) updateSound(elapsed);

  frameAcc += elapsed; frameN++;
  if (frameN >= 20) {
    const avg = frameAcc / frameN;
    if (!(fixedScale > 0)) {
      if (avg > 1 / 40) scale = Math.max(0.3, scale * 0.9);
      else if (avg < 1 / 55) scale = Math.min(qualityMax, scale * 1.05);
    }
    fpsShown = 1 / avg; frameAcc = 0; frameN = 0;
  }
  resize();
  if (!ready(render, UN)) {
    $('loading').style.display = render.failed ? 'none' : 'block';
    $('loadingT').textContent = Math.floor((performance.now() - t0) / 1000) + 's';
    return;
  }
  if ($('loading').style.display !== 'none') { $('loading').style.display = 'none'; console.log('[house] shaders ready in', ((performance.now() - t0) / 1000).toFixed(1), 's'); }
  if (lowStart && fpsShown > 45) { try { localStorage.removeItem('ia.lost'); } catch (e) {} lowStart = false; }
  draw();
  $('stats').textContent = `${fpsShown.toFixed(0)} FPS · ${canvas.width}×${canvas.height}`;
}
function draw() {
  const { fwd, right, up } = viewBasis();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(render.prog);
  gl.uniform2f(render.u.uRes, canvas.width, canvas.height);
  gl.uniform1f(render.u.uTime, time);
  gl.uniform3fv(render.u.uCam, P.pos);
  gl.uniformMatrix3fv(render.u.uRot, false, [...right, ...up, ...mul(fwd, -1)]);
  gl.uniform1f(render.u.uFov, 1.35);
  gl.uniform1i(render.u.uSpace, P.space);
  gl.uniform1i(render.u.uDepth, 0);
  gl.uniform1f(render.u.uWarp, warpAmt);
  gl.uniform3fv(render.u.uWarpC, warpCenterFor(P.space, P.pos));
  gl.uniform3fv(render.u.uHome, home);
  gl.uniform1f(render.u.uDip, dip);
  gl.uniform1f(render.u.uSupply, power.state().supply);
  drawQuad();
}

if (!floatRT) { P.noclip = true; console.warn('EXT_color_buffer_float unavailable: collisions disabled'); }
// test hook
window.__IA = { power, speak, P, spawn, physics, keys, camPortal, sampleSDF, autoStep, roomUp, get time() { return time; }, set time(v) { time = v; }, press: c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c })) };

const startIdx = { HOME: 0, CORRIDOR: 1, STAIRS: 2, BALCONY: 3, ROOMS: 4, LOUNGE:5, GALLERY:6 }[location.hash.replace('#', '').toUpperCase()] ?? 6;
spawn(startIdx);
showMode();
requestAnimationFrame(frame);
})();
