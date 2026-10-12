// Atrium-first pilot: the east wing, floors 1203–1208. Everything outside this
// bounded intervention retains the original apartment / lounge distance field.
SHADERS.Gallery = `
const float G_BASE = 1202.*FH;
const float G_HEIGHT = 6.*FH;
float galleryBounds(vec3 p){
  return sdBox(p - vec3(33.7, G_BASE + G_HEIGHT*.5, 0.), vec3(8.7, G_HEIGHT*.5 + .3, 18.));
}
bool inGallery(vec3 p){ return galleryBounds(p) < .01; }

// White open balustrade, with vertical bars rather than solid parapets.
float galleryRail(vec3 q, float halfLen){
  float cap = sdBox(q - vec3(0., 1.08, 0.), vec3(.055, .045, halfLen));
  float bars = max(sdBox(vec3(q.x, q.y - .53, mod(q.z + .3, .6) - .3), vec3(.035, .53, .035)), abs(q.z) - halfLen);
  return min(cap, bars);
}
vec2 mapGallery(vec3 p){
  vec3 q = p - vec3(0., G_BASE, 0.);
  float r = length(p.xz);
  vec2 res = vec2(1e9, 0.);
  // A single tall cream facade; broad openings look onto the existing balconies.
  float wall = sdBox(q - vec3(41.9, G_HEIGHT*.5, 0.), vec3(.3, G_HEIGHT*.5, 18.));
  float windows = sdBox(vec3(q.x-41.9, mod(q.y, FH)-1.75, mod(q.z+3.,6.)-3.),vec3(.7,1.25,2.3));
  res = opU(res, vec2(max(wall, -windows), 60.));
  // Continuous multi-storey piers make the wing read as one structure.
  float piers = sdBox(vec3(q.x-40.8, q.y-G_HEIGHT*.5, mod(q.z+6.,12.)-6.),vec3(.22,G_HEIGHT*.5,.22));
  res = opU(res,vec2(piers,60.));
  for(int i=ZERO; i<7; i++){
    float level=float(i)*FH;
    vec3 v=q-vec3(0.,level,0.);
    float inner=max(sdBox(v-vec3(27.75,-.15,0.),vec3(2.75,.15,18.)),R_ATR-r);
    float outer=sdBox(v-vec3(40.2,-.15,0.),vec3(1.4,.15,18.));
    // Full-width landings join the galleries and alternate ramp ends.
    float landing=max(sdBox(v-vec3(33.7,-.15,0.),vec3(8.7,.15,18.)),12.-abs(v.z));
    landing=max(landing,R_ATR-r);
    float floorD=min(inner,min(outer,landing));
    if(i==0 || i==6) floorD=max(sdBox(v-vec3(33.7,-.15,0.),vec3(8.7,.15,18.)),R_ATR-r);
    // Cantilevered reading terraces alternate around the central slot.
    float tz=mod(float(i),2.)<.5 ? -6. : 6.;
    if(i>0 && i<6){
      floorD=min(floorD,sdBox(v-vec3(31.6,-.15,tz),vec3(1.1,.15,2.1)));
      res=opU(res,vec2(galleryRail(v-vec3(32.65,0.,tz),2.1),62.));
      res=opU(res,vec2(galleryRail(vec3(v.z-tz-2.05,v.y,v.x-31.6),1.05),62.));
      res=opU(res,vec2(galleryRail(vec3(v.z-tz+2.05,v.y,v.x-31.6),1.05),62.));
    }
    res=opU(res,vec2(floorD,61.));
    if(i==6) continue;
    // Main atrium edge, and the edges of the second vertical void.
    float ar=max(abs(r-26.65)-.055,max(v.y-1.1,-v.y));
    // Keep the existing helical stair bridges open at their exact landing angles.
    float bridgeFloor=floor(p.y/FH);
    for(int j=0;j<2;j++){
      float bn=bridgeFloor+float(j);
      vec2 bq=p.xz*rot(-TAU*bn/5.);
      float cut=sdBox(vec3(bq.x-26.6,p.y-bn*FH-1.1,bq.y),vec3(1.6,1.15,.85));
      ar=max(ar,-cut);
    }
    res=opU(res,vec2(ar,62.));
    if(i>0){
      float rail=galleryRail(v-vec3(30.45,0.,0.),12.);
      rail=max(rail,-sdBox(v-vec3(30.45,.6,tz),vec3(.3,.8,2.1)));
      res=opU(res,vec2(rail,62.));
      res=opU(res,vec2(galleryRail(v-vec3(38.85,0.,0.),12.),62.));
      float endRail=galleryRail(vec3(abs(v.z)-12.,v.y,v.x-31.8),1.3);
      endRail=min(endRail,galleryRail(vec3(abs(v.z)-12.,v.y,v.x-35.8),.35));
      res=opU(res,vec2(endRail,62.));
    }
    // Long fluorescent tubes use stable integer fixture IDs in the material.
    float tube=sdBox(vec3(v.x-28.7,v.y-3.18,mod(v.z+3.,6.)-3.),vec3(.16,.05,1.1));
    res=opU(res,vec2(tube,63.));
    // Familiar low furniture and light wood shelves on the open end landings.
    float sofa=sdBox(vec3(v.x-32.,v.y-.32,abs(v.z)-16.2),vec3(1.3,.27,.5));
    sofa=min(sofa,sdBox(vec3(v.x-32.,v.y-.72,abs(v.z)-16.65),vec3(1.3,.55,.1)));
    res=opU(res,vec2(sofa,64.));
    float table=sdBox(vec3(v.x-32.,v.y-.42,abs(v.z)-14.7),vec3(.8,.06,.35));
    table=min(table,sdBox(vec3(abs(v.x-32.)-.7,v.y-.18,abs(abs(v.z)-14.7)-.25),vec3(.045,.18,.045)));
    res=opU(res,vec2(table,65.));
    // Two separate lanes: opposing flights never overlap above the player's head.
    if(i<5){
      float dir=mod(float(i),2.)<.5 ? 1. : -1.;
      float rx=dir>0. ? 34.3 : 37.3;
      float h=(v.z*dir+12.)*FH/24.;
      float ramp=max(abs(v.y-h+.12)-.12,max(abs(v.x-rx)-1.1,abs(v.z)-12.));
      res=opU(res,vec2(ramp*.9889,61.));
      float rails=galleryRail(vec3(abs(v.x-rx)-1.05,v.y-h,v.z),12.);
      res=opU(res,vec2(rails*.9889,62.));
    }
  }
  res.x=max(res.x,galleryBounds(p));
  return res;
}
vec2 withGallery(vec3 p, vec2 original){
  // Outside the pilot, its bounding box cannot beat a closer original surface.
  if(galleryBounds(p)>max(original.x,0.)) return original;
  original.x=max(original.x,-max(galleryBounds(p),R_ATR-length(p.xz)));
  return opU(original,mapGallery(p));
}
`;

