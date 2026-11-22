// The living droplet: a small WebGL scene behind the Today header that reacts
// to the real readings (UV glow, haze particles, humidity beads, night).
// One canvas is kept for the whole session and moved into each new render,
// so the GL context and its animation survive the app's innerHTML renders.

const FRAG = `precision highp float;
uniform vec2 uRes; uniform float uTime, uUV, uHaze, uHum, uNight, uShift, uLift, uClear; uniform vec3 uSkyTop, uSkyBot;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float sdRoundCone(vec3 p,float r1,float r2,float h){vec2 q=vec2(length(p.xz),p.y);float b=(r1-r2)/h;float a=sqrt(1.-b*b);float k=dot(q,vec2(-b,a));if(k<0.)return length(q)-r1;if(k>a*h)return length(q-vec2(0.,h))-r2;return dot(q,vec2(a,b))-r1;}
vec3 local(vec3 p){p.x-=uShift;p.y-=sin(uTime*.9)*.045;float a=uTime*.35;float c=cos(a),s=sin(a);p.xz=mat2(c,-s,s,c)*p.xz;return p;}
float map(vec3 p){vec3 q=local(p);return sdRoundCone(q+vec3(0.,.45,0.),.6,.05,1.08);}
vec3 sky(vec3 d){
  vec3 sun=normalize(vec3(.55,.6,.6));
  float t=clamp(d.y*.6+.5,0.,1.);
  vec3 day=mix(vec3(.22,.42,.31),vec3(.05,.17,.11),t);
  vec3 nite=mix(vec3(.06,.12,.14),vec3(.01,.03,.05),t);
  vec3 col=mix(day,nite,uNight);
  col=mix(col,mix(uSkyBot,uSkyTop,t),uClear);
  col=mix(col,vec3(.46,.44,.36),uHaze*.55*(1.-uNight*.5));
  float g=max(dot(d,sun),0.);
  col+=vec3(1.,.76,.38)*(pow(g,6.)*(.15+uUV*.9)+pow(g,60.)*(.3+uUV*1.6))*(1.-uNight)*(1.-uHaze*.45);
  vec3 moon=normalize(vec3(-.5,.55,.65));
  col+=vec3(.7,.85,1.)*pow(max(dot(d,moon),0.),350.)*1.6*uNight;
  col+=vec3(.55,.7,.8)*pow(max(dot(d,moon),0.),8.)*.12*uNight;
  return col;}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  vec3 ro=vec3(0.,-.4-uLift,-4.4-uLift*1.6); vec3 rd=normalize(vec3(uv,1.75));
  vec3 bg=sky(rd);
  vec2 su=gl_FragCoord.xy/uRes.y;
  float stars=step(.9965,hash(floor(su*180.)))*uNight*(.5+.5*sin(uTime*2.+hash(floor(su*180.))*30.));
  bg+=vec3(stars);
  float dust=0.;
  for(int i=0;i<3;i++){float fi=float(i);vec2 g=su*(5.+fi*4.)+vec2(uTime*(.05+fi*.03),uTime*.02*(fi+1.));vec2 id=floor(g);vec2 f=fract(g)-.5;vec2 o=vec2(hash(id+fi*13.),hash(id+fi*29.))-.5;float on=step(.45,hash(id+fi*7.));dust+=on*(1.-smoothstep(0.,.09-fi*.02,length(f-o*.7)))*(.55-fi*.12);}
  float fog=noise(su*2.5+vec2(uTime*.08,0.))*.6+noise(su*6.-vec2(uTime*.05,0.))*.4;
  bg=mix(bg,vec3(.62,.58,.46),uHaze*fog*.35);
  bg+=vec3(.95,.88,.7)*dust*uHaze*.7;
  vec3 col=bg; float t=0.; bool hit=false; float edge=1.; float glass=1.;
  for(int i=0;i<56;i++){vec3 p=ro+rd*t;float d=map(p);if(d<.0015){hit=true;break;}t+=d*.95;if(t>7.)break;}
  if(hit){
    vec3 p=ro+rd*t; vec2 e=vec2(.0015,0.);
    edge=smoothstep(0.,.18,max(dot(-rd,normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)))),0.));
    vec3 n=normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));
    float fr=.04+.96*pow(1.-max(dot(-rd,n),0.),4.);
    vec3 refr=sky(refract(rd,n,.75));
    vec3 refl=sky(reflect(rd,n));
    vec3 tint=mix(mix(vec3(.78,1.,.9),vec3(.7,.86,1.),uNight),vec3(1.,.99,.96),uClear);
    vec3 body=refr*tint*1.05+vec3(.02,.05,.04);
    col=mix(body,refl*1.5+vec3(.05),fr);
    glass=clamp(.34+fr*1.25,0.,1.);
    vec3 sun=normalize(vec3(.55,.6,.6)); vec3 moon=normalize(vec3(-.5,.55,.65));
    vec3 r=reflect(rd,n);
    col+=vec3(1.,.82,.5)*pow(max(dot(r,sun),0.),70.)*(.6+uUV*2.4)*(1.-uNight);
    col+=vec3(.8,.9,1.)*pow(max(dot(r,moon),0.),90.)*1.4*uNight;
    float rim=pow(1.-max(dot(-rd,n),0.),2.);
    col+=mix(vec3(.95,.75,.4),vec3(.5,.7,.9),uNight)*rim*.28;
    vec3 q=local(p); float caus=(1.-smoothstep(-.5,.1,q.y))*max(dot(n,vec3(0.,-1.,0.)),0.);
    col+=vec3(1.,.8,.45)*caus*(.08+uUV*.25)*(1.-uNight);
    vec2 bu=vec2(atan(q.z,q.x)*2.2,q.y*3.2)*1.45; vec2 bid=floor(bu); vec2 bf=fract(bu)-.5;
    vec2 bo=(vec2(hash(bid+3.1),hash(bid+7.7))-.5)*.36; float br=.1+.1*hash(bid+1.9); float bon=step(.5,hash(bid));
    vec2 bd=bf-bo; float facing=smoothstep(.05,.45,max(dot(-rd,n),0.));
    float bm=(1.-smoothstep(br*.7,br,length(bd)))*bon*uHum*facing;
    float bh=(1.-smoothstep(0.,br*.4,length(bd-vec2(-.35,.35)*br)))*bon*uHum*facing;
    col=mix(col,col*.78+vec3(.02,.05,.04),bm*.8);
    col+=mix(vec3(1.,.95,.85),vec3(.85,.92,1.),uNight)*bh*.9;
    col=mix(col,vec3(.6,.57,.47),uHaze*.18);
  }
  float v=1.-smoothstep(.25,1.25,length(uv*vec2(.85,1.)));
  col*=mix(.72,1.,v);
  col+=(hash(gl_FragCoord.xy+fract(uTime))-.5)*.025;
  col=pow(max(col,0.),vec3(.95));
  if(uClear>.5){
    // Transparent mode: only the droplet and the haze specks are drawn; the page sky shows through.
    // Glass: see-through in the middle, solid at the rim; highlights stay bright.
    float a=hit?glass*mix(.6,1.,edge):clamp(dust*uHaze*.8,0.,.7);
    vec3 c=hit?col:vec3(.98,.92,.78);
    float spec=hit?clamp(max(max(col.r,col.g),col.b)-.85,0.,1.):0.;
    gl_FragColor=vec4(c*a+vec3(spec),min(1.,a+spec));
  } else {
    gl_FragColor=vec4(col,1.);
  }
}`;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Maps real readings to the scene's 0..1 controls. */
export function skyTargets(readings = {}, date = new Date()) {
  const uv = Math.max(Number(readings.uvi) || 0, Number(readings.uviMaxToday) || 0);
  const pm = Number(readings.pm25);
  const hum = Number(readings.humidity);
  const h = date.getHours() + date.getMinutes() / 60;
  // Fully night between 20:00 and 06:00, blending over the hour either side.
  const night = h >= 20 || h < 6 ? 1 : h >= 19 ? h - 19 : h < 7 ? 7 - h : 0;
  return {
    uv: clamp01(uv / 11),
    haze: Number.isFinite(pm) ? clamp01((pm - 12) / 60) : 0,
    hum: Number.isFinite(hum) ? clamp01((hum - 40) / 50) : 0.4,
    night: clamp01(night),
  };
}

