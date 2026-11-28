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

// Whiskey test bottles (only ever in memory; the real data is untouched). Coordinates are approximate.
const sp = (kind, producer, name, o) => Object.assign({kind, producer, name, style:'', age:'', abv:'', region:'', country:'', distillery:'', place:'', lat:null, lon:null,
  cask:'', grain:'', nose:[], palate:[], finish:[], serve:'', facts:[], labelPath:'', source:'manual', createdAt:'2026-11-27T00:00:00Z', updatedAt:'2026-11-27T00:00:00Z'}, o);
const MOCK_SPIRITS = {
  'lagavulin-16-year-old': sp('scotch', 'Lagavulin', '16 Year Old', {style:'Single malt', age:'16', abv:'43%', region:'Islay', country:'Scotland', distillery:'Lagavulin Distillery', place:'Port Ellen, Isle of Islay', lat:55.6355, lon:-6.1264,
    cask:'Ex-bourbon and ex-sherry casks', grain:'Peated malted barley', nose:['Peat smoke', 'Iodine', 'Dried fruit'], palate:['Smoky', 'Sherry sweetness', 'Sea salt'], finish:['Long', 'Smoky', 'Vanilla'], serve:'Neat, with a drop of water', facts:['Test fact one', 'Test fact two'],
    source:'research', sources:[{title:'Test source', url:'https://example.com/lagavulin'}]}),
  'laphroaig-10': sp('scotch', 'Laphroaig', '10', {style:'Single malt', age:'10 years', abv:'40%', region:'Islay', country:'Scotland', distillery:'Laphroaig Distillery', lat:55.6297, lon:-6.1525}),
  'springbank-10': sp('scotch', 'Springbank', '10', {style:'Single malt', age:'10', abv:'46%', region:'Campbeltown', country:'Scotland', distillery:'Springbank Distillery', place:'Campbeltown', lat:55.4253, lon:-5.6080}),
  'talisker-10': sp('scotch', 'Talisker', '10', {style:'Single malt', age:'10', abv:'45.8%', region:'Islands (Skye)', country:'Scotland', distillery:'Talisker Distillery', lat:57.3022, lon:-6.3567}),
  'glenfiddich-12': sp('scotch', 'Glenfiddich', '12', {style:'Single malt', age:'12', abv:'40%', region:'Speyside', country:'Scotland', distillery:'Glenfiddich Distillery', lat:57.4546, lon:-3.1284}),
  'the-macallan-12-sherry-oak': sp('scotch', 'The Macallan', '12 Sherry Oak', {style:'Single malt', age:'12', abv:'43%', region:'Speyside', country:'Scotland', distillery:'The Macallan Distillery', lat:57.4847, lon:-3.2066}),
  'glenmorangie-the-original': sp('scotch', 'Glenmorangie', 'The Original', {style:'Single malt', age:'10', abv:'40%', region:'Highlands', country:'Scotland', distillery:'Glenmorangie Distillery', lat:57.8277, lon:-4.0786}),
  'auchentoshan-american-oak': sp('scotch', 'Auchentoshan', 'American Oak', {style:'Single malt', abv:'40%', region:'Lowlands', country:'Scotland', distillery:'Auchentoshan Distillery', lat:55.9226, lon:-4.4386}),
  'buffalo-trace-kentucky-straight-bourbon': sp('bourbon', 'Buffalo Trace', 'Kentucky Straight Bourbon', {style:'Straight bourbon', abv:'45%', region:'Kentucky', country:'United States', distillery:'Buffalo Trace Distillery', place:'Frankfort, Kentucky', lat:38.2133, lon:-84.8697, grain:'Corn, rye, malted barley'}),
  'redbreast-12': sp('irish', 'Redbreast', '12', {style:'Single pot still', age:'12', abv:'40%', region:'County Cork', country:'Ireland', distillery:'Midleton Distillery', lat:51.9157, lon:-8.1745}),
  'yamazaki-12': sp('japanese', 'Yamazaki', '12', {style:'Single malt', age:'12', abv:'43%', region:'Osaka', country:'Japan', distillery:'Yamazaki Distillery', lat:34.8925, lon:135.6744}),
  'johnnie-walker-black-label': sp('scotch', 'Johnnie Walker', 'Black Label', {style:'Blended Scotch', age:'12', abv:'40%', country:'Scotland'})
};
const sb = (spirit, o) => Object.assign({spirit, status:'in', opened:false, openedOn:'', level:100, addedOn:'2026-11-20', finishedOn:'', purchasedOn:'', purchasedFrom:''}, o);
const MOCK_BOTTLES = {};
Object.keys(MOCK_SPIRITS).forEach((k, i) => { MOCK_BOTTLES['s-2026-11-20-' + k] = sb(k, i % 3 === 0 ? {opened:true, openedOn:'2026-11-21', level:[75, 50, 25, 10][i % 4]} : {}); });
MOCK_BOTTLES['s-2026-11-20-the-macallan-12-sherry-oak'] = sb('the-macallan-12-sherry-oak', {status:'finished', finishedOn:'2026-11-25', opened:true, level:10});
MOCK_BOTTLES['s-2026-10-01-glenfiddich-12-old'] = sb('glenfiddich-12', {status:'finished', finishedOn:'2026-10-30', opened:true});
function injectWhiskey(){
  const d = JSON.parse(readData('fridge.json').toString());
  d.spirits = MOCK_SPIRITS; d.spiritBottles = MOCK_BOTTLES; d.spiritTastings = {nadia:{'lagavulin-16-year-old':{stars:4, note:'Test note', updatedAt:'2026-11-26T03:00:00Z'}}};
  mem.set('fridge.json', Buffer.from(JSON.stringify(d, null, 1)));
}
const TILE = fs.readFileSync(path.join(__dirname, 'tile.png'));   // stands in for OpenStreetMap tiles
const NOMINATIM = [{lat:'55.6400', lon:'-6.1100', name:'Test Distillery', display_name:'Test Distillery, Port Ellen, Argyll and Bute, Scotland, United Kingdom', address:{village:'Port Ellen', county:'Argyll and Bute', country:'United Kingdom'}}];
const TYPES = {'.html':'text/html', '.png':'image/png', '.js':'application/javascript', '.css':'text/css'};

