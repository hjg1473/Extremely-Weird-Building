// THE TOWER — every floor is a ring of real apartments you can walk into.
//   centre   : an atrium with four counter-rotating helical stairs that never end (a bridge on every floor)
//   ring 1   : the corridor, open to the atrium
//   ring 2   : 20 apartments per floor (living room, kitchen, balcony, a bedroom door...)
//   outside  : bridges every 224 m to half-scale copies of the tower, which sprout their own, recursively.
// Floors repeat forever up and down.
SHADERS.Tower = {
defs: `
const vec3  SUN_T = normalize(vec3(-0.55, 0.62, 0.42));
const float FH = 3.6;        // floor to floor
const float CH = 3.3;        // floor to ceiling
const float R_ATR = 26.5;    // atrium edge
const float SQ_IN = 30.;     // corridor | apartments
const float SQ_OUT = 42.;    // facade
const float UW = 12.;        // apartment width
float gWin;

int sideOf(vec3 p){ return abs(p.x) >= abs(p.z) ? (p.x > 0. ? 0 : 2) : (p.z > 0. ? 1 : 3); }
vec3 toSide(vec3 p, int s){ if(s == 0) return p; if(s == 1) return vec3(p.z, p.y, -p.x); if(s == 2) return vec3(-p.x, p.y, -p.z); return vec3(-p.z, p.y, p.x); }
vec3 fromSide(vec3 c, int s){ if(s == 0) return c; if(s == 1) return vec3(-c.z, c.y, c.x); if(s == 2) return vec3(-c.x, c.y, -c.z); return vec3(c.z, c.y, -c.x); }

// ---------- the atrium: endless stairs ----------
vec2 mapAtrium(vec3 p){
  float r = length(p.xz);
  if(r > 28.) return vec2(r - 26.95, 0.);   // conservative AND loose enough not to act as a wall for collisions
  float aB = atan(p.z, p.x);
  vec2 res = vec2(1e9, 0.);
  // a bridge from the outer stair to the corridor on every floor (each floor at its own angle)
  float n0 = floor(p.y/FH);
  float cutR = 1e9, cutP = 1e9;
  for(int j = ZERO; j < 2; j++){
    float n = n0 + float(j);
    vec2 bq = p.xz*rot(-TAU*n/5.);
    float ky = p.y - n*FH;
    res = opU(res, vec2(sdBox(vec3(bq.x - 24.6, ky + 0.15, bq.y), vec3(2.3, 0.15, 0.9)), 20.));
    res = opU(res, vec2(sdBox(vec3(bq.x - 24.4, ky - 0.5, abs(bq.y) - 0.9), vec3(2.0, 0.5, 0.05)), 21.));
    cutR = min(cutR, sdBox(vec3(bq.x - 22.25, ky - 1.1, bq.y), vec3(2.75, 1.15, 0.85)));
    cutP = min(cutP, sdBox(vec3(bq.x - 26.6, ky - 1.1, bq.y), vec3(1.6, 1.15, 0.85)));
  }
  for(int k = ZERO; k < 4; k++){
    float fk = float(k);
    float r0 = 2.6 + fk*5.2;
    float r1 = r0 + 3.0 + fk*0.4;
    float dr = max(r0 - r, r - r1);
    if(dr > res.x) continue;
    float P = 6. + fk*4.;
    float N = floor(P/0.2);
    float dir = mod(fk, 2.) < .5 ? 1. : -1.;
    float fa = aB*dir/TAU;
    float u = p.y - fa*P - (k == 3 ? 0. : fk*1.7);
    u = mod(u + .5*P, P) - .5*P;
    float sh = P/N;
    float fr = fract(fa*N);
    float top = sh*(1. - fr);
    float T = 0.55;
    float rc = max(r, r0);
    float cs = 1./sqrt(1. + pow(P/(TAU*rc), 2.));
    float dv = max(u - top, (-T - u)*cs);
    if(u > top && u < top + sh) dv = min(dv, (1. - fr)/N*TAU*rc + 0.02);
    res = opU(res, vec2(max(dv, dr), 20.));
    float pu = max(u - 1.0, -T - u)*cs;
    float par = max(min(abs(r - (r0 + 0.11)) - 0.11, abs(r - (r1 - 0.11)) - 0.11), pu);
    float rail = min(length(vec2(r - (r0 + 0.11), (u - 1.04)*cs)), length(vec2(r - (r1 - 0.11), (u - 1.04)*cs))) - 0.045;
    if(k == 3){ par = max(par, -cutR); rail = max(rail, -cutR); }
    res = opU(res, vec2(par, 21.));
    res = opU(res, vec2(rail, 22.));
  }
  // the atrium's edge on every floor: a parapet, opened where the bridge lands
  float fy = p.y - FH*floor(p.y/FH);
  float edge = max(abs(r - 26.65) - 0.15, max(fy - 1.1, -fy));
  edge = max(edge, -cutP);
  res = opU(res, vec2(edge, 41.));
  return res;
}

// ---------- apartments, corridor floors, facade ----------
vec2 mapFloors(vec3 p){
  int s = sideOf(p);
  vec3 c = toSide(p, s);
  float r = length(p.xz);
  float n = floor(p.y/FH), fy = p.y - n*FH;
  // floor slabs everywhere between atrium and facade (top surface at fy = 0)
  float ds = abs(p.y - FH*round((p.y + 0.15)/FH) + 0.15) - 0.15;
  vec2 res = vec2(max(max(ds, R_ATR - r), c.x - SQ_OUT), 40.);
  // corridor ceiling lights
  if(c.x < SQ_IN) res = opU(res, vec2(sdBox(vec3(c.x - 28.3, fy - 3.26, mod(c.z, 6.) - 3.), vec3(0.5, 0.04, 0.18)), 47.));
  if(c.x < 28.4) return opU(res, vec2(SQ_IN - c.x, 0.));

  float uz = clamp(round(c.z/UW), -2., 2.);
  float l = c.z - uz*UW;
  float d = c.x - SQ_IN;
  // the apartment ring is solid except for each apartment's air
  float band = max(abs(c.x - 36.) - 6., abs(c.z) - SQ_OUT);
  float air = 1e9;
  if(abs(c.z) < SQ_IN){
    air = sdBox(vec3(d - 6., fy - CH*.5, l), vec3(5.8, CH*.5, 5.85));
    air = min(air, sdBox(vec3(d, fy - 1.1, l - 4.), vec3(1.5, 1.1, 0.6)));                 // front door
    air = min(air, sdBox(vec3(d - 12., fy - 1.15, l), vec3(1.6, 1.15, 1.2)));             // balcony door
    air = min(air, sdBox(vec3(d - 12., fy - 1.7, abs(l) - 3.5), vec3(1.6, 0.8, 1.6)));    // windows
  }
  res = opU(res, vec2(max(band, -air), 40.));
  if(abs(c.z) < SQ_IN){
    // the bedroom: a closed box in the corner of every flat, its door on the side facing the kitchen
    float bed = sdBox(vec3(d - 2.35, fy - CH*.5, l + 4.95), vec3(2.15, CH*.5, 0.95));
    bed = max(bed, -sdBox(vec3(d - BED_D, fy - 1.1, l + 4.95), vec3(0.6, 1.1, 1.6)));
    res = opU(res, vec2(bed, 48.));
    // door frame
    float fr = max(sdBox(vec3(d - BED_D, fy - 1.15, l + 3.97), vec3(0.72, 1.17, 0.04)), -sdBox(vec3(d - BED_D, fy - 1.1, l + 3.97), vec3(0.6, 1.1, 1.)));
    res = opU(res, vec2(fr, 42.));
  }

  if(abs(c.z) < SQ_IN){
    // balconies (this floor and the one above)
    for(int j = ZERO; j < 2; j++){
      float f2 = fy - float(j)*FH;
      float b = sdBox(vec3(d - 12.8, f2 + 0.125, l), vec3(0.8, 0.125, 5.7));
      res = opU(res, vec2(b, 40.));
      float rl = sdBox(vec3(d - 13.55, f2 - 0.55, l), vec3(0.05, 0.55, 5.7));
      rl = min(rl, sdBox(vec3(d - 12.8, f2 - 0.55, abs(l) - 5.7), vec3(0.8, 0.55, 0.05)));
      rl = min(rl, sdBox(vec3(d - 13.55, f2 - 1.1, l), vec3(0.07, 0.04, 5.75)));
      res = opU(res, vec2(rl, 46.));
    }
    // furniture
    if(d > 0. && d < 12.){
      vec3 so = vec3(d - 7.2, fy, l);
      float sofa = sdBox(so - vec3(0., 0.25, 0.), vec3(0.45, 0.2, 1.4)) - 0.06;
      sofa = min(sofa, sdBox(so - vec3(-0.38, 0.62, 0.), vec3(0.12, 0.4, 1.4)) - 0.06);
      sofa = min(sofa, sdBox(vec3(so.x, so.y - 0.45, abs(so.z) - 1.42), vec3(0.45, 0.18, 0.12)) - 0.06);
      res = opU(res, vec2(sofa, 43.));
      vec3 t = vec3(d - 8.7, fy, l);
      float wood = sdBox(t - vec3(0., 0.42, 0.), vec3(0.4, 0.03, 0.75));
      wood = min(wood, sdBox(vec3(abs(t.x) - 0.33, t.y - 0.2, abs(t.z) - 0.66), vec3(0.03, 0.2, 0.03)));
      vec3 dt = vec3(d - 4.0, fy, l - 1.);
      wood = min(wood, sdBox(dt - vec3(0., 0.74, 0.), vec3(0.8, 0.03, 0.5)));
      wood = min(wood, sdBox(vec3(abs(dt.x) - 0.7, dt.y - 0.37, abs(dt.z) - 0.42), vec3(0.03, 0.37, 0.03)));
      wood = min(wood, sdBox(vec3(d - 6.3, fy - 0.46, l + 5.4), vec3(1.5, 0.46, 0.42)));      // kitchen counter
      vec3 b = vec3(d - 8.6, fy, l - 5.6);
      float shelf = max(sdBox(b - vec3(0., 1.1, 0.), vec3(1.5, 1.1, 0.25)),
                        -sdBox(vec3(b.x, mod(b.y, 0.55) - 0.3, b.z + 0.05), vec3(1.42, 0.22, 0.25)));
      wood = min(wood, shelf);
      res = opU(res, vec2(wood, 42.));
      vec3 bk = vec3(mod(b.x, 0.09) - 0.045, mod(b.y, 0.55) - 0.22, b.z);
      float books = max(sdBox(bk, vec3(0.035, 0.14 + 0.05*hash11(floor(b.x/0.09) + floor(b.y/0.55)*7.), 0.18)),
                        sdBox(b - vec3(0., 1.1, 0.), vec3(1.4, 1.05, 0.25)));
      res = opU(res, vec2(books, 44.));
      vec3 fl = vec3(d - 10.9, fy, l + 5.);
      res = opU(res, vec2(max(length(fl.xz) - 0.03, abs(fl.y - 0.8) - 0.8), 46.));
      res = opU(res, vec2(max(length(fl.xz) - 0.28 + (fl.y - 1.6)*0.6, abs(fl.y - 1.75) - 0.2), 45.));
      res = opU(res, vec2(sdBox(vec3(d - 6., fy - 3.26, l), vec3(0.35, 0.04, 0.35)), 45.));
    }
  } else if(c.x < SQ_OUT + 0.5){
    // corner cores: vertical fins
    res = opU(res, vec2(max(sdBox(vec3(c.x - 42.2, 0., mod(c.z, 2.) - 1.), vec3(0.2, 1e3, 0.12)), abs(c.z) - 41.8), 40.));
  }
  return res;
}

// ---------- the recursive towers (scene C, apartments at every scale) ----------
vec2 mapKids(vec3 pw){
  vec3 q = pw/TS;
  bool home = all(equal(floor((q.xz + 90.)/180.), vec2(0.)));
  q.xz = mod(q.xz + 90., 180.) - 90.;
  float sc = 1.;
  vec2 res = vec2(1e9, 0.);
  gWin = 0.;
  const vec2 CELL = vec2(UW/TS, FH/TS);    // one apartment in tower units
  for(int i = ZERO; i < 5; i++){
    float fi = float(i);
    float w = i == 0 ? 9. : 7.;
    float H = 26.;
    float cap = i == 0 ? -1e9 : abs(q.y) - H;
    vec2 aq = abs(q.xz);
    if(!(home && i == 0)){
      float shaft = sdBox2(q.xz, vec2(w));
      float body = max(shaft, cap);
      if(body < 1.){
        float fc = aq.x > aq.y ? q.z : q.x;
        vec2 cid = floor(vec2(fc, q.y)/CELL);
        vec2 wl = (vec2(fc, q.y) - (cid + .5)*CELL);
        float win = sdBox2(wl - vec2(0., 0.04), vec2(CELL.x*0.36, CELL.y*0.26));
        body = max(max(shaft, -max(win, -shaft - 0.15)), cap);
        float glass = max(max(shaft + 0.1, win), cap + 0.3);
        if(glass/sc < res.x){
          res = vec2(glass/sc, 5. + fi*0.1);
          float face = aq.x > aq.y ? sign(q.x) : 3.*sign(q.z);
          gWin = hash13(vec3(cid, fi*17. + face));
        }
        // a balcony slab on every floor
        float bal = max(max(sdBox2(q.xz, vec2(w + 0.12)), abs(mod(q.y, CELL.y) - 0.03) - 0.03), cap);
        body = min(body, bal);
      }
      res = opU(res, vec2(body/sc, 1. + fi*0.1));
      if(i > 0){
        float crown = min(sdBox(q - vec3(0., H + 0.3, 0.), vec3(w + 0.6, 0.3, w + 0.6)), sdBox(q - vec3(0., H + 1.6, 0.), vec3(w*0.55, 1.0, w*0.55)));
        crown = min(crown, sdBox(q - vec3(0., -H - 0.3, 0.), vec3(w + 0.4, 0.3, w + 0.4)));
        res = opU(res, vec2(crown/sc, 4. + fi*0.1));
      }
    }
    q.xz = abs(q.xz);
    if(q.x < q.z) q.xz = q.zx;
    q.y = i == 0 ? mod(q.y + 24., 48.) - 24. : q.y - clamp(round(q.y/18.), -1., 1.)*18.;
    float off = (i == 0 ? 50. : 26.) + 2.5*sin(uTime*0.03 + fi*1.9)*float(i > 0);   // the home tower keeps its neighbours at a distance
    float x0 = i == 0 ? w : 0.;
    vec3 bq = q - vec3((x0 + off)*.5, 0., 0.);
    float br = sdBox(bq, vec3((off - x0)*.5, 1.8, 2.4));
    if(br < 1.) br = max(br, -sdBox(vec3(mod(bq.x + 1.6, 3.2) - 1.6, bq.y, bq.z), vec3(1.1, 1.1, 3.)));
    float brace = sdBox(vec3(bq.x, bq.y + 3.4 + bq.x*0.25, bq.z), vec3((off - x0)*.4, 0.25, 0.3));
    res = opU(res, vec2(min(br, brace)/sc, 3. + fi*0.1));
    q -= vec3(off, 0., 0.);
    if(i > 0) q.xz *= rot(0.35*sin(uTime*0.02 + fi*1.3));
    q *= 2.; sc *= 2.;
  }
  res.x *= TS;
  return res;
}

vec2 mapTower(vec3 p){
  vec2 res = mapKids(p);
  res = opU(res, mapAtrium(p));
  res = opU(res, mapFloors(p));
  return res;
}
vec3 fogColT(vec3 rd){
  vec3 c = mix(vec3(0.17, 0.21, 0.27), vec3(0.55, 0.66, 0.82), smoothstep(-0.6, 0.7, rd.y));
  return c + vec3(1., .85, .6)*pow(max(dot(rd, SUN_T), 0.), 8.)*0.45;
}
`,
shade: `
vec3 unitTint(float h){ return mix(vec3(0.66, 0.58, 0.44), 0.55 + 0.25*cos(TAU*(h + vec3(0., 0.33, 0.67))), 0.35); }

vec3 shadeTower(vec3 p, vec3 n, vec3 rd, float m, float t, float ao, float sh){
  vec3 alb = vec3(0.7); float spec = 0.05; vec3 emi = vec3(0.);
  int s = sideOf(p);
  vec3 c = toSide(p, s);
  float fl = floor(p.y/FH), fy = p.y - fl*FH;
  float uz = clamp(round(c.z/UW), -2., 2.);
  float l = c.z - uz*UW, d = c.x - SQ_IN;
  bool inUnit = d > 0.05 && d < 11.95 && abs(c.z) < SQ_IN && abs(l) < 5.95;
  bool inCorr = d < 0.05 && length(p.xz) > R_ATR;
  float uh = hash13(vec3(fl, uz, float(s)));
  bool lampOn = uh > 0.25;

  if(m < 9.5){
    // the far towers: apartments as windows
    vec3 pc = p/TS;
    mapKids(p);
    float mid = floor(m + 0.001);
    if(mid == 1. || mid == 4.){ alb = vec3(0.86, 0.85, 0.82)*concreteTex(pc*4., n, 2.5); }
    else if(mid == 3.){ alb = vec3(0.55, 0.56, 0.58); spec = 0.4; }
    else {
      alb = vec3(0.03, 0.04, 0.05); spec = 1.;
      if(gWin > 0.55) emi = mix(vec3(1., 0.66, 0.34), vec3(0.75, 0.85, 1.), step(0.92, gWin))*1.6*(0.4 + gWin);
    }
  } else if(m < 22.5){
    alb = m < 21.5 ? vec3(0.8, 0.79, 0.77)*concreteTex(p, n, 2.) : vec3(0.16);
    if(m > 21.5) spec = 0.6;
  } else if(m < 40.5 || m > 47.5){
    if(inUnit){
      if(n.y > 0.6){
        vec2 uv = vec2(l, d*6.);
        uv.x += hash11(floor(uv.y))*3.;
        float seam = smoothstep(0.46, 0.5, abs(fract(uv.x*0.5) - 0.5)) + smoothstep(0.42, 0.5, abs(fract(uv.y) - 0.5));
        alb = vec3(0.45, 0.29, 0.17)*(0.75 + 0.35*noise2(vec2(uv.x*4.8, uv.y*0.3)))*(1. - 0.3*clamp(seam, 0., 1.));
        if(abs(d - 8.) < 2.2 && abs(l) < 2.) alb = (0.4 + 0.3*cos(TAU*(uh + vec3(0., 0.3, 0.6))))*(0.8 + 0.3*noise2(vec2(d, l)*20.));
        spec = 0.25;
      } else if(n.y < -0.6) alb = vec3(0.88, 0.87, 0.84);
      else {
        vec3 an = abs(n);
        float u = an.x > an.z ? p.z : p.x;
        float stripe = smoothstep(0.2, 0.25, abs(fract(u*3.) - 0.5));
        alb = unitTint(uh)*mix(0.9, 1.05, stripe);
        if(fy < 0.9) alb = vec3(0.42, 0.33, 0.24)*(fy > 0.86 ? 1.3 : 1.);
        if(fy < 0.1) alb = vec3(0.85);
      }
    } else if(inCorr){
      if(n.y > 0.6){ alb = vec3(0.35, 0.12, 0.1)*(0.8 + 0.3*noise2(p.xz*3.)); }
      else if(n.y < -0.6) alb = vec3(0.8);
      else {
        alb = vec3(0.78, 0.75, 0.68);
        // apartment numbers next to every front door
        if(abs(c.x - SQ_IN) < 0.05 && abs(l - 5.) < 0.25 && abs(fy - 1.6) < 0.12) alb = vec3(0.7, 0.55, 0.25);
      }
    } else {
      alb = vec3(0.84, 0.83, 0.8)*concreteTex(p, n, 2.);
      if(abs(fy) < 0.3 || fy > FH - 0.32) alb *= 0.9;
    }
  }
  else if(m < 41.5) alb = vec3(0.82, 0.81, 0.78)*concreteTex(p, n, 2.);
  else if(m < 42.5){ alb = vec3(0.38, 0.24, 0.14)*(0.8 + 0.3*noise2(vec2(c.x + c.z, p.y*12.))); spec = 0.2; }
  else if(m < 43.5) alb = (0.3 + 0.25*cos(TAU*(uh*1.7 + vec3(0.5, 0.2, 0.)))) *(0.85 + 0.2*noise2(p.xz*30.));
  else if(m < 44.5){ float h = hash12(floor(vec2((c.x)/0.09, p.y/0.55))); alb = mix(vec3(0.4, 0.33, 0.26), 0.35 + 0.25*cos(TAU*(h + vec3(0., 0.33, 0.67))), 0.6); }
  else if(m < 45.5){ return lampOn ? vec3(1.5, 1.2, 0.85) : vec3(0.25, 0.22, 0.2); }
  else if(m < 46.5){ alb = vec3(0.12); spec = 0.5; }
  else return vec3(1.3, 1.25, 1.1);

  float dif = clamp(dot(n, SUN_T), 0., 1.);
  vec3 lin = dif*sh*vec3(1.5, 1.32, 1.1)*1.6;
  float sky = (inUnit || inCorr) ? 0.25 : (m < 9.5 ? 1.6 : 1.);
  lin += (0.5 + 0.5*n.y)*ao*vec3(0.38, 0.46, 0.6)*sky;
  lin += clamp(dot(n, normalize(vec3(-SUN_T.x, 0., -SUN_T.z))), 0., 1.)*ao*vec3(0.25, 0.22, 0.2)*0.6*sky;
  if(inUnit){
    if(lampOn){
      vec3 L = fromSide(vec3(SQ_IN + 6., fl*FH + 3.0, uz*UW), s);
      vec3 lv = L - p; float ld = length(lv); lv /= ld;
      lin += clamp(dot(n, lv), 0., 1.)*(0.35 + 0.65*ao)*12./(ld*ld + 3.)*vec3(1.3, 1.0, 0.7);
    }
    lin += ao*vec3(0.16, 0.14, 0.12);
    // daylight through the facade
    lin += ao*vec3(0.25, 0.3, 0.38)*smoothstep(4., 11.5, d)*0.6;
  }
  if(inCorr){
    float cl = 1. - smoothstep(0., 3., abs(mod(c.z, 6.) - 3.));
    lin += ao*vec3(0.9, 0.85, 0.75)*(0.25 + 0.5*cl)*(0.4 + 0.6*clamp(-n.y*0.5 + 0.5, 0., 1.));
  }
  vec3 col = alb*lin + emi;
  col += spec*sh*pow(max(dot(n, normalize(SUN_T - rd)), 0.), 40.)*0.6;
  if(m > 4.5 && m < 9.5) col += spec*pow(1. - max(dot(n, -rd), 0.), 4.)*fogColT(reflect(rd, n))*0.6;
  return col;
}
`
};