let canvas = null;
let gl = null;
let uniforms = null;
let raf = 0;
let start = 0;
let target = { uv: 0.4, haze: 0, hum: 0.5, night: 0 };
let now = null;
let failed = false;
let options = {};

function reducedMotion() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function init() {
  canvas = document.createElement("canvas");
  canvas.className = "sky-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "low-power" });
  if (!ctx) { failed = true; return; }
  const shader = (type, src) => { const s = ctx.createShader(type); ctx.shaderSource(s, src); ctx.compileShader(s); return ctx.getShaderParameter(s, ctx.COMPILE_STATUS) ? s : null; };
  const vs = shader(ctx.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}");
  const fs = shader(ctx.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { failed = true; return; }
  const prog = ctx.createProgram();
  ctx.attachShader(prog, vs); ctx.attachShader(prog, fs); ctx.linkProgram(prog);
  if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) { failed = true; return; }
  ctx.useProgram(prog);
  const buf = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
  const loc = ctx.getAttribLocation(prog, "a");
  ctx.enableVertexAttribArray(loc);
  ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
  uniforms = Object.fromEntries(["uRes", "uTime", "uUV", "uHaze", "uHum", "uNight", "uShift", "uLift", "uClear", "uSkyTop", "uSkyBot"].map((n) => [n, ctx.getUniformLocation(prog, n)]));
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); failed = true; cancelAnimationFrame(raf); canvas.remove(); });
  gl = ctx;
  start = performance.now();
  // Stop drawing while the header is scrolled out of view.
  try { new IntersectionObserver((entries) => { visible = entries.some((e) => e.isIntersecting); }).observe(canvas); } catch { visible = true; }
}

