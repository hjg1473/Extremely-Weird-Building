// B. LARGER INSIDE — a 6 m cube on a salt plain. Its door is a portal into a space scaled ×30:
// a colossal colonnaded hall that contains the same cube again, recursively, forever.
// Rays (and the camera) change coordinate frames when they cross a door plane.
SHADERS.B = {
defs: `
#define PORTALS
#define MAXSTEPS 220
#define STEPK 0.85
#define MAXD 60000.
#define SHSTEPS 32
const float KSC = 30.;        // interior scale factor per level
const float SH  = 3.;         // cube half size
const float DW  = 0.8;        // door half width
const float DH  = 2.4;        // door height
const vec3  C0  = vec3(0., 3., 0.);          // cube centre on the plain (level 0)
const vec3  C1  = vec3(0., -SH*KSC + SH, 0.); // cube centre inside every hall (level >= 1)
const vec3  SUN0 = normalize(vec3(-0.72, 0.2, 0.32));
const vec3  SUN1 = normalize(vec3(0.32, 0.55, -0.75));
float gMat;

float cubeSDF(vec3 q){
  float b = sdBox(q, vec3(SH - 0.02)) - 0.02;
  float hole = sdBox(q - vec3(0., -SH + DH*.5, SH), vec3(DW, DH*.5, 0.45));
  b = max(b, -hole);
  float corn = sdBox(q - vec3(0., SH - 0.15, 0.), vec3(SH + 0.08, 0.15, SH + 0.08));
  float frame = max(sdBox(q - vec3(0., -SH + DH*.5 + 0.09, SH + 0.03), vec3(DW + 0.18, DH*.5 + 0.09, 0.06)),
                    -sdBox2(q.xy - vec2(0., -SH + DH*.5), vec2(DW, DH*.5)));
  return min(min(b, corn), frame);
}

vec2 mapExt(vec3 p){
  vec2 res = vec2(p.y, 1.);
  res = opU(res, vec2(cubeSDF(p - C0), 2.));
  // processional obelisks leading to the door
  vec3 o = p; o.x = abs(o.x) - 4.; o.z -= clamp(round(o.z/6.), 2., 9.)*6.;
  res = opU(res, vec2(sdBox(o - vec3(0., 1.3, 0.), vec3(0.22, 1.3, 0.22)), 3.));
  // a ring of identical sealed cubes far away (no doors)
  float sec = TAU/9.;
  float a = mod(atan(p.z, p.x) + sec*.5, sec) - sec*.5;
  vec2 gp = length(p.xz)*vec2(cos(a), sin(a)) - vec2(140., 0.);
  res = opU(res, vec2(sdBox(vec3(gp.x, p.y - 3., gp.y), vec3(3.)), 2.));
  return res;
}

// hall parts without the room envelope (used for shadows)
vec2 hallParts(vec3 p){
  vec2 res = vec2(cubeSDF(p - C1), 2.);
  // colonnades at x = ±150, ±300, every 60 along z
  vec3 cq = p; cq.x = abs(cq.x); cq.x -= cq.x > 225. ? 300. : 150.;
  float zid = clamp(round(cq.z/60.), -17., 0.); cq.z -= zid*60.;
  float ang = atan(cq.z, cq.x);
  float col = max(length(cq.xz) - 9. - 0.3*cos(ang*20.), abs(p.y - 115.) - 205.);
  col = min(col, sdBox(cq - vec3(0., 324., 0.), vec3(13., 5., 13.)));
  col = min(col, sdBox(cq - vec3(0., -84., 0.), vec3(12.5, 6., 12.5)));
  res = opU(res, vec2(col*0.9, 3.));
  // arcades + entablature above the columns
  float az = mod(p.z, 60.) - 30.;
  float arc = max(abs(cq.x) - 5., abs(p.y - 300.) - 30.);
  arc = min(arc, max(abs(cq.x) - 14., abs(p.y - 345.) - 16.));
  float hole = min(sdBox2(vec2(az, p.y - 220.), vec2(19., 80.)), length(vec2(az, p.y - 300.)) - 19.);
  arc = max(arc, -hole);
  arc = max(arc, abs(p.z + 495.) - 525.);
  res = opU(res, vec2(arc, 4.));
  return res;
}

vec2 mapHall(vec3 p){
  // room envelope: x ±420, y -90..500, z -1100..90 (inside positive)
  float room = -sdBox(p - vec3(0., 205., -505.), vec3(420., 295., 595.));
  // the colossal doorway back to the outside (the original door, ×30)
  room = max(room, -sdBox(p - vec3(0., -SH*KSC + DH*KSC*.5, 100.), vec3(DW*KSC, DH*KSC*.5, 20.)));
  // tiny human-sized doors along the base of the side walls
  vec3 sd = p; sd.x = abs(sd.x) - 420.; sd.z = mod(sd.z + 10., 20.) - 10.;
  room = max(room, -sdBox(sd - vec3(0., -90. + 1.2, 0.), vec3(0.6, 1.2, 0.8)));
  // tiers of arched niches in the side walls
  vec3 ar = p; ar.x = abs(ar.x) - 420.; ar.z = mod(ar.z + 30., 60.) - 30.;
  float tier = mod(ar.y + 90., 110.) - 55.;
  float archR = min(sdBox2(vec2(ar.z, tier + 10.), vec2(18., 35.)), length(vec2(ar.z, tier - 25.)) - 18.);
  room = max(room, -max(max(archR, abs(ar.x - 12.) - 12.), -60. - p.y));
  // coffered ceiling
  room = max(room, -sdBox(vec3(mod(p.x, 40.) - 20., p.y - 500., mod(p.z, 40.) - 20.), vec3(16., 6., 16.)));
  // great windows in the far wall
  float ew = sdBox(p - vec3(0., 250., -1100.), vec3(110., 200., 8.));
  ew = min(ew, max(length(vec2(abs(p.x) - 290., p.y - 300.)) - 70., abs(p.z + 1100.) - 8.));
  room = max(room, -ew);
  return opU(vec2(room, 1.), hallParts(p));
}

vec2 map(vec3 p){ return gLvl == 0 ? mapExt(p) : mapHall(p); }
float mapS(vec3 p){ return gLvl == 0 ? mapExt(p).x : hallParts(p).x; }

vec3 skyExt(vec3 rd){
  return skyGrad(rd, SUN0, vec3(0.1, 0.2, 0.45), vec3(0.95, 0.62, 0.42), vec3(1., 0.6, 0.3), 1.0);
}
vec3 fogCol(vec3 rd, int l){
  if(l == 0) return vec3(0.72, 0.55, 0.45) + vec3(1., .7, .4)*pow(max(dot(rd, SUN0), 0.), 8.)*0.35;
  return vec3(0.52, 0.45, 0.37) + vec3(1., .82, .55)*pow(max(dot(rd, SUN1), 0.), 6.)*0.45;
}
float fogDen(int l){ return l == 0 ? 0.0032 : 0.00075; }
vec3 sky(vec3 rd){ return gLvl == 0 ? skyExt(rd) : fogCol(rd, gLvl); }

// crossing a door plane moves the ray into another space
bool portal(inout vec3 p, vec3 np, vec3 rd, out float tr){
  tr = 0.;
  vec3 C = gLvl == 0 ? C0 : C1;
  float zp = C.z + SH;
  if(p.z > zp && np.z <= zp){
    vec3 ip = mix(p, np, (p.z - zp)/(p.z - np.z));
    if(abs(ip.x - C.x) < DW && ip.y > C.y - SH && ip.y < C.y - SH + DH){
      tr = length(ip - p);
      p = (ip - C)*KSC + rd*1e-3;
      gLvl += 1;
      return true;
    }
  }
  if(gLvl > 0){
    float zh = SH*KSC;
    if(p.z < zh && np.z >= zh){
      vec3 ip = mix(p, np, (zh - p.z)/(np.z - p.z));
      if(abs(ip.x) < DW*KSC && ip.y > -SH*KSC && ip.y < -SH*KSC + DH*KSC){
        tr = length(ip - p);
        gLvl -= 1;
        p = ip/KSC + (gLvl == 0 ? C0 : C1) + rd*1e-4;
        return true;
      }
    }
  }
  return false;
}
`,
shade: `
vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float t){
  bool ext = gLvl == 0;
  vec3 L = ext ? SUN0 : SUN1;
  float sc = ext ? 1. : KSC;
  vec3 alb = vec3(0.8);
  float spec = 0.;
  if(ext){
    if(m < 1.5){
      alb = vec3(0.5, 0.47, 0.45)*(0.8 + 0.28*fbm2(p.xz*0.12));
      vec2 cell = abs(fract(p.xz*0.35 + 0.5*fbm2(p.xz*0.2)) - 0.5);
      alb *= 1. - 0.12*smoothstep(0.46, 0.5, max(cell.x, cell.y));
      if(abs(p.x) < 1.25 && p.z > 2.9 && p.z < 57.){
        vec2 g = abs(fract(vec2(p.x*0.8, p.z*0.8)) - 0.5);
        alb = vec3(0.42, 0.40, 0.38)*(1. - 0.3*smoothstep(0.45, 0.5, max(g.x, g.y)));
        spec = 0.2;
      }
    } else if(m < 2.5){ alb = vec3(0.92, 0.9, 0.86)*concreteTex(p, n, 1.5); spec = 0.25; }
    else { alb = vec3(0.09); spec = 0.6; }
  } else {
    if(m < 1.5){
      if(p.z < -1100.5) return skyExt(rd)*1.5;      // great windows: the outside sky
      if(p.y < -88. && n.y > 0.9){
        vec2 f = floor(p.xz/12.);
        float ck = mod(f.x + f.y, 2.);
        alb = mix(vec3(0.82, 0.79, 0.74), vec3(0.16, 0.15, 0.15), ck);
        alb *= 0.9 + 0.15*fbm2(p.xz*0.08);
        float rr = length(p.xz - C1.xz);
        if(abs(rr - 26.) < 1.6 || abs(rr - 32.) < 0.6) alb = vec3(0.75, 0.55, 0.25);
        spec = 0.5;
      } else {
        vec3 an = abs(n);
        vec2 uv = an.x > an.z ? p.zy : p.xy;
        uv.x += step(1., mod(floor(uv.y/4.), 2.))*4.;
        vec2 g = abs(fract(uv/vec2(8., 4.)) - 0.5);
        alb = vec3(0.72, 0.63, 0.52)*(1. - 0.25*smoothstep(0.47, 0.5, max(g.x, g.y)));
        alb *= 0.85 + 0.2*fbm2(uv*0.05);
      }
    } else if(m < 2.5){ alb = vec3(0.92, 0.9, 0.86)*concreteTex(p, n, 1.5); spec = 0.25; }
    else if(m < 3.5){ alb = vec3(0.86, 0.82, 0.76)*(0.9 + 0.12*fbm2(p.xy*0.05)); spec = 0.2; }
    else alb = vec3(0.76, 0.68, 0.58);
  }
  float ao = calcAO(p, n, ext ? 0.8 : 14.);
  float sh = softShadow(p + n*0.02*sc, L, 0.05*sc, ext ? 80. : 1200., 8.);
  float dif = clamp(dot(n, L), 0., 1.);
  vec3 sunC = ext ? vec3(1.9, 1.1, 0.6) : vec3(1.7, 1.35, 0.95);
  vec3 skyC = ext ? vec3(0.32, 0.38, 0.56) : vec3(0.38, 0.36, 0.34);
  vec3 lin = dif*sh*sunC*1.5;
  lin += (0.5 + 0.5*n.y)*ao*skyC;
  lin += clamp(dot(n, normalize(vec3(-L.x, 0., -L.z))), 0., 1.)*ao*vec3(0.35, 0.28, 0.22)*0.5;
  vec3 col = alb*lin;
  vec3 hh = normalize(L - rd);
  col += spec*sh*pow(max(dot(n, hh), 0.), 50.)*sunC*0.6;
  float fre = pow(1. - max(dot(n, -rd), 0.), 5.);
  col += spec*fre*ao*(ext ? skyExt(reflect(rd, n)) : vec3(0.5, 0.42, 0.33))*0.4;
  return col;
}
`
};
