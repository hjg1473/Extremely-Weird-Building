const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const serveRoot = process.env.TEST_ROOT ? path.resolve(process.env.TEST_ROOT) : root;
const phase = process.argv[2] || 'after';
const server = http.createServer((req, res) => {
  const filename = path.resolve(serveRoot, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!filename.startsWith(serveRoot + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(filename, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist']});
  try {
    const page = await browser.newPage({ viewport: {width: 1100, height: 720} });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/?scale=0.7#corridor`);
    await page.waitForFunction(() => window.__IA && document.getElementById('loading').style.display === 'none', null, {timeout: 120000});
    if (await page.locator('#err').innerText()) throw new Error(await page.locator('#err').innerText());
    await page.evaluate(() => { __IA.autoStep.on = true; document.getElementById('intro').style.display='none'; document.body.classList.add('nohud'); });
    for (const [name, pos, yaw, pitch] of [
      ['gallery', [28.2, 1202*3.6+1.6, 4], -Math.PI/2-0.55, 0.1],
      ['atrium', [28.2, 1202*3.6+1.6, 4], Math.PI/2+0.2, -0.35],
      ['overlook', [31.6, 1204*3.6+1.6, -6], -Math.PI/2-0.7, -0.28]
    ]) {
      await page.evaluate(({pos,yaw,pitch}) => { Object.assign(__IA.P, {pos,yaw,pitch,space:0}); }, {pos,yaw,pitch});
      await page.waitForTimeout(500);
      await page.screenshot({path: path.join(root, `docs/${phase}-${name}.png`)});
    }
    if (phase !== 'before') {
      const result = await page.evaluate(async () => {
        const results = [];
        const check = (name, ok, detail) => { results.push({name,ok,detail}); };
        const base = 1202*3.6;
        // Probe visible geometry with the same GPU SDF used by walking.
        const probe = points => __IA.sampleSDF(0, points, [12,12,12]);
        check('float collision probe', !!probe([[28,base+1,4]]));
        const openings = probe([[30,base+1.6,4], [34,base+4,0], [33,base+5,-6]]);
        check('open boundaries and vertical void', openings.every(v=>v.d>0.3), openings);
        const floors = probe([[28.2,base+0.02,4],[40,base+0.02,4],[31.6,base+7.22,-6]]);
        check('gallery and overlook floors', floors.every(v=>Math.abs(v.d)<0.06), floors);
        const ramps = [];
        for(let floor=0;floor<5;floor++) for(let z=-11;z<=11;z+=2) {
          const y = base+floor*3.6+(floor%2 ? 12-z : z+12)*3.6/24;
          const x=floor%2?37.3:34.3;
          ramps.push(...probe([[x,y+0.02,z],[x,y+1.6,z]]));
        }
        check('ramps have continuous floor and headroom', ramps.every((v,i)=>i%2?v.d>0.35:Math.abs(v.d)<0.07), ramps.filter((v,i)=>i%2?v.d<=0.35:Math.abs(v.d)>=0.07));
        // Exercise the actual controller, including stepping, gravity and wall response.
        function walk(pos,yaw,seconds){
          Object.assign(__IA.P,{pos:pos.slice(),yaw,pitch:0,vel:[0,0,0],space:0,grounded:true,fly:false,noclip:false,up:[0,1,0],gUp:[0,1,0],fwd0:[0,0,-1]});
          __IA.keys.clear(); __IA.keys.add('KeyW');
          for(let i=0;i<Math.ceil(seconds*60);i++) __IA.physics(1/60);
          __IA.keys.clear(); return __IA.P.pos.slice();
        }
        let end=walk([28.2,base+1.6,4],-Math.PI/2,1.2);
        check('walk through removed apartment wall',end[0]>32 && Math.abs(end[1]-base-1.6)<.12,end);
        end=walk([34.3,base+1.6,-13],Math.PI,6.1);
        check('walk first ramp to upper landing',end[2]>12 && Math.abs(end[1]-base-5.2)<.15,end);
        end=walk([37.3,base+5.2,13],0,6.1);
        check('walk return ramp to next landing',end[2]<-12 && Math.abs(end[1]-base-8.8)<.15,end);
        const absent=__IA.camPortal(0,[32.6,base+1.6,-4],[32.6,base+1.6,-4.2]);
        const preserved=__IA.camPortal(0,[-32.6,base+1.6,4],[-32.6,base+1.6,4.2]);
        check('no invisible gallery portal; original bedroom preserved',!absent && preserved?.space===1,{absent,preserved});
        __IA.power.trigger(3);
        __IA.power.update(1);
        check('blackout is exactly off', __IA.power.state().supply===0, __IA.power.state());
        __IA.power.update(3);
        check('restoration starts', __IA.power.state().phase==='restoring', __IA.power.state());
        __IA.power.update(4);
        check('power recovers', __IA.power.state().supply===1, __IA.power.state());
        return results;
      });
      console.log(JSON.stringify(result,null,2));
      if(result.some(r=>!r.ok)) throw new Error('Geometry/power checks failed');
      // Read the real GLSL flick() output from a tiny GPU buffer over 80 fixtures.
      const lights=await page.evaluate(()=>{
        const gl=document.createElement('canvas').getContext('webgl2');
        const program=gl.createProgram();
        const sources=[['VERTEX_SHADER',SHADERS.vert],['FRAGMENT_SHADER',SHADERS.header+SHADERS.worldConsts+SHADERS.Tower.defs+'\nvoid main(){float id=floor(gl_FragCoord.x)+44440.;outColor=vec4(flick(id),fixtureHash(id),0.,1.);}']];
        for(const [type,src] of sources){const sh=gl.createShader(gl[type]);gl.shaderSource(sh,src);gl.compileShader(sh);gl.attachShader(program,sh);}
        gl.bindAttribLocation(program,0,'aPos');gl.linkProgram(program);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
        gl.canvas.width=80;gl.canvas.height=1;gl.viewport(0,0,80,1);gl.useProgram(program);
        const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
        const time=gl.getUniformLocation(program,'uTime'), supply=gl.getUniformLocation(program,'uSupply');
        const pixels=new Uint8Array(320), samples=[];
        function read(t,s){gl.uniform1f(time,t);gl.uniform1f(supply,s);gl.drawArrays(gl.TRIANGLES,0,3);gl.readPixels(0,0,80,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return Array.from({length:80},(_,i)=>pixels[i*4]);}
        for(let t=0;t<4;t+=.07)samples.push(read(t,1));
        const dead=[],steady=[],flickering=[];
        for(let i=0;i<80;i++){const values=samples.map(a=>a[i]);(values.every(v=>v===0)?dead:values.every(v=>v===255)?steady:flickering).push(i);}
        const off=read(1,0).every(v=>v===0), restored=read(0,1).every((v,i)=>v===samples[0][i]);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return {dead:dead.length,steady:steady.length,flickering:flickering.length,off,restored};
      });
      console.log('GLSL fluorescent samples:',JSON.stringify(lights));
      if(!lights.dead || !lights.steady || !lights.flickering || !lights.off || !lights.restored)throw Error('GPU light checks failed');
      await page.evaluate(() => { Object.assign(__IA.P,{pos:[28.2,1202*3.6+1.6,4],yaw:-Math.PI/2-0.55,pitch:0.1}); __IA.power.trigger(15); });
      await page.waitForTimeout(500);
      await page.screenshot({path:path.join(root,'docs/after-blackout.png')});
    }
    if(errors.length) throw new Error(errors.join('\n'));
    console.log(`${phase}: browser render and screenshots passed`);
  } finally { await browser.close(); server.close(); }
})().catch(e=>{ console.error(e); server.close(); process.exitCode=1; });