SHADERS.GalleryShade = `
// Exact integer mixing avoids float sine hashes losing randomness on floor 1203.
float galleryFixture(vec3 p){
  return floor((p.y-G_BASE)/FH)*31.+floor((p.z+3.)/6.)+810.;
}
vec3 shadeGallery(vec3 p,vec3 n,vec3 rd,float m,float ao,float sh){
  vec3 alb=vec3(.82,.77,.65);
  float spec=.03;
  if(m>60.5 && m<61.5){
    if(p.x<30.6 || (p.x>33.2 && p.x<38.5 && abs(p.z)<12. && p.y>G_BASE+.3)){
      alb=vec3(.34,.055,.045)*(.87+.2*noise2(p.xz*30.));
      if(p.x<30.6 && abs(p.x-29.9)<.07) alb=vec3(.6,.39,.16);
    } else {
      vec2 tile=abs(fract(p.xz/.9)-.5);
      alb=vec3(.69,.61,.48)*(1.-.2*step(.475,max(tile.x,tile.y)));
      spec=.12;
    }
    if(n.y<-.5) alb=vec3(.85,.81,.71);
  }
  if(m>61.5 && m<62.5) alb=vec3(.91,.89,.82);
  if(m>62.5 && m<63.5) return mix(vec3(.025),vec3(2.5,2.65,2.35),flick(galleryFixture(p)));
  if(m>63.5 && m<64.5) alb=vec3(.55,.45,.32);
  if(m>64.5) alb=vec3(.64,.45,.26)*(.9+.1*noise2(vec2(p.x,p.z*18.)));
  float fl=floor((p.y-G_BASE+.02)/FH);
  vec3 lin=vec3(.035,.032,.026)*ao;
  // Overcast daylight stays after a power cut; electrical illumination does not.
  lin+=vec3(.14,.15,.16)*max(dot(n,SUN_T),0.)*sh;
  for(int j=-1;j<=1;j++){
    float z=floor((p.z+3.)/6.)*6.+float(j)*6.;
    vec3 L=vec3(28.7,G_BASE+fl*FH+3.18,z);
    vec3 lv=L-p; float dd=max(dot(lv,lv),.01);
    float f=flick(fl*31.+floor((z+3.)/6.)+810.);
    lin+=vec3(.94,1.,.86)*f*16./(dd+2.)*max(dot(n,normalize(lv)),0.)*(.35+.65*ao);
  }
  // Warm reflected light from the outer gallery follows building supply too.
  lin+=vec3(.19,.16,.11)*ao*uSupply;
  return alb*lin+spec*sh*pow(max(dot(n,normalize(SUN_T-rd)),0.),35.)*.12;
}
`;
