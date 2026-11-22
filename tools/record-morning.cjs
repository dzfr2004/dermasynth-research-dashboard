// Records "a morning with DermaSynth": dawn UI (clock set to 7:00 AM KL), real user flow.
// Usage: node record-morning.cjs [url]   (default: the live site). Writes frames/, times.json, scenes.json
const { chromium } = require('playwright');
const fs = require('fs');
const URL_ = process.argv[2] || process.env.DEMO_URL || 'https://dermasynth-research-dashboard.vercel.app';
const OUT = 'frames'; fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT);
const kl = new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
const TARGET = Date.parse(`${kl}T07:00:00+08:00`);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:1440,height:810}, deviceScaleFactor:4/3, timezoneId:'Asia/Kuala_Lumpur', acceptDownloads:true });
  await ctx.addInitScript(([target]) => {
    const RealDate = Date; const off = target - RealDate.now();
    class FakeDate extends RealDate { constructor(...a){ if (a.length) super(...a); else super(RealDate.now()+off); } static now(){ return RealDate.now()+off; } }
    window.Date = FakeDate;
    try { sessionStorage.setItem('study.invite.dismissed','1'); } catch(e){}
  }, [TARGET]);
  const p = await ctx.newPage(); p.on('dialog',d=>d.dismiss().catch(()=>{}));
  await p.goto(URL_, {waitUntil:'networkidle', timeout:120000}).catch(()=>{}); await p.waitForTimeout(2500);
  await p.evaluate(()=>{ for (const b of document.querySelectorAll('button')) if (/not now|no thanks|maybe later|dismiss/i.test(b.textContent||'')) { b.click(); } });
  await p.evaluate(() => {
    const c=document.createElement('div'); c.id='fc';
    c.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.6L20 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style,{position:'fixed',left:'0',top:'0',zIndex:2147483647,pointerEvents:'none',transform:'translate(700px,400px)'});
    document.body.appendChild(c);
    const st=document.createElement('style'); st.textContent='.fc-r{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid rgba(226,118,44,.9);pointer-events:none;z-index:2147483646;animation:fcr .55s ease-out forwards}@keyframes fcr{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}';
    document.head.appendChild(st);
    window.__fc=(x,y)=>{c.style.transform=`translate(${x-3}px,${y-2}px)`};
    window.__ripple=(x,y)=>{const r=document.createElement('div');r.className='fc-r';r.style.left=x+'px';r.style.top=y+'px';document.body.appendChild(r);setTimeout(()=>r.remove(),700)};
  });
  let cx=700, cy=400; const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  async function moveTo(x,y,ms=650){ const n=Math.max(8,Math.round(ms/16)); const x0=cx,y0=cy;
    for(let i=1;i<=n;i++){const t=ease(i/n); const xx=x0+(x-x0)*t, yy=y0+(y-y0)*t; await p.mouse.move(xx,yy); await p.evaluate(([a,b])=>window.__fc&&window.__fc(a,b),[xx,yy]); await p.waitForTimeout(16);} cx=x;cy=y; }
  async function click(loc,{pause=350}={}){ await loc.scrollIntoViewIfNeeded(); const bb=await loc.boundingBox(); const x=bb.x+bb.width/2, y=bb.y+bb.height/2;
    await moveTo(x,y); await p.waitForTimeout(150); await p.evaluate(([a,b])=>window.__ripple&&window.__ripple(a,b),[x,y]); await p.mouse.click(x,y); await p.waitForTimeout(pause); }
  async function scrollTo(target, ms=1100){ let y = typeof target==='number'? target : await target.evaluate(e=>e.getBoundingClientRect().top+window.scrollY-110);
    await p.evaluate(async ([y,ms])=>{const y0=scrollY, d=y-y0, t0=performance.now(); await new Promise(r=>{function f(t){const k=Math.min(1,(t-t0)/ms); const e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2; scrollTo(0,y0+d*e); k<1?requestAnimationFrame(f):r()} requestAnimationFrame(f)})},[y,ms]); await p.waitForTimeout(200); }
  const A=(a,t)=>{const l=p.locator(`[data-action="${a}"]`); return (t?l.filter({hasText:t}):l).first();};
  const vis=async l=>(await l.count()) && await l.isVisible().catch(()=>false);
  const tryClick=async(l,o)=>{ try{ if(await vis(l)){ await click(l,o); return true; } }catch(e){ console.log('skip',e.message.split('\n')[0]); } return false; };
  const cdp=await ctx.newCDPSession(p); const frames=[]; const scenes=[];
  cdp.on('Page.screencastFrame', async f=>{ const i=frames.length; fs.writeFileSync(`${OUT}/f${String(i).padStart(5,'0')}.jpg`, Buffer.from(f.data,'base64')); frames.push(f.metadata.timestamp); cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{}); });
  const start=()=>cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
  const scene=(id)=>{ scenes.push({id, t: frames.length? frames[frames.length-1] : null, frame: frames.length}); console.log('scene',id,frames.length); };
  const hold=async ms=>{ const t=Date.now(); while(Date.now()-t<ms){ await p.evaluate(()=>{document.body.style.outline=document.body.style.outline?'':'0px solid transparent'}); await p.waitForTimeout(100);} };
  const waitRun=async()=>{ await cdp.send('Page.stopScreencast'); await p.locator('#consumer-routine-title, .clinical-redirect').first().waitFor({state:'visible',timeout:180000}).catch(()=>{}); await p.waitForTimeout(1500); await start(); };
  await start(); await hold(600);

  scene('wake');            // 1. 7 AM: open the app, today's sky and readings
  await hold(3500);
  scene('weather');         // 2. check today's weather in detail
  await tryClick(A('navigate','Weather')); await hold(2500);
  const curve=p.locator('svg').filter({has:p.locator('path')}).nth(1); await scrollTo(300,1200); await hold(3000);
  await scrollTo(0,900); await tryClick(A('navigate','Today')); await hold(1200);
  scene('profile');         // 3. tell it about your skin
  const lq=A('location-query'); if (await vis(lq) && !(await lq.inputValue().catch(()=>''))) { await click(lq,{pause:120}); await p.keyboard.type('Kuala Lumpur',{delay:45}); await tryClick(A('location-search')); await hold(1500); await tryClick(A('select-location')); await hold(1200); }
  await scrollTo(A('profile','Combination'),900);
  await tryClick(A('profile','Combination')); await hold(400);
  await tryClick(A('concern-choice','Breakouts')); await hold(300);
  await tryClick(A('concern-choice','Uneven tone')); await hold(500);
  const more=p.locator('summary').filter({hasText:/More about your skin/i}).first();
  if (await vis(more)) { await click(more); await hold(400); const ex=p.locator('#exposure-context'); if (await vis(ex)) { await ex.scrollIntoViewIfNeeded(); const bb=await ex.boundingBox(); await moveTo(bb.x+bb.width/2,bb.y+bb.height/2,500); await ex.selectOption('outdoors'); await hold(700);} }
  scene('build');           // 4. build today's routine
  await scrollTo(A('simulate'),800); await click(A('simulate')); await hold(1000);
  await waitRun(); await scrollTo(0,800); await hold(1500);
  scene('routine');         // 5. read the routine
  await scrollTo(p.locator('#consumer-routine-title'),1100); await hold(2500);
  scene('why');             // 6. why this?
  const why=A('toggle-why','Sun protection').or(A('toggle-why','sunscreen')).first();
  const why1=(await vis(why))? why : A('toggle-why');
  await scrollTo(why1,900); await tryClick(why1); await hold(3200);
  await tryClick(A('step-done')); await hold(900);
  scene('product');         // 7. check a product I already own
  const pce=A('pc-example'); if (await vis(pce)) { await scrollTo(pce,1000); await click(pce); await hold(800); await tryClick(A('pc-run')); await hold(1500);
    const r=p.locator('#pc-result, .pc-result').first(); if (await vis(r)) await scrollTo(r,900); await hold(3200); }
  scene('week');            // 8. plan the week
  const sw=p.locator('[data-action=result-view][data-view=week]').first();
  if (await vis(sw) || await sw.count()) { await scrollTo(sw,900); await tryClick(sw); await hold(2200);
    const grid=p.locator('text=This week').first(); if (await vis(grid)) await scrollTo(grid,900); await hold(3500);
    await tryClick(p.locator('[data-action=result-view][data-view=today]').first()); await hold(800); }
  scene('remind');          // 9. save it and set reminders
  await tryClick(A('save-my-routine')); await hold(1400);
  await tryClick(A('reminders')); await hold(1400);
  scene('symptom');         // 10. something feels wrong: report a symptom
  const tell=A('redirect-edit','Tell us'); 
  if (await vis(tell)) { await scrollTo(tell,900); await click(tell); await hold(900); }
  const sym=p.locator('#symptoms');
  if (!(await vis(sym))) { const sm=p.locator('summary').filter({hasText:/More about your skin/i}).first(); if (await vis(sm)) { await scrollTo(sm,900); await click(sm); } }
  await scrollTo(sym,900); await click(sym,{pause:200});
  await p.keyboard.type('My lips are swelling and it is hard to breathe',{delay:45}); await hold(500);
  await scrollTo(A('simulate'),700); await click(A('simulate')); await hold(800);
  await waitRun();
  scene('referral');        // 11. referral
  const red=p.locator('.clinical-redirect').first(); if (await vis(red)) await scrollTo(red,900);
  await hold(5000);
  scene('end');
  await cdp.send('Page.stopScreencast');
  fs.writeFileSync('times.json', JSON.stringify(frames)); fs.writeFileSync('scenes.json', JSON.stringify(scenes));
  await b.close(); console.log('frames', frames.length, 'dur', (frames.at(-1)-frames[0]).toFixed(1));
})();
