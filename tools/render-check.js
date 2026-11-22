// Render and exercise the GitHub Pages apps against a fake GitHub API (no network, no token).
// usage: node tools/render-check.js <pages dir> <data dir (a checkout of fridge-data)> <out dir>
// Serves the pages on localhost, answers api.github.com from <data dir> (PUTs are kept in memory),
// clicks through the main flows, saves screenshots to <out dir>, and prints errors and write counts.
const fs = require('fs'), path = require('path'), http = require('http');
const {chromium} = require('playwright');
const [,, pagesDir, dataDir, outDir] = process.argv;
fs.mkdirSync(outDir, {recursive:true});

const mem = new Map(); // path -> Buffer (writes)
const puts = [];
const readData = p => mem.has(p) ? mem.get(p) : (fs.existsSync(path.join(dataDir, p)) ? fs.readFileSync(path.join(dataDir, p)) : null);
let shaN = 1;

const server = http.createServer((req, res) => {
  const f = path.join(pagesDir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if(fs.existsSync(f) && fs.statSync(f).isFile()){ res.writeHead(200, {'Content-Type': f.endsWith('.html') ? 'text/html' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream'}); res.end(fs.readFileSync(f)); }
  else { res.writeHead(404); res.end(); }
}).listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  async function newPage(w, h, scheme, setup){
    const ctx = await browser.newContext({viewport:{width:w, height:h}, colorScheme:scheme});
    if(setup) await ctx.addInitScript(() => { localStorage.setItem('fridge_token', 'test-token'); localStorage.setItem('fridge_person', 'chad'); });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if(m.type() === 'error' && !/fonts|ERR_TUNNEL|ERR_NAME|ERR_CONNECTION|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200, contentType:'text/css', body:''}));
    await p.route('https://api.github.com/**', async route => {
      const req = route.request();
      const u = new URL(req.url());
      const m = /^\/repos\/[^/]+\/[^/]+(?:\/contents\/(.+))?$/.exec(u.pathname);
      if(!m) return route.fulfill({status:404, body:'{}'});
      if(!m[1]) return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({permissions:{push:true}})});
      const p2 = decodeURIComponent(m[1]);
      if(req.method() === 'PUT'){
        const body = JSON.parse(req.postData());
        mem.set(p2, Buffer.from(body.content, 'base64'));
        puts.push(body.message);
        return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({content:{sha:'sha' + (++shaN)}})});
      }
      const buf = readData(p2);
      if(!buf) return route.fulfill({status:404, body:'{}'});
      if((req.headers()['accept'] || '').includes('raw')) return route.fulfill({status:200, body:buf, contentType:'application/octet-stream'});
      return route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({content:buf.toString('base64'), encoding:'base64', sha:'sha' + shaN})});
    });
    return {p, errs, ctx};
  }
  const report = (name, errs, p) => p.evaluate(() => document.documentElement.scrollWidth > innerWidth).then(ov => console.log(name, 'overflow:', ov, 'errors:', errs));

  // 1. fridge, desktop light: open a bottle, finish it, rate another
  {
    const {p, errs, ctx} = await newPage(1280, 1300, 'light', true);
    await p.goto(base + 'index.html');
    await p.waitForSelector('.slot.full');
    await p.click('[data-slot="r1c3"]');
    await p.waitForTimeout(400);
    await p.screenshot({path:outDir + '/fridge-desktop.png', fullPage:true});
    await p.click('.item.open [data-act="star"][data-v="4"]');
    await p.waitForTimeout(300);
    await p.click('.item.open [data-act="finish"]');
    await p.waitForTimeout(500);
    await p.click('#tab-finished');
    await p.waitForSelector('[data-act="ftoggle"]');
    await p.click('[data-act="ftoggle"]');
    await p.waitForTimeout(500);
    await p.screenshot({path:outDir + '/finished-desktop.png', fullPage:true});
    await report('fridge-desktop', errs, p);
    await ctx.close();
  }
  // 2. phone dark, add sheet
  {
    const {p, errs, ctx} = await newPage(400, 1400, 'dark', true);
    await p.goto(base + 'index.html');
    await p.waitForSelector('.slot.full');
    await p.click('[data-act="toggle"]');
    await p.waitForTimeout(300);
    await p.screenshot({path:outDir + '/fridge-phone-dark.png', fullPage:true});
    await p.click('#addBtn');
    await p.fill('#fProducer', 'Test Producer'); await p.fill('#fName', 'Test Wine'); await p.fill('#fVintage', '2021');
    await p.click('#saveBtn');
    await p.waitForTimeout(600);
    await report('fridge-phone', errs, p);
    await ctx.close();
  }
  // 3. first visit: setup screen
  {
    const {p, errs, ctx} = await newPage(400, 800, 'light', false);
    await p.goto(base + 'index.html');
    await p.waitForSelector('.connect');
    await p.screenshot({path:outDir + '/setup-phone.png'});
    await report('setup', errs, p);
    await ctx.close();
  }
  // 4. club page
  if(fs.existsSync(path.join(pagesDir, 'club.html'))){
    const {p, errs, ctx} = await newPage(1280, 1300, 'light', true);
    await p.goto(base + 'club.html');
    await p.waitForSelector('.wine');
    await p.screenshot({path:outDir + '/club-desktop.png', fullPage:true});
    const st = p.locator('[data-act="status"][data-v="opened"]').first();
    if(await st.count()) { await st.click(); await p.waitForTimeout(500); }
    await report('club-desktop', errs, p);
    await ctx.close();
    const ph = await newPage(400, 1600, 'dark', true);
    await ph.p.goto(base + 'club.html');
    await ph.p.waitForSelector('.wine');
    await ph.p.screenshot({path:outDir + '/club-phone-dark.png', fullPage:true});
    await report('club-phone', ph.errs, ph.p);
    await ph.ctx.close();
  }
  console.log('writes:', puts);
  for(const [k, v] of mem){ if(k.endsWith('.json')){ const d = JSON.parse(v.toString()); console.log(k, 'bottles:', Object.keys(d.bottles || {}).length, 'tastings:', JSON.stringify(d.tastings)); } }
  await browser.close(); server.close();
});
