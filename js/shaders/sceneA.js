// A. ENDLESS STAIRWELL — nested counter-rotating helical stairs in an infinite shaft,
// repeated as a lattice of wells stacked inside a megastructure.
SHADERS.A = {
defs: `
#define MAXSTEPS 160
#define STEPK 0.7
#define MAXD 420.
#define SHSTEPS 40
const float CELL = 64.;
const vec3 SUN = normalize(vec3(0.25, 1.0, 0.18));

vec2 map(vec3 p){
  vec2 c = mod(p.xz + CELL*.5, CELL) - CELL*.5;
  vec3 q = vec3(c.x, p.y, c.y);
  float r = length(q.xz);
  float aB = atan(q.z, q.x);
  vec2 res = vec2(1e9, 0.);

  for(int k = 0; k < 4; k++){
    float fk = float(k);
    float r0 = 2.6 + fk*5.2;
    float r1 = r0 + 3.0 + fk*0.4;
    float dr = max(r0 - r, r - r1);
    if(dr > res.x) continue;
    float P = 6. + fk*4.;
    float N = floor(P/0.2);
    float dir = mod(fk, 2.) < .5 ? 1. : -1.;
    float a = (aB + uTime*0.02*dir*(1. + fk*.35))*dir;
    float fa = a/TAU;
    float u = q.y - fa*P - fk*1.7;
    u = mod(u + .5*P, P) - .5*P;
    float sh = P/N;
    float fr = fract(fa*N);
    float top = sh*(1. - fr);
    float T = 0.55;
    float rc = max(r, r0);
    float cs = 1./sqrt(1. + pow(P/(TAU*rc), 2.));
    float dv = max(u - top, (-T - u)*cs);
    if(u > top && u < top + sh) dv = min(dv, (1. - fr)/N*TAU*rc + 0.02);
    res = opU(res, vec2(max(dv, dr), 1.));
    // parapets on both edges, following the ramp line
    float pu = max(u - 1.0, -T - u)*cs;
    float rin = abs(r - (r0 + 0.11)) - 0.11, rout = abs(r - (r1 - 0.11)) - 0.11;
    res = opU(res, vec2(max(min(rin, rout), pu), 2.));
    float rail = min(length(vec2(r - (r0 + 0.11), (u - 1.04)*cs)),
                     length(vec2(r - (r1 - 0.11), (u - 1.04)*cs))) - 0.045;
    res = opU(res, vec2(rail, 3.));
  }

  // 20-sided shaft wall with tall openings
  float seg = TAU/20.;
  float aw = mod(aB + seg*.5, seg) - seg*.5;
  float rp = r*cos(aw), tx = r*sin(aw);
  float wall = abs(rp - 25.8) - 0.7;
  vec2 wq = vec2(tx, mod(q.y, 10.5) - 5.25);
  wall = max(wall, -sdBox2(wq, vec2(2.3, 3.6)));
  res = opU(res, vec2(wall, 4.));
  // megastructure floors between wells
  float slab = max(abs(mod(q.y + 10.5, 21.) - 10.5) - 0.6, 26.4 - rp);
  res = opU(res, vec2(slab, 5.));
  // piers at well corners
  res = opU(res, vec2(length(abs(c) - vec2(32.)) - 5., 4.));
  return res;
}
float mapS(vec3 p){ return map(p).x; }
vec3 fogCol(vec3 rd, int l){
  vec3 c = mix(vec3(0.13, 0.14, 0.16), vec3(0.88, 0.9, 0.93), smoothstep(-0.75, 0.9, rd.y));
  return c + vec3(1., .95, .85)*pow(max(dot(rd, SUN), 0.), 6.)*0.25;
}
float fogDen(int l){ return 0.011; }
vec3 sky(vec3 rd){ return fogCol(rd, 0); }
`,
shade: `
vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float t){
  bool metal = m > 2.5 && m < 3.5;
  vec3 alb = vec3(0.80, 0.79, 0.77);
  if(metal) alb = vec3(0.16, 0.17, 0.18);
  else if(m > 3.5) alb = vec3(0.70, 0.70, 0.69);
  if(!metal) alb *= concreteTex(p, n, 2.0);
  float ao = calcAO(p, n, 1.4);
  float sh = softShadow(p + n*0.03, SUN, 0.05, 70., 10.);
  float dif = clamp(dot(n, SUN), 0., 1.);
  float hem = 0.5 + 0.5*n.y;
  vec3 lin = dif*sh*vec3(1.35, 1.25, 1.1)*1.7;
  lin += hem*ao*vec3(0.42, 0.46, 0.54)*0.85;
  lin += clamp(dot(n, normalize(vec3(-SUN.x, 0., -SUN.z))), 0., 1.)*ao*vec3(0.3, 0.27, 0.24)*0.45;
  lin += clamp(-n.y, 0., 1.)*ao*vec3(0.12, 0.12, 0.13);
  vec3 col = alb*lin;
  if(metal){ vec3 hh = normalize(SUN - rd); col += sh*pow(max(dot(n, hh), 0.), 60.)*0.9; }
  return col;
}
`
};
