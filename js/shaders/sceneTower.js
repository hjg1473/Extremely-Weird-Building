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


// ---------- fluorescent tubes: most hum along, some stutter, some are dead ----------
float fixtureHash(float id){
  uint h=uint(int(id));
  h^=h>>16; h*=0x7feb352du; h^=h>>15; h*=0x846ca68bu; h^=h>>16;
  return float(h & 0x00ffffffu)/16777216.;
}
float flick(float id){
  float h = fixtureHash(id);
  float t = uTime;
  float f;
  if(h < 0.1) f = 0.;
  else if(h < 0.4){
    float burst=fixtureHash(floor(t*.7)+id*131.);
    f=burst>.45 ? step(.48,fixtureHash(floor(t*17.)+id*67.)) : 1.;
  } else f = 1.;
  // now and then the whole building browns out (driven from JS, e.g. while the voice speaks)
  float dip = uDip*step(0.45, hash11(floor(t*16.) + id*0.7 + 3.));
  float restart=smoothstep(h*.65+.01,h*.65+.3,uSupply);
  return f*(1. - dip*0.92)*restart;
}

// ---------- lounges: every 12 floors, three storeys are one great room ----------
bool isLounge(float n){ float L = mod(n, 12.); return L > 2.5 && L < 5.5; }
float loungeBase(float n){ return n - (mod(n, 12.) - 3.); }
float loungeType(float nb, int s, float zc){ return floor(hash13(vec3(nb*0.37, float(s) + 0.5, zc*0.11 + 3.))*5.); }

