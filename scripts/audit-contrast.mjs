// Full-app contrast + missing-token audit.
//
//   node scripts/audit-contrast.mjs           (after `npm run build`)
//
// Renders one of every surface pattern the app uses against all 30 themes x 4
// depth levels x light/dark appearance = 240 combinations, and reports any
// text that falls under its contrast floor or any surface that computes to
// transparent.
//
// It exists because three rounds of eyeballing screenshots missed a CSS cycle
// that left every card with NO BACKGROUND — a transparent card on a tinted
// page looks exactly like a tinted card. This checks computed styles instead,
// which found that in about a minute, plus 245 other issues including four
// themes that kept white cards on a dark phone because they were declared
// after the auto-dark block and won the specificity tie on source order.
//
// Point it at the built stylesheet:
//   cp .next/static/css/*.css /tmp/app.css   and set CSS below.
import { chromium } from 'playwright';
import fs from 'fs';

const SRC = fs.readFileSync('./src/components/ThemeProvider.tsx','utf8');
const THEMES = [...SRC.matchAll(/\{\s*id:\s*"([a-z0-9]+)"/g)].map(m=>m[1]);
const LEVELS = ['off','20','35','50'];
const APPEAR = [null, 'dark'];

const b = await chromium.launch({});
const p = await b.newPage({viewport:{width:420,height:800}});
await p.goto('about:blank');

// A page containing one of every surface pattern the app uses.
await p.evaluate(()=>{
  document.body.className='app-bg';
  document.body.innerHTML = `
    <div id="chrome" style="background:var(--chrome-grad);padding:14px;color:#fff">Symmetry</div>
    <div class="card" id="card" style="padding:14px">
      <span id="cardText" style="color:var(--brand-text)">Body Weight</span>
      <span id="cardSec" style="color:var(--brand-text-secondary)">Tap to expand</span>
      <span id="cardPri" style="color:var(--brand-primary)">Open</span>
      <div id="row" style="background:var(--brand-bg);padding:9px">
        <span id="rowText" style="color:var(--brand-text)">Leg Press</span>
        <span id="rowSec" style="color:var(--brand-text-secondary)">9 sets logged</span>
      </div>
    </div>
    <button class="metric-card" id="metric" style="padding:14px">
      <span id="metricText" style="color:var(--brand-text)">191.4 lbs</span></button>
    <div class="focus-panel" id="focus" style="padding:10px">
      <span id="focusText" style="color:var(--brand-text)">Focus: hold that line</span></div>
    <input id="inp" style="background:var(--brand-surface);color:var(--brand-text);border:1px solid var(--brand-border)" value="typed text">
  `;
});

const TOKENS = ['--brand-bg','--brand-surface','--brand-card','--brand-primary',
                '--brand-accent','--brand-text','--brand-text-secondary','--brand-border',
                '--chrome-grad','--surface-grade','--card-topbar','--block-glow'];

function lum([r,g,b]){const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};
  return .2126*f(r)+.7152*f(g)+.0722*f(b)}
function parse(c){const m=c.match(/[\d.]+/g); if(!m) return null;
  const v=m.slice(0,3).map(Number);
  return c.startsWith('color(')? v.map(x=>Math.round(x*255)) : v.map(Math.round)}
function cr(a,b){const l=[lum(a),lum(b)].sort((x,y)=>y-x); return (l[0]+.05)/(l[1]+.05)}

const problems = [];
for (const t of THEMES) for (const lv of LEVELS) for (const ap of APPEAR) {
  await p.evaluate(([t,lv,ap])=>{
    const r=document.documentElement;
    r.setAttribute('data-theme',t); r.setAttribute('data-deep',lv);
    if(ap) r.setAttribute('data-appearance',ap); else r.removeAttribute('data-appearance');
  },[t,lv,ap]);
  const res = await p.evaluate(([TOKENS])=>{
    const cs = getComputedStyle(document.body);
    const lvl = document.documentElement.getAttribute('data-deep');
    // --surface-grade / --card-topbar only exist inside the depth layer, so
    // their absence at "off" is correct rather than a fault.
    const expected = lvl === 'off'
      ? TOKENS.filter(k => !['--surface-grade','--card-topbar','--block-glow'].includes(k))
      : TOKENS;
    const empty = expected.filter(k => cs.getPropertyValue(k).trim() === '');
    // Effective backdrop: an element's own background-color if it is opaque,
    // otherwise the colours inside its background-IMAGE (several surfaces are
    // gradients, where backgroundColor is legitimately transparent), otherwise
    // whatever the nearest painted ancestor is. Reading backgroundColor alone
    // reports a gradient card as "transparent", which is a false alarm and
    // would bury the real ones.
    const colorsIn = str => (str.match(/(?:rgba?|color)\([^)]*\)/g) || []);
    const opaque = c => { const m=c.match(/[\d.]+/g); return m && (m.length<4 || Number(m[3])>0.85); };
    const backdrop = el => {
      let n = el;
      while (n && n !== document.documentElement) {
        const s = getComputedStyle(n);
        if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && opaque(s.backgroundColor))
          return s.backgroundColor;
        const cs = colorsIn(s.backgroundImage).filter(opaque);
        if (cs.length) return cs[Math.floor(cs.length/2)];
        n = n.parentElement;
      }
      return getComputedStyle(document.documentElement).backgroundColor;
    };
    const g = id => {
      const el=document.getElementById(id); const s=getComputedStyle(el);
      return { bg: backdrop(el), color: s.color, img: s.backgroundImage };
    };
    return { empty, card:g('card'), row:g('row'), metric:g('metric'),
             focus:g('focus'), inp:g('inp'), chrome:g('chrome'),
             cardText:g('cardText').color, cardSec:g('cardSec').color,
             cardPri:g('cardPri').color, rowText:g('rowText').color,
             rowSec:g('rowSec').color, focusText:g('focusText').color };
  },[TOKENS]);

  const tag = `${t}/${lv}${ap?'/dark':''}`;
  if (res.empty.length) problems.push(`${tag}  EMPTY TOKENS: ${res.empty.join(', ')}`);

  for (const [name, surf, txt] of [
    ['card text', res.card.bg, res.cardText],
    ['card secondary', res.card.bg, res.cardSec],
    ['card primary-link', res.card.bg, res.cardPri],
    ['row text', res.row.bg, res.rowText],
    ['row secondary', res.row.bg, res.rowSec],
    ['metric text', res.metric.bg, res.metric.color],
    ['focus text', res.focus.bg, res.focusText],
    ['input text', res.inp.bg, res.inp.color],
  ]) {
    const a=parse(surf), c=parse(txt);
    if (!a || surf==='rgba(0, 0, 0, 0)') { problems.push(`${tag}  ${name}: TRANSPARENT SURFACE`); continue; }
    if (!c) continue;
    const ratio = cr(a,c);
    const floor = name.includes('secondary') ? 3.5 : 4.5;
    if (ratio < floor) problems.push(`${tag}  ${name}: ${ratio.toFixed(2)}:1 (floor ${floor})`);
  }
}
await b.close();
console.log(`checked ${THEMES.length} themes x ${LEVELS.length} levels x 2 appearances = ${THEMES.length*LEVELS.length*2} combinations`);
if (!problems.length) console.log('NO PROBLEMS');
else { console.log(`${problems.length} problems:`); problems.slice(0,60).forEach(x=>console.log('  '+x)); }
