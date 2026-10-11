// Shared GLSL: uniforms, math, noise, sky, lighting helpers and the main raymarch loop.
// Each scene supplies: defs (defines + map/mapS/sky/fogCol/fogDen) and shade (+ optional portal()).
window.SHADERS = window.SHADERS || {};

SHADERS.vert = `#version 300 es
in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

SHADERS.header = `#version 300 es
precision highp float;
precision highp int;
uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCam;
uniform mat3  uRot;
uniform float uFov;
uniform int   uSpace;
uniform int   uDepth;
uniform float uWarp;
uniform vec3  uWarpC;
out vec4 outColor;

#define PI  3.14159265359
#define TAU 6.28318530718

int gSpace = 0;
int gDepth = 0;

float hash11(float p){ p = fract(p*.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
float hash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y)*p3.z); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec2 opU(vec2 a, vec2 b){ return a.x < b.x ? a : b; }

float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float sdBox2(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, q.y), 0.); }

float noise2(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float fbm2(vec2 p){ float v = 0., a = .5; for(int i = 0; i < 5; i++){ v += a*noise2(p); p = p*2.03 + vec2(1.7, 9.2); a *= .5; } return v; }

// straight flight of stairs. p.x = along [0,len], p.y = up (0 at start), p.z = across
float stairStraight(vec3 p, float len, float rise, float n, float w, float T){
  float sl = len/n, sh = rise/n;
  float k = clamp(floor(p.x/sl), 0., n - 1.);
  float top = (k + 1.)*sh;
  float ramp = p.x*rise/len;
  float cosA = len/sqrt(len*len + rise*rise);
  float dv = max(p.y - top, (ramp - T - p.y)*cosA);
  if(p.y > top && p.y < top + sh && k < n - 1.) dv = min(dv, (k + 1.)*sl - p.x + 0.02);
  float d = max(dv, abs(p.x - len*.5) - len*.5);
  return max(d, abs(p.z) - w);
}

// board-formed concrete / stone texture
float concreteTex(vec3 p, vec3 n, float sc){
  vec3 an = abs(n);
  vec2 uv = (an.x > an.y && an.x > an.z) ? p.zy : (an.y > an.z ? p.xz : p.xy);
  uv /= sc;
  float f = fbm2(uv*1.7)*0.55 + noise2(uv*11.)*0.2;
  vec2 g = abs(fract(uv*vec2(0.5, 1.0)) - 0.5);
  float seam = smoothstep(0.485, 0.5, max(g.x, g.y));
  return 0.84 + 0.16*f - seam*0.14;
}

vec3 skyGrad(vec3 rd, vec3 sun, vec3 zen, vec3 hor, vec3 sunCol, float clouds){
  float y = rd.y;
  vec3 c = mix(hor, zen, pow(clamp(y, 0., 1.), 0.45));
  c = mix(c, hor*0.5, smoothstep(0., -0.3, y));
  float sd = max(dot(rd, sun), 0.);
  c += sunCol*(pow(sd, 900.)*10. + pow(sd, 40.)*0.25 + pow(sd, 5.)*0.12);
  if(clouds > 0. && y > 0.){
    vec2 cp = rd.xz/(y + 0.12)*1.2 + vec2(uTime*0.012, 0.);
    float cl = smoothstep(0.45, 0.85, fbm2(cp*1.3));
    vec3 cc = mix(vec3(1.0, 0.97, 0.94), hor, 0.35)*(0.75 + 0.5*pow(sd, 3.));
    c = mix(c, cc, cl*clouds*smoothstep(0., 0.25, y));
  }
  return c;
}

vec3 aces(vec3 x){ return clamp((x*(2.51*x + 0.03))/(x*(2.43*x + 0.59) + 0.14), 0., 1.); }
`;

// lighting helpers (need map / mapS, so injected after scene defs)
SHADERS.lighting = `
#ifndef SHSTEPS
#define SHSTEPS 32
#endif
vec3 calcNormal(vec3 p, float e){
  const vec2 k = vec2(1, -1);
  return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x +
                   k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x);
}
float calcAO(vec3 p, vec3 n, float sc){
  float o = 0., w = 1.;
  for(int i = 0; i < 5; i++){
    float h = sc*(0.02 + 0.16*float(i));
    float d = map(p + n*h).x;
    o += (h - d)*w; w *= 0.7;
  }
  return clamp(1. - 1.6*o/sc, 0., 1.);
}
float softShadow(vec3 ro, vec3 rd, float mint, float maxt, float k){
  float res = 1., t = mint;
  for(int i = 0; i < SHSTEPS; i++){
    float h = mapS(ro + rd*t);
    res = min(res, k*h/t);
    t += clamp(h, mint*0.5, maxt/10.);
    if(res < 0.02 || t > maxt) break;
  }
  return clamp(res, 0., 1.);
}
`;

SHADERS.main = `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  float fl = 0.5/tan(uFov*0.5);
  vec3 rd = normalize(uRot*vec3(uv, -fl));
  vec3 p = uCam;
  gSpace = uSpace; gDepth = uDepth;
  float unit = 1.;     // camera units per local unit (changes when passing through portals)
  float tC = 0.;       // distance in camera units
  float tL = 0.;       // distance in the current space segment (local units)
  float T = 1.;        // fog transmittance
  vec3 acc = vec3(0.); // fog light accumulated in spaces the ray has left
  vec2 h = vec2(1e9, 0.);
  bool hit = false;
  float pix = 1.0/(uRes.y*fl);
  for(int i = 0; i < MAXSTEPS; i++){
    h = map(p);
    float eps = (0.0008 + tC*pix*0.7)/unit;
    int oldS = gSpace;
    float k;
    if(h.x < eps){
      if(surfPortal(p, rd, k)){
        float a = 1. - exp(-tL*fogDen(oldS));
        acc += T*a*fogCol(rd, oldS); T *= 1. - a; tL = 0.; unit /= k;
        continue;
      }
      hit = true; break;
    }
    float s = h.x*stepK();
    float tr;
    if(portal(p, p + rd*s, rd, tr, k)){
      tL += tr; tC += tr*unit;
      float a = 1. - exp(-tL*fogDen(oldS));
      acc += T*a*fogCol(rd, oldS); T *= 1. - a; tL = 0.; unit /= k;
      continue;
    }
    p += rd*s; tL += s; tC += s*unit;
    if(tC > MAXD) break;
  }
  vec3 col;
  if(hit){
    float e = max(0.0006, tC*pix*0.5)/unit;
    vec3 n = calcNormal(p, e);
    col = shade(p, n, rd, h.y, tL);
    float a = 1. - exp(-tL*fogDen(gSpace));
    col = mix(col, fogCol(rd, gSpace), a);
  } else {
    col = sky(rd);
  }
  col = acc + T*col;

  // post: tone map, grade, vignette, grain
  col = aces(col*1.05);
  col = pow(col, vec3(0.4545));
  vec2 q = gl_FragCoord.xy/uRes;
  col *= 0.55 + 0.45*pow(16.*q.x*q.y*(1. - q.x)*(1. - q.y), 0.18);
  col += (hash12(gl_FragCoord.xy + fract(uTime*7.3)*311.) - 0.5)*0.035;
  outColor = vec4(col, 1.);
}
`;

// collision probes: the player's body spheres are evaluated against the exact same map()
SHADERS.probeMain = `
uniform vec3 uProbe[8];
void main(){
  int i = int(gl_FragCoord.x);
  gSpace = uSpace; gDepth = uDepth;
  vec3 p = uProbe[i];
  float d = map(p).x;
  vec3 n = calcNormal(p, 0.004);
  outColor = vec4(n, d);
}
`;