let lastDraw = 0;
let visible = true;
function frame(t) {
  raf = 0;
  if (!gl || !canvas.isConnected) return;
  // About 30 frames a second is plenty for a slow drift and saves battery.
  if (t - lastDraw < 30 || !visible || document.hidden) { raf = requestAnimationFrame(frame); return; }
  lastDraw = t;
  // Rendered at up to 1x and scaled up: the scene is soft, and this keeps
  // older phones smooth.
  const dpr = Math.max(0.9, Math.min(window.devicePixelRatio || 1, 2) * 0.6);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (!w || !h) { raf = requestAnimationFrame(frame); return; }
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const still = reducedMotion();
  for (const k of Object.keys(target)) now[k] += (target[k] - now[k]) * (still ? 1 : 0.04);
  gl.viewport(0, 0, w, h);
  gl.uniform2f(uniforms.uRes, w, h);
  gl.uniform1f(uniforms.uTime, still ? 1.3 : (t - start) / 1000);
  gl.uniform1f(uniforms.uUV, now.uv);
  gl.uniform1f(uniforms.uHaze, now.haze);
  gl.uniform1f(uniforms.uHum, now.hum);
  gl.uniform1f(uniforms.uNight, now.night);
  // On a wide header the droplet sits to the right of the headline.
  gl.uniform1f(uniforms.uShift, options.clear ? 0 : w / h > 1.6 ? Math.min(1.6, (w / h - 1.2) * 0.9) : 0);
  // On a tall phone header the droplet floats above the headline.
  gl.uniform1f(uniforms.uLift, options.clear ? 0 : w / h < 1.3 ? 0.62 : 0);
  gl.uniform1f(uniforms.uClear, options.clear ? 1 : 0);
  gl.uniform3fv(uniforms.uSkyTop, options.top || [0.2, 0.4, 0.3]);
  gl.uniform3fv(uniforms.uSkyBot, options.bottom || [0.1, 0.2, 0.15]);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (!still || Object.keys(target).some((k) => Math.abs(target[k] - now[k]) > 0.002)) raf = requestAnimationFrame(frame);
}

/** Puts the living sky into `slot` and points it at these readings. Returns false when WebGL is unavailable. */
export function attachSky(slot, readings, opts = {}) {
  if (!slot || failed) return false;
  options = opts;
  if (!canvas) init();
  if (!gl) return false;
  target = skyTargets(readings);
  if (!now) now = { ...target };
  if (canvas.parentNode !== slot) slot.appendChild(canvas);
  slot.classList.add("has-sky");
  if (!raf) raf = requestAnimationFrame(frame);
  return true;
}

/** Hex colour to the shader's 0..1 RGB. */
export function hexToRgb01(hex) {
  const m = String(hex || "").replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : null;
}
