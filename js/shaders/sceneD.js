// D. TWISTED CONNECTIONS — an infinite lattice of rooms. Each room has its own "down"
// (a random rotation/reflection of the cube), every wall has a door, windows open onto a sky
// that cannot exist, and space itself twists the farther it gets from you.
SHADERS.D = {
defs: `
#define MAXSTEPS 180
#define STEPK 0.8
#define MAXD 380.
#define SHSTEPS 24
const float S = 24.;

vec3 warp(vec3 p, out float lip){
  vec3 w = p - uCam;
  float k = uWarp*(0.008 + 0.006*sin(uTime*0.09));
  w.xy *= rot(w.z*k);
  w.zx *= rot(w.y*k*0.7);
  lip = 1. + abs(k)*1.8*length(w);
  return w + uCam;
}
vec3 permv(vec3 v, float h){
  int k = int(h*6.);
  return k == 0 ? v : k == 1 ? v.yzx : k == 2 ? v.zxy : k == 3 ? v.xzy : k == 4 ? v.yxz : v.zyx;
}
vec3 roomR(vec3 q, vec3 id){
  float h1 = hash13(id + .17), h2 = hash13(id*1.31 + 4.2);
  vec3 sg = vec3(h2 > .5 ? 1. : -1., fract(h2*7.13) > .5 ? 1. : -1., fract(h2*13.7) > .5 ? 1. : -1.);
  return permv(q, h1)*sg;
}

vec2 room(vec3 q, vec3 id){
  vec3 aq = abs(q);
  float wall = -sdBox(q, vec3(11.));
  float hx = max(sdBox2(q.yz, vec2(3.)), 10.4 - aq.x);
  float hy = max(sdBox2(q.xz, vec2(3.)), 10.4 - aq.y);
  float hz = max(sdBox2(q.xy, vec2(3.)), 10.4 - aq.z);
  float wx = max(max(sdBox2(abs(q.yz) - 7., vec2(2.)), 10.5 - aq.x), aq.x - 11.6);
  float wy = max(max(sdBox2(abs(q.xz) - 7., vec2(2.)), 10.5 - aq.y), aq.y - 11.6);
  float wz = max(max(sdBox2(abs(q.xy) - 7., vec2(2.)), 10.5 - aq.z), aq.z - 11.6);
  wall = max(wall, -min(min(min(hx, hy), hz), min(min(wx, wy), wz)));
  vec2 res = vec2(wall, 1.);

  vec3 r = roomR(q, id);
  // bridge between two doors
  res = opU(res, vec2(sdBox(r - vec3(0., -3.35, 0.), vec3(12., 0.35, 3.)), 2.));
  res = opU(res, vec2(sdBox(vec3(r.x, r.y + 2.4, abs(r.z) - 2.85), vec3(10.8, 0.6, 0.07)), 3.));
  // stair: floor -> bridge
  res = opU(res, vec2(stairStraight(vec3(10.6 - r.z, r.y + 11., r.x - 6.), 7.6, 8., 16., 1.5, 0.5), 2.));
  // mezzanine + stair: bridge -> mezzanine
  res = opU(res, vec2(sdBox(r - vec3(4., 3.6, 7.4), vec3(7., 0.4, 3.6)), 2.));
  res = opU(res, vec2(sdBox(vec3(r.x - 4., r.y - 4.6, r.z - 3.9), vec3(7., 0.6, 0.07)), 3.));
  res = opU(res, vec2(stairStraight(vec3(r.x + 10., r.y + 3., r.z - 5.4), 7., 7., 14., 1.4, 0.45), 2.));
  // columns under the mezzanine
  float cxz = min(length(r.xz - vec2(-2.6, 10.4)), length(r.xz - vec2(10.4, 4.2)));
  res = opU(res, vec2(max(cxz - 0.32, abs(r.y + 3.9) - 7.1), 3.));
  // picture frames on two walls
  float fr1 = sdBox(vec3(r.x + 10.9, r.y, abs(r.z) - 7.), vec3(0.15, 2.0, 1.5));
  float fr2 = sdBox(vec3(abs(r.x) - 7., r.y, r.z + 10.9), vec3(1.5, 2.0, 0.15));
  res = opU(res, vec2(min(fr1, fr2), 4.));
  // hanging lamp
  res = opU(res, vec2(length(r - vec3(-6., 6., -6.)) - 0.55, 6.));
  res = opU(res, vec2(max(length(r.xz - vec2(-6.)) - 0.03, abs(r.y - 8.8) - 2.3), 3.));
  return res;
}

vec2 map(vec3 p){
  float lip;
  vec3 w = warp(p, lip);
  vec3 id = floor(w/S);
  vec3 q = w - (id + .5)*S;
  vec2 res = room(q, id);
  vec3 aq = abs(q);
  res.x = min(res.x, 12. - max(aq.x, max(aq.y, aq.z)) + 0.25);
  res.x /= lip;
  return res;
}
float mapS(vec3 p){ return map(p).x; }
vec3 fogCol(vec3 rd, int l){ return vec3(0.40, 0.34, 0.28) + vec3(0.1, 0.12, 0.16)*rd.y; }
float fogDen(int l){ return 0.017; }
vec3 skyD(vec3 rd){
  return skyGrad(rd, normalize(vec3(0.4, 0.5, -0.6)), vec3(0.12, 0.3, 0.68), vec3(0.7, 0.78, 0.88), vec3(1., 0.9, 0.7), 1.0);
}
vec3 sky(vec3 rd){ return fogCol(rd, 0); }

vec3 painting(vec2 uv, float s){
  vec3 top = 0.5 + 0.5*cos(TAU*(s + vec3(0., 0.33, 0.67)));
  vec3 c = mix(vec3(0.92, 0.78, 0.58), top*0.7, clamp(uv.y*0.5 + 0.5, 0., 1.));
  c += vec3(1., .9, .6)*smoothstep(0.22, 0.17, length(uv - vec2(0.35, 0.45)));
  float hill = -0.25 + 0.35*fbm2(vec2(uv.x*2. + s*10., s));
  if(uv.y < hill) c = mix(vec3(0.14, 0.18, 0.12), vec3(0.32, 0.26, 0.18), fbm2(uv*7. + s));
  // an impossible staircase in every painting
  vec2 st = uv - vec2(-0.35, -0.1);
  float stair = step(abs(st.x), 0.25)*step(st.y, -floor(st.x*8.)/8.*0.9)*step(-0.35, st.y);
  c = mix(c, vec3(0.85, 0.82, 0.78), stair*0.8);
  return c;
}
`,
shade: `
vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float t){
  float lip;
  vec3 w = warp(p, lip);
  vec3 id = floor(w/S);
  vec3 q = w - (id + .5)*S;
  vec3 aq = abs(q);
  vec3 r = roomR(q, id);
  vec3 alb = vec3(0.7); float spec = 0.05; vec3 emi = vec3(0.);
  if(m < 1.5){
    float mx = max(aq.x, max(aq.y, aq.z));
    vec2 fw = aq.x >= mx ? q.yz : (aq.y >= mx ? q.xz : q.xy);
    vec2 wq = abs(abs(fw) - 7.);
    if(mx > 11.4 && mx < 11.8 && max(wq.x, wq.y) < 2.05){
      // the window: a sky that turns with the room
      vec3 srd = permv(rd, hash13(id + 3.1));
      return skyD(srd)*0.85;
    }
    vec3 an = abs(n);
    vec2 uv = (an.x > an.y && an.x > an.z) ? q.zy : (an.y > an.z ? q.xz : q.xy);
    uv.x += step(1., mod(floor(uv.y/0.6), 2.))*0.6;
    vec2 g = abs(fract(uv/vec2(1.2, 0.6)) - 0.5);
    alb = vec3(0.70, 0.60, 0.48)*(0.78 + 0.3*fbm2(uv*0.7 + id.xy*7.));
    alb *= 1. - 0.18*smoothstep(0.45, 0.5, max(g.x, g.y));
    alb *= 0.8 + 0.2*smoothstep(-11., -6., -mx);
  } else if(m < 2.5){
    vec2 uv = abs(n.y) > 0.5 ? r.xz : r.xy;
    alb = vec3(0.42, 0.27, 0.16)*(0.75 + 0.4*noise2(vec2(uv.x*0.6, uv.y*14.)));
    spec = 0.2;
  } else if(m < 3.5){ alb = vec3(0.12, 0.08, 0.06); spec = 0.3; }
  else if(m < 4.5){
    alb = vec3(0.75, 0.56, 0.22); spec = 0.8;
    vec2 cu = vec2(10.);
    if(r.x < -10.7 && abs(r.y) < 1.75 && abs(abs(r.z) - 7.) < 1.25) cu = vec2((abs(r.z) - 7.)/1.25*sign(r.z), r.y/1.75);
    if(r.z < -10.7 && abs(r.y) < 1.75 && abs(abs(r.x) - 7.) < 1.25) cu = vec2((abs(r.x) - 7.)/1.25*sign(r.x), r.y/1.75);
    if(cu.x < 5.) return painting(cu, hash13(id + sign(r.x + r.z)*0.37))*0.9;
  } else { emi = vec3(1.0, 0.75, 0.45)*4.; alb = vec3(0.); }

  vec3 lp = (id + .5)*S - w;         // room-centre light (in warped space)
  float ld = length(lp);
  vec3 Ld = lp/ld;
  float ao = calcAO(p, n, 1.3);
  float sh = softShadow(p + n*0.03, Ld, 0.05, ld, 8.);
  float att = 90./(ld*ld + 20.);
  vec3 lin = clamp(dot(n, Ld), 0., 1.)*sh*att*vec3(1.0, 0.72, 0.45);
  lin += ao*vec3(0.20, 0.21, 0.24)*(0.7 + 0.3*n.y);
  lin += ao*0.12*vec3(0.5, 0.6, 0.8)*max(dot(n, normalize(vec3(0.4, 0.5, -0.6))), 0.);
  vec3 col = alb*lin + emi;
  col += spec*sh*att*pow(max(dot(n, normalize(Ld - rd)), 0.), 40.)*vec3(1., 0.8, 0.55)*0.6;
  return col;
}
`
};