vec2 mapLounge(vec3 p, vec3 c, int s, float nb, float r){
  float LH = 3.*FH;
  float ly = p.y - nb*FH;
  vec2 res = vec2(1e9, 0.);
  float slab = max(min(abs(ly + 0.15) - 0.15, abs(ly - LH + 0.15) - 0.15), max(R_ATR - r, c.x - SQ_OUT - 0.3));
  res = opU(res, vec2(slab, 50.));
  // galleries around the atrium on the two upper levels
  float gal = max(min(abs(ly - FH + 0.12) - 0.12, abs(ly - 2.*FH + 0.12) - 0.12), max(R_ATR - r, r - 30.5));
  res = opU(res, vec2(gal, 58.));
  res = opU(res, vec2(max(abs(r - 30.42) - 0.05, min(abs(ly - FH - 0.5) - 0.5, abs(ly - 2.*FH - 0.5) - 0.5)), 53.));
  // facade of tall arches (one of them a round window)
  float zc = clamp(round(c.z/14.), -2., 2.)*14.;
  float dz = c.z - zc;
  bool ring = (s == 2 && zc == 0.);
  float arch = ring ? length(vec2(dz, ly - 5.4)) - 4.8
                    : min(sdBox2(vec2(dz, ly - 2.5), vec2(5.5, 2.6)), length(vec2(dz, ly - 5.)) - 5.5);
  float wall = max(abs(c.x - 41.8) - 0.4, abs(c.z) - 42.2);
  wall = max(wall, -max(arch, abs(c.x - 41.8) - 3.));
  res = opU(res, vec2(wall, 58.));
  if(!ring) res = opU(res, vec2(sdBox(vec3(c.x - 41.75, ly - 0.5, dz), vec3(0.1, 0.5, 5.5)), 53.));
  // bookcases up the piers between the arches
  float bk = max(sdBox(vec3(c.x - 41.0, ly - 4., dz), vec3(0.4, 4., 7.)), 5.8 - abs(dz));
  if(bk < 0.6){
    float cut = sdBox(vec3(c.x - 40.65, mod(ly, 0.6) - 0.32, dz), vec3(0.4, 0.25, 9.));
    float books = max(sdBox(vec3(c.x - 40.95, mod(ly, 0.6) - 0.24, mod(c.z, 0.1) - 0.05), vec3(0.3, 0.13 + 0.05*hash11(floor(c.z/0.1) + floor(ly/0.6)*9.), 0.04)), bk);
    res = opU(res, vec2(max(bk, -max(cut, 5.9 - abs(dz))), 52.));
    res = opU(res, vec2(books, 56.));
  } else res = opU(res, vec2(bk, 52.));
  // fluted columns with planters
  if(abs(c.z) < 36.){
    float cq = c.z - 14.*round((c.z - 7.)/14.) - 7.;
    vec2 cp = vec2(c.x - 34., cq);
    float col = max(length(cp) - 0.5 - 0.04*cos(atan(cp.y, cp.x)*16.), abs(ly - LH*.5) - LH*.5);
    col = min(col, sdBox(vec3(cp.x, ly - 0.25, cp.y), vec3(0.75, 0.25, 0.75)));
    col = min(col, sdBox(vec3(cp.x, ly - LH + 0.4, cp.y), vec3(0.8, 0.4, 0.8)));
    res = opU(res, vec2(col*0.9, 58.));
    vec3 pq = vec3(cp.x + 1.4, ly, cp.y);
    res = opU(res, vec2(max(length(pq.xz) - 0.45, abs(ly - 0.35) - 0.35), 52.));
    float fol = length(vec3(pq.x, (ly - 1.6)*0.8, pq.z)) - 0.9 + 0.12*sin(pq.x*9.)*sin(ly*8.)*sin(pq.z*9.);
    res = opU(res, vec2(fol*0.7, 57.));
  }
  // something furnished in front of every arch
  if(abs(c.z) < 35.){
    float tp = loungeType(nb, s, zc);
    vec3 q = vec3(c.x - 37., ly, dz);
    res = opU(res, vec2(length(q - vec3(0., 6.6, 0.)) - 0.55, 54.));
    res = opU(res, vec2(max(length(q.xz) - 0.02, abs(ly - 8.7) - 2.), 53.));
    if(tp < 2.5){
      res = opU(res, vec2(max(length(q.xz) - 0.75, abs(ly - 0.22) - 0.22) - 0.02, 52.));
      vec3 a = vec3(abs(q.x) - 1.9, ly, q.z);
      float sofa = sdBox(a - vec3(0., 0.25, 0.), vec3(0.5, 0.2, 1.3)) - 0.08;
      sofa = min(sofa, sdBox(a - vec3(0.42, 0.62, 0.), vec3(0.12, 0.4, 1.3)) - 0.08);
      vec3 b = vec3(q.x, ly, q.z + 2.2);
      sofa = min(sofa, sdBox(b - vec3(0., 0.25, 0.), vec3(1.1, 0.2, 0.45)) - 0.08);
      sofa = min(sofa, sdBox(b - vec3(0., 0.62, -0.38), vec3(1.1, 0.4, 0.12)) - 0.08);
      res = opU(res, vec2(sofa, 51.));
      vec3 fl = vec3(q.x - 2.2, ly, q.z - 2.3);
      res = opU(res, vec2(max(length(fl.xz) - 0.03, abs(ly - 0.8) - 0.8), 53.));
      res = opU(res, vec2(max(length(fl.xz) - 0.3 + (ly - 1.6)*0.5, abs(ly - 1.75) - 0.22), 54.));
    } else if(tp < 3.5){
      vec3 g = q;
      float body = sdBox(g - vec3(0., 0.9, 0.), vec3(0.75, 0.16, 1.1)) - 0.04;
      body = min(body, max(length(vec2(abs(g.x) - 0.55, abs(g.z) - 0.85)) - 0.07, abs(ly - 0.4) - 0.4));
      body = min(body, sdBox(vec3(g.x - 0.1, ly - 1.1 - (0.75 - g.x)*0.55, g.z), vec3(0.75, 0.02, 1.05))*0.8);
      body = min(body, sdBox(g - vec3(0., 0.45, 1.6), vec3(0.5, 0.06, 0.2)));
      res = opU(res, vec2(body, 55.));
    } else {
      vec3 a = q - vec3(0.5, 0., 0.3);
      float ch = sdBox(a - vec3(0., 0.3, 0.), vec3(0.5, 0.18, 0.5)) - 0.08;
      ch = min(ch, sdBox(a - vec3(-0.4, 0.75, 0.), vec3(0.1, 0.45, 0.5)) - 0.08);
      ch = min(ch, sdBox(vec3(a.x, ly - 0.55, abs(a.z) - 0.5), vec3(0.45, 0.12, 0.08)) - 0.06);
      res = opU(res, vec2(ch, 51.));
    }
  }
  return res;
}

