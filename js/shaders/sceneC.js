// C. RECURSIVE TOWER — every tower sprouts four half-scale towers on bridges, which sprout
// their own, five generations deep, repeated forever in every direction. Offsets breathe over time.
SHADERS.C = {
defs: `
#define MAXSTEPS 190
#define STEPK 0.72
#define MAXD 900.
#define SHSTEPS 32
const vec3 SUN = normalize(vec3(-0.55, 0.62, 0.42));
float gWin;

vec2 map(vec3 p){
  vec3 q = p;
  q.xz = mod(q.xz + 90., 180.) - 90.;
  float sc = 1.;
  vec2 res = vec2(1e9, 0.);
  gWin = 0.;
  for(int i = 0; i < 5; i++){
    float fi = float(i);
    float w = i == 0 ? 9. : 7.;
    float H = 26.;                       // half height of every child tower (local units)
    float cap = i == 0 ? -1e9 : abs(q.y) - H;
    vec2 aq = abs(q.xz);
    float shaft = sdBox2(q.xz, vec2(w));
    float body = max(shaft, cap);
    if(body < 1.5){
      float fc = aq.x > aq.y ? q.z : q.x;
      vec2 cellId = vec2(floor((fc + 1.)/2.), floor((q.y + 2.)/4.));
      vec2 wl = vec2(mod(fc + 1., 2.) - 1., mod(q.y + 2., 4.) - 2.);
      float win = sdBox2(wl, vec2(0.55, 1.15));
      body = max(max(shaft, -max(win, -shaft - 0.4)), cap);
      float glass = max(max(shaft + 0.3, win), cap + 0.5);
      if(glass/sc < res.x){
        res = vec2(glass/sc, 5. + fi*0.1);
        float face = aq.x > aq.y ? sign(q.x) : 3.*sign(q.z);
        gWin = hash13(vec3(cellId, fi*17. + face + 40.*floor(p.y/48.)));
      }
    }
    res = opU(res, vec2(body/sc, 1. + fi*0.1));
    float ledge = max(max(sdBox2(q.xz, vec2(w + 0.3)), abs(mod(q.y + 6., 12.) - 6.) - 0.28), cap - 0.3);
    if(i > 0){
      // roof slab, crown and a mast on every child tower
      ledge = min(ledge, sdBox(q - vec3(0., H + 0.3, 0.), vec3(w + 0.6, 0.3, w + 0.6)));
      ledge = min(ledge, sdBox(q - vec3(0., H + 1.6, 0.), vec3(w*0.55, 1.0, w*0.55)));
      ledge = min(ledge, sdBox(q - vec3(0., -H - 0.3, 0.), vec3(w + 0.4, 0.3, w + 0.4)));
    }
    res = opU(res, vec2(ledge/sc, 4. + fi*0.1));
    if(i < 3){
      float pipe = max(length(aq - vec2(w + 0.75)) - 0.42, cap);
      if(i > 0) pipe = min(pipe, max(length(q.xz) - 0.25, abs(q.y - H - 7.) - 5.));
      res = opU(res, vec2(pipe/sc, 2. + fi*0.1));
    }

    // fold into one quadrant: four children per tower
    q.xz = abs(q.xz);
    if(q.x < q.z) q.xz = q.zx;
    q.y = i == 0 ? mod(q.y + 24., 48.) - 24. : q.y - clamp(round(q.y/18.), -1., 1.)*18.;
    float off = (i == 0 ? 30. : 26.) + 2.5*sin(uTime*0.06 + fi*1.9);
    vec3 bq = q - vec3(off*.5, 0., 0.);
    float br = sdBox(bq, vec3(off*.5, 1.8, 2.4));
    if(br < 1.) br = max(br, -sdBox(vec3(mod(bq.x + 1.6, 3.2) - 1.6, bq.y, bq.z), vec3(1.1, 1.1, 3.)));
    float brace = sdBox(vec3(bq.x, bq.y + 3.4 + bq.x*0.25, bq.z), vec3(off*.4, 0.25, 0.3));
    res = opU(res, vec2(min(br, brace)/sc, 3. + fi*0.1));
    q -= vec3(off, 0., 0.);
    q.xz *= rot(0.35*sin(uTime*0.04 + fi*1.3));
    q *= 2.; sc *= 2.;
  }
  return res;
}
float mapS(vec3 p){ return map(p).x; }
vec3 fogCol(vec3 rd, int l){
  vec3 c = mix(vec3(0.17, 0.21, 0.27), vec3(0.55, 0.66, 0.82), smoothstep(-0.6, 0.7, rd.y));
  return c + vec3(1., .85, .6)*pow(max(dot(rd, SUN), 0.), 8.)*0.45;
}
float fogDen(int l){ return 0.0030; }
vec3 sky(vec3 rd){ return fogCol(rd, 0); }
`,
shade: `
vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float t){
  map(p);
  float mid = floor(m + 0.001);
  float lev = floor(fract(m)*10. + 0.5);
  vec3 alb; float spec = 0.1; vec3 emi = vec3(0.);
  vec3 pal = 0.62 + 0.3*cos(TAU*(lev*0.19 + vec3(0.0, 0.12, 0.25)));
  if(mid == 1.){ alb = mix(vec3(0.82, 0.81, 0.78), pal, 0.35)*concreteTex(p, n, 2.5); }
  else if(mid == 2.){ alb = mod(lev, 2.) < .5 ? vec3(0.78, 0.3, 0.12) : vec3(0.18, 0.5, 0.52); spec = 0.5; }
  else if(mid == 3.){ alb = vec3(0.33, 0.35, 0.38); spec = 0.4; }
  else if(mid == 4.){ alb = vec3(0.9, 0.89, 0.86); }
  else {
    alb = vec3(0.02, 0.03, 0.04); spec = 1.;
    if(gWin > 0.82) emi = mix(vec3(1., 0.62, 0.3), vec3(0.6, 0.85, 1.), step(0.93, gWin))*2.6*(gWin - 0.7);
  }
  float ao = calcAO(p, n, 1.8);
  float sh = softShadow(p + n*0.04, SUN, 0.05, 90., 9.);
  float dif = clamp(dot(n, SUN), 0., 1.);
  vec3 lin = dif*sh*vec3(1.5, 1.32, 1.1)*1.6;
  lin += (0.5 + 0.5*n.y)*ao*vec3(0.38, 0.46, 0.6);
  lin += clamp(dot(n, normalize(vec3(-SUN.x, 0., -SUN.z))), 0., 1.)*ao*vec3(0.25, 0.22, 0.2)*0.6;
  vec3 col = alb*lin + emi;
  vec3 hh = normalize(SUN - rd);
  col += spec*sh*pow(max(dot(n, hh), 0.), 40.)*0.7;
  float fre = pow(1. - max(dot(n, -rd), 0.), 4.);
  col += spec*fre*fogCol(reflect(rd, n), 0)*0.5*ao;
  return col;
}
`
};
