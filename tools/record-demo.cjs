const { chromium } = require('playwright');
const fs = require('fs');
const PORT = process.env.PORT || 4173; const OUT = 'frames'; fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4/3, timezoneId: 'Asia/Kuala_Lumpur' });
  const p = await ctx.newPage(); p.on('dialog',d=>d.dismiss().catch(()=>{}));
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


  const A = (a,t) => { const l=p.locator(`[data-action="${a}"]`); return (t? l.filter({hasText:t}) : l).first(); };
  const vis = async l => (await l.count()) && await l.isVisible().catch(()=>false);
  const tryClick = async (l,o) => { try { if (await vis(l)) { await click(l,o); return true; } } catch(e){ console.log('skip', e.message.split('\n')[0]); } return false; };
  const nav = async t => { await scrollTo(0,700); await tryClick(A('navigate',t)); await hold(1200); };
  const pick = async (sel,val) => { const l=p.locator(sel); if (!(await vis(l))) return; await l.scrollIntoViewIfNeeded(); const bb=await l.boundingBox(); await moveTo(bb.x+bb.width/2,bb.y+bb.height/2,500); await p.evaluate(([a,b])=>window.__ripple(a,b),[bb.x+bb.width/2,bb.y+bb.height/2]); await l.selectOption(val); await hold(700); };
  const waitRun = async () => { await cdp.send('Page.stopScreencast'); await p.locator('#consumer-routine-title, .clinical-redirect').first().waitFor({state:'visible',timeout:180000}).catch(()=>{}); await p.waitForTimeout(1500); await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:1080,everyNthFrame:1}); };

  await hold(2000);
  // 1. Today: location search
  const lq=A('location-query');
  if (await vis(lq)) { await click(lq,{pause:150}); await lq.fill(''); await p.keyboard.type('Kuala Lumpur',{delay:50}); await tryClick(A('location-search')); await hold(1800);
    await tryClick(A('select-location')); await hold(1500); }
  // 2. Profile, concerns and preferences
  await scrollTo(A('profile','Combination'),900);
  await tryClick(A('profile','Combination')); await hold(500);
  await tryClick(A('concern-choice','Breakouts')); await hold(400);
  await tryClick(A('concern-choice','Uneven tone')); await hold(600);
  const more=p.locator('summary').filter({hasText:'More about your skin'});
  if (await vis(more)) { await scrollTo(more,800); await click(more); await hold(600); }
  await pick('#finish-preference','matte'); await pick('#reactivity-level','moderate'); await pick('#exposure-context','mixed');
  // 3. Build routine
  await scrollTo(A('simulate'),900); await hold(300); await click(A('simulate')); await hold(1200);
  await waitRun(); await hold(800); await scrollTo(0,900); await hold(1500);
  // 4. Routine: tick, why, share story, save, reminders
  await scrollTo(p.locator('#consumer-routine-title'),1100); await hold(1500);
  await tryClick(A('step-done')); await hold(900);
  await tryClick(A('toggle-why','Sun protection')); await hold(2600);
  const why2=A('toggle-why','moisturiser'); if (await vis(why2)) { await scrollTo(why2,900); await tryClick(why2); await hold(2400); }
  const story=A('story-open'); if (await vis(story)) { await scrollTo(story,900); await click(story); await hold(3200); await tryClick(p.locator('.story-close')); await hold(800); }
  await tryClick(A('save-my-routine')); await hold(1600);
  await tryClick(A('reminders')); await hold(1600);
  // 5. Product check
  const pce=A('pc-example'); if (await vis(pce)) { await scrollTo(pce,1000); await click(pce); await hold(900); await tryClick(A('pc-run')); await hold(1200);
    const r=p.locator('#pc-result, .pc-result').first(); if (await vis(r)) await scrollTo(r,900); await hold(3000); }
  // 6. Weather page: readings, UV curve, seven-day planner
  await nav('Weather'); await hold(1800);
  const wk=p.locator('text=This week').first(); if (await vis(wk)) { await scrollTo(wk,1300); await hold(3000);
    for (const v of await p.locator('[data-action=result-view]').all()) { await tryClick(v); await hold(1500); } }
  await scrollTo(99999,1600); await hold(1500);
  // 7. My shelf: add a product
  await nav('My shelf');
  if (await tryClick(A('shelf-add'))) { await hold(700);
    const nm=p.locator('#shelf-name'); if (await vis(nm)) { await click(nm,{pause:100}); await p.keyboard.type('Daily Niacinamide Serum',{delay:40}); }
    await tryClick(A('shelf-type','Serum')); await hold(400);
    const tx=p.locator('#shelf-text'); if (await vis(tx)) { await click(tx,{pause:100}); await p.keyboard.type('Aqua, Niacinamide, Glycerin, Zinc PCA, Panthenol',{delay:25}); }
    await tryClick(A('shelf-save')); await hold(2200); }
  // 8. Ingredients atlas
  await nav('Ingredients');
  const kq=A('knowledge-query'); if (await vis(kq)) { await click(kq,{pause:100}); await p.keyboard.type('niacinamide',{delay:60}); await tryClick(A('knowledge-search')); await hold(2500); }
  await tryClick(A('knowledge-concern','Breakouts')); await hold(2000);
  await scrollTo(400,900); await hold(1500);
  // 9. Expert view: evidence records and the defence walkthrough
  await scrollTo(0,700); await tryClick(A('toggle-expert')); await hold(2000);
  await tryClick(A('relationship-filter','Breakouts')); await hold(1500);
  await tryClick(A('relationship-select','Azelaic')); await hold(2500);
  if (await tryClick(A('presentation-start'))) { await hold(1500);
    for (let i=0;i<10;i++){ if (await tryClick(A('presentation-next'))) { await hold(2200); continue; } if (await tryClick(A('presentation-skip'))) { await hold(1500); continue; } break; }
    await tryClick(A('presentation-close')); await hold(800); }
  await scrollTo(0,700); await tryClick(A('toggle-expert')); await hold(1000);
  // 10. Symptom referral
  await nav('Today');
  const sym=p.locator('#symptoms');
  if (!(await vis(sym))) { const sm=p.locator('summary').filter({hasText:'More about your skin'}); await scrollTo(sm,1000); await click(sm); }
  await scrollTo(sym,1000); await click(sym,{pause:200});
  await p.keyboard.type('My lips are swelling and it is hard to breathe',{delay:45}); await hold(600);
  await scrollTo(A('simulate'),700); await click(A('simulate')); await hold(1200);
  await waitRun();
  const red=p.locator('.clinical-redirect').first(); if (await vis(red)) await scrollTo(red,900);
  await hold(3500);
  await tryClick(A('redirect-edit','Change')); await hold(2000);
  await cdp.send('Page.stopScreencast');
  fs.writeFileSync('times.json', JSON.stringify(frames));
  await b.close();
  console.log('frames', frames.length, 'dur', (frames.at(-1)-frames[0]).toFixed(1));
})();