// ---------- apartments, corridor floors, facade ----------
vec2 mapFloors(vec3 p){
  int s = sideOf(p);
  vec3 c = toSide(p, s);
  float r = length(p.xz);
  float n = floor(p.y/FH), fy = p.y - n*FH;
  if(isLounge(n)) return mapLounge(p, c, s, loungeBase(n), r);
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


vec3 shadeLounge(vec3 p, vec3 n, vec3 rd, float m, vec3 c, int s, float nb, float ao, float sh){
  float ly = p.y - nb*FH;
  float zc = clamp(round(c.z/14.), -2., 2.)*14.;
  float dz = c.z - zc;
  float tp = loungeType(nb, s, zc);
  vec3 q = vec3(c.x - 37., ly, dz);
  vec3 alb = vec3(0.7); float spec = 0.05;
  if(m < 50.5){
    if(n.y > 0.6){
      if(tp > 3.5 && abs(dz) < 6. && c.x > 32.5 && c.x < 41.3 && abs(c.z) < 35.){
        // still water: the room again, upside down and darker
        vec3 rf = reflect(rd, n);
        float fre = 0.04 + 0.96*pow(1. - max(dot(n, -rd), 0.), 5.);
        vec3 col = vec3(0.01, 0.025, 0.03) + fogColT(rf)*fre*0.7*sh;
        vec3 L = fromSide(vec3(37., nb*FH + 6.6, zc), s);
        col += vec3(1., 0.7, 0.4)*pow(max(dot(rf, normalize(L - p)), 0.), 300.)*3.*uSupply;
        col += vec3(0.04, 0.03, 0.02)*(0.5 + 0.5*sin(dot(p.xz, vec2(3., 2.)) + uTime*0.7));
        return col;
      }
      vec2 g = floor(p.xz/1.2);
      alb = mix(vec3(0.46, 0.4, 0.33), vec3(0.11, 0.08, 0.06), mod(g.x + g.y, 2.));
      alb *= 0.8 + 0.3*fbm2(p.xz*0.7);
      spec = 0.8;
      if(tp < 2.5 && abs(q.x) < 2.7 && abs(q.z) < 3.3 && abs(c.z) < 35.){
        vec2 rq = abs(vec2(q.x/2.7, q.z/3.3));
        float border = step(0.86, max(rq.x, rq.y));
        alb = mix(vec3(0.42, 0.08, 0.06), vec3(0.75, 0.55, 0.25), border*0.7);
        alb *= 0.8 + 0.3*noise2(q.xz*6.) + 0.15*sin(length(q.xz)*9.);
        spec = 0.02;
      }
    } else alb = vec3(0.16, 0.11, 0.07)*(1. - 0.4*step(0.45, max(abs(fract(p.x/3.) - .5), abs(fract(p.z/3.) - .5))));
  }
  else if(m < 51.5){ float h = hash13(vec3(nb, float(s), zc)); alb = h < 0.4 ? vec3(0.45, 0.06, 0.07) : h < 0.75 ? vec3(0.82, 0.78, 0.7) : vec3(0.08, 0.25, 0.27); alb *= 0.85 + 0.2*noise2(p.xz*25.); }
  else if(m < 52.5){ alb = vec3(0.24, 0.14, 0.08)*(0.8 + 0.3*noise2(vec2(p.x + p.z, p.y*14.))); spec = 0.25; }
  else if(m < 53.5){ alb = vec3(0.55, 0.4, 0.18); spec = 0.9; }
  else if(m < 54.5) return vec3(.025)+vec3(2.0, 1.45, 0.8)*flick(nb*31.+float(s)*7.+zc);
  else if(m < 55.5){ alb = vec3(0.012); spec = 1.2; }
  else if(m < 56.5){ float h = hash12(floor(vec2(c.z/0.1, ly/0.6))); alb = mix(vec3(0.35, 0.22, 0.14), 0.3 + 0.25*cos(TAU*(h + vec3(0., 0.33, 0.67))), 0.5); }
  else if(m < 57.5) alb = vec3(0.16, 0.3, 0.12)*(0.6 + 0.6*noise2(p.xy*6.));
  else alb = vec3(0.6, 0.53, 0.44)*concreteTex(p, n, 2.);

  vec3 lin = clamp(dot(n, SUN_T), 0., 1.)*sh*vec3(1.2, 1.1, 1.0)*0.4;
  lin += (0.5 + 0.5*n.y)*ao*vec3(0.3, 0.36, 0.48)*0.12;
  lin += ao*vec3(0.06, 0.04, 0.025);
  // the nearest pendant globe and floor lamp
  vec3 L = fromSide(vec3(37., nb*FH + 6.6, zc), s);
  vec3 lv = L - p; float ld = length(lv); lv /= ld;
  lin += clamp(dot(n, lv), 0., 1.)*(0.4 + 0.6*ao)*14./(ld*ld + 2.)*vec3(1.3, 0.85, 0.45)*flick(nb*31.+float(s)*7.+zc);
  if(tp < 2.5){
    vec3 F = fromSide(vec3(39.2, nb*FH + 1.75, zc + 2.3), s);
    vec3 fv = F - p; float fd = length(fv); fv /= fd;
    lin += clamp(dot(n, fv), 0., 1.)*(0.4 + 0.6*ao)*2.2/(fd*fd + 0.3)*vec3(1.3, 0.85, 0.45)*uSupply;
  }
  vec3 col = alb*lin;
  col += spec*pow(max(dot(reflect(rd, n), lv), 0.), 40.)*vec3(1., 0.7, 0.4)*2.5*ao*uSupply;
  col += spec*pow(1. - max(dot(n, -rd), 0.), 5.)*fogColT(reflect(rd, n))*0.25*ao;
  col += spec*sh*pow(max(dot(n, normalize(SUN_T - rd)), 0.), 40.)*0.4;
  return col;
}

vec3 shadeTower(vec3 p, vec3 n, vec3 rd, float m, float t, float ao, float sh){
  if(m>59.5) return shadeGallery(p,n,rd,m,ao,sh);
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
  float lampF = flick(uh*977.);
  float rr = length(p.xz);
  bool inLounge = isLounge(fl) && rr > R_ATR - 0.1 && c.x < SQ_OUT + 0.5 && m > 47.5;
  if(isLounge(fl)){ inUnit = false; inCorr = false; }
  float corrF = flick(fl*37. + float(s)*7. + floor(c.z/6.));
  if(inLounge) return shadeLounge(p, n, rd, m, c, s, loungeBase(fl), ao, sh);

  if(m < 9.5){
    // the far towers: apartments as windows
    vec3 pc = p/TS;
    mapKids(p);
    float mid = floor(m + 0.001);
    if(mid == 1. || mid == 4.){ alb = vec3(0.86, 0.85, 0.82)*concreteTex(pc*4., n, 2.5); }
    else if(mid == 3.){ alb = vec3(0.55, 0.56, 0.58); spec = 0.4; }
    else {
      alb = vec3(0.03, 0.04, 0.05); spec = 1.;
      if(gWin > 0.55) emi = mix(vec3(1., 0.66, 0.34), vec3(0.75, 0.85, 1.), step(0.92, gWin))*1.6*(0.4 + gWin)*uSupply;
    }
  } else if(m < 22.5){
    alb = m < 21.5 ? vec3(0.8, 0.79, 0.77)*concreteTex(p, n, 2.) : vec3(0.16);
    if(m > 21.5) spec = 0.6;
  } else if(m < 40.5 || (m > 47.5 && m < 48.5)){
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
  else if(m < 45.5){ return lampOn ? mix(vec3(0.025), vec3(1.5, 1.2, 0.85), lampF) : vec3(0.025); }
  else if(m < 46.5){ alb = vec3(0.12); spec = 0.5; }
  else if(m < 47.5) return mix(vec3(0.06), vec3(1.2, 1.3, 1.28), corrF);

  float dif = clamp(dot(n, SUN_T), 0., 1.);
  vec3 lin = dif*sh*vec3(1.5, 1.32, 1.1)*1.6;
  float sky = (inUnit || inCorr) ? 0.25 : (m < 9.5 ? 1.6 : 1.);
  lin += (0.5 + 0.5*n.y)*ao*vec3(0.38, 0.46, 0.6)*sky;
  lin += clamp(dot(n, normalize(vec3(-SUN_T.x, 0., -SUN_T.z))), 0., 1.)*ao*vec3(0.25, 0.22, 0.2)*0.6*sky;
  if(inUnit){
    if(lampOn){
      vec3 L = fromSide(vec3(SQ_IN + 6., fl*FH + 3.0, uz*UW), s);
      vec3 lv = L - p; float ld = length(lv); lv /= ld;
      lin += clamp(dot(n, lv), 0., 1.)*(0.35 + 0.65*ao)*12./(ld*ld + 3.)*vec3(1.3, 1.0, 0.7)*lampF;
    }
    lin += ao*vec3(0.16, 0.14, 0.12);
    // daylight through the facade
    lin += ao*vec3(0.25, 0.3, 0.38)*smoothstep(4., 11.5, d)*0.6;
  }
  if(inCorr){
    float cl = 1. - smoothstep(0., 3., abs(mod(c.z, 6.) - 3.));
    lin += ao*vec3(0.82, 0.88, 0.86)*(0.08 + (0.17 + 0.5*cl)*corrF)*(0.4 + 0.6*clamp(-n.y*0.5 + 0.5, 0., 1.));
  }
  vec3 col = alb*lin + emi;
  col += spec*sh*pow(max(dot(n, normalize(SUN_T - rd)), 0.), 40.)*0.6;
  if(m > 4.5 && m < 9.5) col += spec*pow(1. - max(dot(n, -rd), 0.), 4.)*fogColT(reflect(rd, n))*0.6;
  return col;
}
`
};
