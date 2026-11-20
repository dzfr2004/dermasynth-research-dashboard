const { chromium } = require('playwright');
const fs = require('fs');
const PORT = process.env.PORT || 4173; const OUT = 'frames'; fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4/3, timezoneId: 'Asia/Kuala_Lumpur' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:'+PORT); await p.waitForTimeout(1500);
  // fake cursor
  const cursorJs = () => {
    const c=document.createElement('div'); c.id='fc';
    c.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.6L20 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style,{position:'fixed',left:'0',top:'0',zIndex:2147483647,pointerEvents:'none',transform:'translate(700px,400px)',transition:'none'});
    document.body.appendChild(c);
    const st=document.createElement('style'); st.textContent='.fc-r{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid rgba(226,118,44,.9);pointer-events:none;z-index:2147483646;animation:fcr .55s ease-out forwards}@keyframes fcr{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}';
    document.head.appendChild(st);
    window.__fc=(x,y)=>{c.style.transform=`translate(${x-3}px,${y-2}px)`};
    window.__ripple=(x,y)=>{const r=document.createElement('div');r.className='fc-r';r.style.left=x+'px';r.style.top=y+'px';document.body.appendChild(r);setTimeout(()=>r.remove(),700)};
  };
  await p.evaluate(cursorJs);
  let cx=700, cy=400;
  const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  async function moveTo(x,y,ms=700){ const n=Math.max(8,Math.round(ms/16)); const x0=cx,y0=cy;
    for(let i=1;i<=n;i++){const t=ease(i/n); const xx=x0+(x-x0)*t, yy=y0+(y-y0)*t; await p.mouse.move(xx,yy); await p.evaluate(([a,b])=>window.__fc(a,b),[xx,yy]); await p.waitForTimeout(16);} cx=x;cy=y; }
  async function click(loc,{pause=350}={}){ await loc.scrollIntoViewIfNeeded(); const bb=await loc.boundingBox(); const x=bb.x+bb.width/2, y=bb.y+bb.height/2;
    await moveTo(x,y); await p.waitForTimeout(150); await p.evaluate(([a,b])=>window.__ripple(a,b),[x,y]); await p.mouse.click(x,y); await p.waitForTimeout(pause); }
  async function scrollTo(target, ms=1100){ // target: y or locator
    let y = typeof target==='number'? target : await target.evaluate(e=>e.getBoundingClientRect().top+window.scrollY-110);
    await p.evaluate(async ([y,ms])=>{const y0=scrollY, d=y-y0, t0=performance.now(); await new Promise(r=>{function f(t){const k=Math.min(1,(t-t0)/ms); const e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2; scrollTo(0,y0+d*e); k<1?requestAnimationFrame(f):r()} requestAnimationFrame(f)})},[y,ms]);
    await p.waitForTimeout(200);
  }
  // screencast
  const cdp = await ctx.newCDPSession(p); const frames=[];
  cdp.on('Page.screencastFrame', async f => { const i=frames.length; fs.writeFileSync(`${OUT}/f${String(i).padStart(5,'0')}.jpg`, Buffer.from(f.data,'base64')); frames.push(f.metadata.timestamp); cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{}); });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
  // keep frames flowing during holds
  const hold = async ms => { const t=Date.now(); while(Date.now()-t<ms){ await p.evaluate(()=>{document.body.style.outline=document.body.style.outline?'':'0px solid transparent'}); await p.waitForTimeout(100);} };

  await hold(1800);
  // 1. profile
  await click(p.locator('[data-action=profile]').filter({hasText:'Combination'}));
  await hold(500);
  await scrollTo(p.locator('[data-action=simulate]'),1300);
  await hold(400);
  await click(p.locator('[data-action=simulate]'));
  await hold(1200); await cdp.send('Page.stopScreencast');
  await p.locator('#consumer-routine-title').waitFor({state:'visible',timeout:180000}); await p.waitForTimeout(1500);
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
  await hold(1000);
  await scrollTo(0,1000);
  await hold(1600);
  // 2. routine + why
  await scrollTo(p.locator('#consumer-routine-title'),1100); await hold(1500);
  const why = p.locator('[data-action=toggle-why]').filter({hasText:'Sun protection'});
  await click(why); await hold(2600);
  await scrollTo(p.locator('[data-action=toggle-why]').filter({hasText:'Niacinamide'}),1200); await hold(1600);
  await click(p.locator('[data-action=toggle-why]').filter({hasText:'Niacinamide'})); await hold(2400);
  // 3. product check
  await scrollTo(p.locator('#pc-title'),1300); await hold(800);
  await click(p.locator('[data-action=pc-example]')); await hold(900);
  await click(p.locator('[data-action=pc-run]')); await hold(800);
  await scrollTo(p.locator('#pc-title'),600); await p.mouse.wheel(0,0);
  const pcres = p.locator('#pc-result, .pc-result').first();
  if (await pcres.count()) await scrollTo(pcres,900);
  await hold(3000);
  // 4. weather page: readings, UV curve and the seven-day planner when a live forecast exists
  await click(p.locator('[data-action=navigate]').filter({hasText:'Weather'}).first()); await hold(2600);
  for (const sel of ['text=This week']) { const l=p.locator(sel).first(); if (await l.count() && await l.isVisible().catch(()=>false)) { await scrollTo(l,1300); await hold(3000); } }
  await scrollTo(0,900);
  await click(p.locator('[data-action=navigate]').filter({hasText:'Today'}).first()); await hold(800);
  // 5. symptom referral
  const sym=p.locator('#symptoms');
  if (!(await sym.isVisible())) { const sm=p.locator('summary').filter({hasText:'More about your skin'}); await scrollTo(sm,1000); await click(sm); }
  await scrollTo(sym,1000); await click(sym,{pause:200});
  await p.keyboard.type('My lips are swelling and it is hard to breathe', {delay:45});
  await hold(600);
  await scrollTo(p.locator('[data-action=simulate]'),700);
  await click(p.locator('[data-action=simulate]')); await hold(1500);
  await scrollTo(0,1000); await hold(800);
  const red=p.locator('text=We won').first(); if (await red.count()) await scrollTo(red,900);
  await hold(3500);
  await cdp.send('Page.stopScreencast');
  fs.writeFileSync('times.json', JSON.stringify(frames));
  await b.close();
  console.log('frames', frames.length, 'dur', (frames.at(-1)-frames[0]).toFixed(1));
})();