const server = http.createServer((req, res) => {
  const f = path.join(pagesDir, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if(fs.existsSync(f) && fs.statSync(f).isFile()){ res.writeHead(200, {'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream'}); res.end(fs.readFileSync(f)); }
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
    await p.route('https://tile.openstreetmap.org/**', r => r.fulfill({status:200, contentType:'image/png', body:TILE}));
    await p.route('https://nominatim.openstreetmap.org/**', r => r.fulfill({status:200, contentType:'application/json', headers:{'Access-Control-Allow-Origin':'*'}, body:JSON.stringify(NOMINATIM)}));
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
    const countries = await p.locator('#country option').allInnerTexts();
    await p.selectOption('#country', {index:1});
    console.log('country filter:', countries.join(' | '), '→', await p.locator('#country').inputValue(), 'items', await p.locator('.item').count(), 'lit slots', await p.locator('.slot.full:not(.dim)').count());
    await p.screenshot({path:outDir + '/country-filter.png'});
    await p.selectOption('#country', 'all');
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
  // 5. whiskey tab with no whiskey yet (whatever the data checkout holds)
  if(!Object.keys(JSON.parse(readData('fridge.json').toString()).spiritBottles || {}).length){
    const {p, errs, ctx} = await newPage(1280, 900, 'light', true);
    await p.goto(base + 'index.html#whiskey');
    await p.waitForSelector('#whiskeyCol:not([hidden]) .leaflet-container');
    await p.waitForTimeout(500);
    await p.screenshot({path:outDir + '/whiskey-empty.png'});
    await report('whiskey-empty', errs, p);
    await ctx.close();
  }
  // 6. whiskey tab with test bottles: desktop light
  injectWhiskey();
  const pinStats = p => p.evaluate(() => ({pins:document.querySelectorAll('#wmap path.pin').length, labels:[...document.querySelectorAll('#wmap .pinlabel')].filter(e => e.style.visibility !== 'hidden').map(e => e.textContent), dim:document.querySelectorAll('#wmap path.pin.dim').length}));
  {
    const {p, errs, ctx} = await newPage(1280, 1100, 'light', true);
    await p.goto(base + 'index.html#whiskey');
    await p.waitForSelector('#wmap path.pin');
    await p.waitForTimeout(700);
    console.log('whiskey overview:', JSON.stringify(await pinStats(p)));
    await p.screenshot({path:outDir + '/whiskey-desktop.png'});
    await p.click('#wKinds [data-wkind="scotch"]');
    await p.waitForTimeout(900);
    console.log('scotch only:', JSON.stringify(await pinStats(p)));
    await p.screenshot({path:outDir + '/whiskey-scotch.png'});
    await p.click('#wLegend [data-wrg="islay"]');
    await p.waitForTimeout(900);
    console.log('islay:', JSON.stringify(await pinStats(p)), 'items', await p.locator('.item').count());
    await p.screenshot({path:outDir + '/whiskey-islay.png'});
    await p.click('#wLegend [data-wrg="islay"]');
    await p.click('#wKinds [data-wkind="all"]');
    await p.waitForTimeout(600);
    await p.locator('#wmap path.pin.rg-campbeltown').click({force:true});
    await p.waitForSelector('.item.open .cmap .leaflet-container');
    await p.waitForTimeout(700);
    console.log('pin click opened:', await p.locator('.item.open .it-prod').innerText());
    await p.screenshot({path:outDir + '/whiskey-pin-open.png'});
    await p.click('[data-act="wtoggle"][data-id="s-2026-11-20-lagavulin-16-year-old"]');
    await p.waitForSelector('.item.open .cmap .leaflet-container');
    await p.waitForTimeout(700);
    await p.click('.item.open [data-act="wlevel"][data-v="50"]');
    await p.waitForTimeout(300);
    await p.click('.item.open [data-act="star"][data-sc="spirit"][data-v="5"]');
    await p.waitForTimeout(400);
    await p.locator('.item.open').screenshot({path:outDir + '/whiskey-card.png'});
    await p.click('.item.open [data-act="wfinish"]');
    await p.waitForTimeout(500);
    await p.click('#wSub [data-wsub="finished"]');
    await p.waitForSelector('[data-act="wftoggle"]');
    await p.click('[data-act="wftoggle"][data-key="glenfiddich-12"]');
    await p.waitForTimeout(700);
    await p.screenshot({path:outDir + '/whiskey-finished.png', fullPage:true});
    await report('whiskey-desktop', errs, p);
    await ctx.close();
  }
  // 7. whiskey phone dark: overview, add sheet with the distillery finder
  {
    const {p, errs, ctx} = await newPage(400, 1500, 'dark', true);
    await p.goto(base + 'index.html#whiskey');
    await p.waitForSelector('#wmap path.pin');
    await p.waitForTimeout(700);
    await p.screenshot({path:outDir + '/whiskey-phone-dark.png', fullPage:true});
    await p.click('[data-act="wtoggle"][data-id="s-2026-11-20-buffalo-trace-kentucky-straight-bourbon"]');
    await p.waitForSelector('.item.open .cmap .leaflet-container');
    await p.waitForTimeout(700);
    await p.locator('.item.open').screenshot({path:outDir + '/whiskey-card-phone-dark.png'});
    await p.click('#addBtn');
    await p.waitForSelector('#wPickMap .leaflet-container');
    await p.fill('#wProducer', 'Test Distillery'); await p.fill('#wName', '12 Year Old'); await p.fill('#wAbv', '46');
    await p.fill('#wDist', 'Test Distillery');
    await p.click('#wFind');
    await p.waitForSelector('[data-found="0"]');
    await p.screenshot({path:outDir + '/whiskey-sheet-find.png'});
    await p.click('[data-found="0"]');
    await p.waitForTimeout(500);
    await p.click('#wLevel [data-wl="75"]');
    console.log('sheet pin:', await p.locator('#wLL').innerText(), '| place:', await p.inputValue('#wPlace'));
    await p.screenshot({path:outDir + '/whiskey-sheet-pinned.png'});
    await p.click('#wSave');
    await p.waitForTimeout(900);
    console.log('added open:', await p.locator('.item.open .it-prod').innerText().catch(() => 'none'));
    await report('whiskey-phone', errs, p);
    await ctx.close();
  }
  console.log('writes:', puts);
  for(const [k, v] of mem){ if(k.endsWith('.json')){ const d = JSON.parse(v.toString()); console.log(k, 'bottles:', Object.keys(d.bottles || {}).length, 'spiritBottles:', Object.keys(d.spiritBottles || {}).length, 'tastings:', JSON.stringify(d.tastings), 'spiritTastings:', JSON.stringify(d.spiritTastings)); } }
  const fin = mem.get('fridge.json') && JSON.parse(mem.get('fridge.json').toString());
  if(fin){ const added = Object.entries(fin.spiritBottles || {}).find(([id]) => id.includes('test-distillery')); console.log('added whiskey:', JSON.stringify(added), JSON.stringify(fin.spirits['test-distillery-12-year-old'])); }
  await browser.close(); server.close();
});
