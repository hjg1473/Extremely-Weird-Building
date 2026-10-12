// One world, two spaces stitched by portals:
//
//   TOWER  (an endless apartment tower; every flat is real and enterable; recursive towers outside)
//   ROOMS  (twisted rooms, each with its own gravity)
//
//   any flat's bedroom door  -->  room 0 of ROOMS  (and back to the flat you came from)
//   any room window          -->  the air outside the tower, above your floor
//
// js/main.js mirrors these rules for the player.

SHADERS.worldConsts = `
#define MAXSTEPS 200
#define MAXD 20000.
#define SHSTEPS 24
const int SP_TOWER = 0, SP_ROOMS = 1;
const float TS = 4.6666667;                // apartment-tower metres per scene-C unit (42 m / 9)
const vec3  RD_D = vec3(12., 9., 24.);     // room 0's door (plane z = 24)
const float BED_D = 2.6, BED_L = -4.1;    // bedroom door inside a flat (depth from corridor wall, lateral plane)
uniform vec3 uHome;
uniform float uDip;                         // building-wide brown-out (0..1), driven from JS                         // flat you entered the rooms from: (side, floor base y, unit centre z)
uniform float uSupply;                      // zero during outage, 0..1 during staggered restart
`;

SHADERS.worldDispatch = `
vec2 map(vec3 p){ return gSpace == SP_TOWER ? withGallery(p,mapTower(p)) : mapD(p); }
float mapS(vec3 p){ return map(p).x; }
float stepK(){ return gSpace == SP_TOWER ? 0.75 : 0.8; }
float fogDen(int s){ return s == SP_TOWER ? 0.0011 : 0.017; }
vec3 fogCol(vec3 rd, int s){ return s == SP_TOWER ? fogColT(rd) : fogColD(rd); }
vec3 sky(vec3 rd){ return fogCol(rd, gSpace); }
`;

SHADERS.worldShade = `
vec3 lightDir(vec3 p, out float aoS, out float maxt){
  if(gSpace == SP_TOWER){ aoS = 0.7; maxt = 60.; return SUN_T; }
  float lip;
  vec3 w = warpD(p, lip);
  vec3 lp = (floor(w/S_D) + .5)*S_D - w;
  aoS = 1.3; maxt = max(length(lp) - 0.2, 0.1);
  return normalize(lp);
}
vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float t, float ao, float sh){
  return gSpace == SP_TOWER ? shadeTower(p, n, rd, m, t, ao, sh) : shadeD(p, n, rd, m, t, ao, sh);
}
float crossT(float a, float b, float v, float dir){
  if(dir < 0. ? (a > v && b <= v) : (a < v && b >= v)) return (a - v)/(a - b);
  return -1.;
}
bool roomWindow(vec3 q, out vec3 wc){
  vec3 aq = abs(q);
  float mx = max(aq.x, max(aq.y, aq.z));
  wc = vec3(0.);
  if(mx < 11.5) return false;
  vec3 ax = aq.x >= mx ? vec3(1, 0, 0) : (aq.y >= mx ? vec3(0, 1, 0) : vec3(0, 0, 1));
  vec2 fw = ax.x > .5 ? q.yz : (ax.y > .5 ? q.xz : q.xy);
  vec2 wq = abs(abs(fw) - 7.);
  if(max(wq.x, wq.y) > 2.05) return false;
  vec3 sg = sign(q);
  wc = mix(sg*7., sg*11.6, ax);
  return true;
}

bool portal(inout vec3 p, vec3 np, inout vec3 rd, out float tr, out float k){
  tr = 0.; k = 1.;
  float f; vec3 ip;
  if(gSpace == SP_TOWER){
    int s = sideOf(p);
    vec3 c0 = toSide(p, s), c1 = toSide(np, s);
    if(abs(c0.z) < SQ_IN && c0.x > SQ_IN && c0.x < SQ_IN + 6.){
      float uz = clamp(round(c0.z/UW), -2., 2.);
      f = crossT(c0.z - uz*UW, c1.z - uz*UW, BED_L, -1.);
      if(f >= 0.){
        ip = mix(c0, c1, f);
        float fl = floor(ip.y/FH), fy = ip.y - fl*FH;
        if(abs(ip.x - SQ_IN - BED_D) < 0.6 && fy > 0. && fy < 2.2 && !isLounge(fl) && !inGallery(fromSide(ip,s))){
          tr = length(ip - c0);
          p = RD_D + vec3(ip.x - SQ_IN - BED_D, fy, ip.z - uz*UW - BED_L);
          rd = toSide(rd, s);
          p += rd*1e-3; gSpace = SP_ROOMS; return true;
        }
      }
    }
  } else {
    float lip;
    vec3 w = warpD(p, lip), wn = warpD(np, lip);
    vec3 cid = floor(w/S_D);
    vec3 q0 = w - (cid + .5)*S_D, q1 = wn - (cid + .5)*S_D;
    float m0 = max(abs(q0.x), max(abs(q0.y), abs(q0.z))), m1 = max(abs(q1.x), max(abs(q1.y), abs(q1.z)));
    if(m0 < 11.6 && m1 >= 11.6){
      vec3 wc;
      ip = mix(q0, q1, (11.6 - m0)/(m1 - m0));
      if(roomWindow(ip + sign(ip)*0.001, wc)){
        tr = length(ip - q0);
        p = vec3(47., uHome.y + 24., 0.) + (ip - wc) + rd*1e-3; gSpace = SP_TOWER; return true;
      }
    }
    if(cid == vec3(0.)){
      f = crossT(w.z, wn.z, RD_D.z, 1.);
      if(f >= 0.){
        ip = mix(w, wn, f);
        if(abs(ip.x - RD_D.x) < 0.6 && ip.y > RD_D.y && ip.y < RD_D.y + 2.2){
          tr = length(ip - w);
          vec3 v = ip - RD_D;
          int hs = int(uHome.x + 0.5);
          p = fromSide(vec3(SQ_IN + BED_D + v.x, uHome.y + v.y, uHome.z + BED_L + v.z), hs);
          rd = fromSide(rd, hs);
          p += rd*1e-3; gSpace = SP_TOWER; return true;
        }
      }
    }
  }
  return false;
}
bool surfPortal(inout vec3 p, vec3 rd, out float k){ k = 1.; return false; }
`;
