import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const {createCanvas, Path2D, GlobalFonts, SvgExportFlag} = require('@napi-rs/canvas');
const sharp = require('sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const write = (f,data) => { const dest=path.join(root,f); fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data); };
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const categories = {
  'pack-wedding':'Wedding collection','pack-family':'Family collection','pack-lake':'Cabin & lake collection',
  'pack-camping':'Camping collection','pack-bbq':'Backyard BBQ collection','pack-sports':'Game day collection'
};
const icons = ['wedding-family','outdoors','bbq-sports'].flatMap(f=>read(`sources/${f}.json`));
const templates = read('sources/templates.json');
if(icons.length!==24||templates.length!==6) throw new Error('Expected 24 icons and six templates.');
const iconMap=Object.fromEntries(icons.map(i=>[i.id,i]));
for(const [file,family] of [['Anton','Anton'],['BebasNeue','Bebas Neue'],['Cinzel','Cinzel'],['Montserrat','Montserrat']]) {
  if(!GlobalFonts.registerFromPath(path.join(root,`fonts/${file}.ttf`),family)) throw new Error(`Font failed: ${family}`);
}
const weights={'Anton':400,'Bebas Neue':400,'Cinzel':700,'Montserrat':800};
const iconSvg=(i,color='currentColor',size=512)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-labelledby="${i.id}-title"><title id="${i.id}-title">${esc(i.label)}</title><desc>${esc(i.description)}</desc><path fill="${color}" fill-rule="${i.fillRule}" d="${i.path}"/></svg>`;
for(const i of icons){
  write(`svg/${i.id}.svg`,iconSvg(i));
  write(`previews/icons/${i.id}.png`,await sharp(Buffer.from(iconSvg(i,'#253F36',320))).png().toBuffer());
}
function pattern(ctx,t){
 const p=t.pattern;
 ctx.fillStyle=p.color;
 if(p.kind==='bottom')ctx.fillRect(0,24,24,24);
 if(p.kind==='border'){
   ctx.fillRect(0,0,24,p.size);ctx.fillRect(0,48-p.size,24,p.size);
   ctx.fillRect(0,0,p.size,48);ctx.fillRect(24-p.size,0,p.size,48);
 }
 if(p.kind==='vstripes')for(let x=0;x<24;x+=p.size*2)ctx.fillRect(x,0,p.size,48);
}
export const textBounds=[];
function text(ctx,el,templateId){
 ctx.save();ctx.translate(el.x,el.y);ctx.font=`${weights[el.font]||400} ${el.size}px "${el.font}"`;
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=el.color;
 const m=ctx.measureText(el.text),asc=m.actualBoundingBoxAscent||el.size*.7,desc=m.actualBoundingBoxDescent||el.size*.2;
 const dy=(asc-desc)/2,chars=[...el.text],widths=chars.map(c=>ctx.measureText(c).width),gap=el.spacing||0;
 const total=gap?widths.reduce((a,b)=>a+b,0)+gap*(chars.length-1):m.width;
 if(gap){let x=-total/2;chars.forEach((c,j)=>{ctx.fillText(c,x+widths[j]/2,dy);x+=widths[j]+gap;});}
 else ctx.fillText(el.text,0,dy);
 textBounds.push({templateId,text:el.text,x:el.x-total/2,y:el.y-(asc+desc)/2,w:total,h:asc+desc});
 ctx.restore();
}
function board(ctx,t,ppi,{preview=false}={}){
 ctx.save();ctx.scale(ppi,ppi);
 ctx.fillStyle=t.base.color;ctx.fillRect(0,0,24,48);pattern(ctx,t);
 for(const el of t.elements){
  if(el.type==='clip'){
   const i=iconMap[el.name];if(!i)throw new Error(`Unknown icon ${el.name}`);
   ctx.save();ctx.translate(el.x-el.width/2,el.y-el.width/2);ctx.scale(el.width/100,el.width/100);
   ctx.fillStyle=el.color;ctx.fill(new Path2D(i.path),i.fillRule);ctx.restore();
  }else text(ctx,el,t.id);
 }
 if(preview){
   ctx.fillStyle='#14221E';ctx.beginPath();ctx.arc(12,9,3,0,Math.PI*2);ctx.fill();
   ctx.lineWidth=.08;ctx.strokeStyle='rgba(255,255,255,.25)';ctx.stroke();
 }
 ctx.restore();
}
const boardImages=[];
for(const t of templates){
  const svgCanvas=createCanvas(2400,4800,SvgExportFlag.ConvertTextToPaths);
  board(svgCanvas.getContext('2d'),t,100);
  let svg=svgCanvas.getContent().toString();
  svg=svg.replace(/width="2400"/, 'width="24in"').replace(/height="4800"/,'height="48in"');
  svg=svg.replace(/(<svg[^>]*>)/,`$1<title>${esc(t.label)} — 24 × 48 inch trim artwork</title><desc>Outlined text. Editable layers are in templates/${t.id}.json. Hole center: 12 inches from left, 9 inches from top; diameter 6 inches. No bleed or hole guide printed in this artwork.</desc>`);
  write(`templates/svg/${t.id}.svg`,svg);
  write(`templates/${t.id}.json`,JSON.stringify({...t,board:{widthInches:24,heightInches:48,hole:{x:12,y:9,diameter:6}},sameDesignOnBothBoards:true},null,2)+'\n');
  const preview=createCanvas(600,1200);board(preview.getContext('2d'),t,25,{preview:true});
  const png=await preview.encode('png');write(`previews/templates/${t.id}.png`,png);boardImages.push(png);
}
const manifest={name:'Cornhole Creative Pack',version:'1.0.0',created:'2026-10-13',categories,iconCount:icons.length,templateCount:templates.length,
  iconFormat:{viewBox:'0 0 100 100',color:'currentColor',filledVectors:true},
  boardFormat:{widthInches:24,heightInches:48,hole:{centerXInches:12,centerYInches:9,diameterInches:6},bleedInches:0},
  icons:icons.map(({path,...i})=>({...i,file:`svg/${i.id}.svg`,thumbnail:`previews/icons/${i.id}.png`})),
  templates:templates.map(t=>({id:t.id,label:t.label,category:t.category,description:t.description,palette:t.palette,personalize:t.personalize,json:`templates/${t.id}.json`,svg:`templates/svg/${t.id}.svg`,preview:`previews/templates/${t.id}.png`}))};
write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
const moduleSource=`/* Cornhole Creative Pack v1. Generated from sources/*.json.\n   Additive adapter for the published T / C / freshBoard and CLIPS interfaces.\n   No network requests, image rasterization or dependencies. */\nexport const PACK_CATEGORIES = ${JSON.stringify(categories,null,2)};\nexport const PACK_ICON_DATA = ${JSON.stringify(icons,null,2)};\nexport const PACK_TEMPLATE_DATA = ${JSON.stringify(templates,null,2)};\nexport const PACK_CLIPS = Object.fromEntries(PACK_ICON_DATA.map(icon => [icon.id, {\n  label:icon.label, cat:icon.category, aspect:icon.aspect, rule:icon.fillRule,\n  path(p) { p.addPath(new Path2D(icon.path)); }\n}]));\nexport function makeCreativeTemplates({T,C,freshBoard}) {\n  return PACK_TEMPLATE_DATA.map(template => ({\n    id:template.id, label:template.label, occasion:template.occasion,\n    board:() => freshBoard({\n      base:{...template.base}, pattern:{...template.pattern},\n      elements:template.elements.map(element => {\n        if(element.type==='text') { const {type,text,...options}=element;return T(text,{...options}); }\n        const {type,name,...options}=element;return C(name,{...options});\n      })\n    })\n  }));\n}\n`;
write('integration/creative-pack.mjs',moduleSource);
// Printable, font-independent SVG proofs and compact PNG contact sheets.
const overview=createCanvas(1920,1350), oc=overview.getContext('2d');
oc.fillStyle='#F3EFE5';oc.fillRect(0,0,1920,1350);
oc.fillStyle='#223B32';oc.font='800 22px Montserrat';oc.fillText('CORNHOLE CREATIVE PACK / VOLUME 01',70,66);
oc.font='700 62px Cinzel';oc.fillText('Made for your kind of weekend.',70,156);
oc.font='400 25px "Bebas Neue"';oc.fillStyle='#68796C';oc.fillText('SIX EDITABLE DESIGNS. TWENTY-FOUR ORIGINAL VECTOR MARKS.',73,205);
for(let j=0;j<templates.length;j++){
  const x=70+j*300,y=277;
  oc.save();oc.shadowColor='rgba(25,42,34,.18)';oc.shadowBlur=18;oc.shadowOffsetY=12;
  oc.fillStyle='#DDD4C4';oc.fillRect(x,y,270,540);oc.restore();
  oc.save();oc.translate(x,y);board(oc,templates[j],11.25,{preview:true});oc.restore();
  oc.fillStyle='#223B32';oc.font='800 17px Montserrat';oc.fillText(templates[j].label,x,y+585);
  oc.fillStyle='#7E897F';oc.font='400 18px "Bebas Neue"';oc.fillText(Object.values(categories)[j].toUpperCase(),x,y+615);
  for(let k=0;k<templates[j].palette.length;k++){oc.fillStyle=templates[j].palette[k];oc.beginPath();oc.arc(x+10+k*29,y+649,9,0,Math.PI*2);oc.fill();}
  const group=icons.filter(i=>i.category===templates[j].category);
  for(let k=0;k<group.length;k++){
    oc.save();oc.translate(x+(k%2)*128,y+708+Math.floor(k/2)*119);oc.scale(1.03,1.03);oc.fillStyle='#314B3F';oc.fill(new Path2D(group[k].path),group[k].fillRule);oc.restore();
  }
}
oc.fillStyle='#7C847A';oc.font='400 18px "Bebas Neue"';oc.fillText('24 × 48 INCH BOARD FORMAT / EDITABLE NAMES + COLOURS / VECTOR ARTWORK / HOLES SHOWN FOR PREVIEW',70,1300);
write('previews/collection-overview.png',await overview.encode('png'));
const sheet=createCanvas(1600,1770),sc=sheet.getContext('2d');sc.fillStyle='#F6F2E9';sc.fillRect(0,0,1600,1770);
sc.fillStyle='#243D33';sc.font='700 46px Cinzel';sc.fillText('The icon collection',60,76);
sc.font='400 23px "Bebas Neue"';sc.fillStyle='#657567';sc.fillText('24 ORIGINAL SINGLE-COLOUR SVG MARKS / ALL COLOURS EDITABLE',62,119);
for(let j=0;j<icons.length;j++){
  const x=55+(j%4)*387,y=165+Math.floor(j/4)*262;
  sc.fillStyle='#FFFFFF';sc.beginPath();sc.roundRect(x,y,358,240,14);sc.fill();
  sc.save();sc.translate(x+90,y+13);sc.scale(1.75,1.75);sc.fillStyle='#314D3E';sc.fill(new Path2D(icons[j].path),icons[j].fillRule);sc.restore();
  sc.fillStyle='#243D33';sc.font='800 16px Montserrat';sc.textAlign='center';sc.fillText(icons[j].label,x+179,y+214);sc.textAlign='left';
}
write('previews/icons-contact-sheet.png',await sheet.encode('png'));
const templateCards=templates.map(t=>`<article class="template"><img src="previews/templates/${t.id}.png" alt="${esc(t.label)} cornhole board design" width="600" height="1200"><h3>${esc(t.label)}</h3><p>${esc(t.description)}</p><div class="swatches">${t.palette.map(c=>`<i style="background:${c}" title="${c}"></i>`).join('')}</div><div class="downloads"><a download href="templates/svg/${t.id}.svg">Vector artwork</a><a download href="templates/${t.id}.json">Editable layers</a></div></article>`).join('');
const iconCards=icons.map(i=>`<article class="icon" data-category="${i.category}" data-search="${esc([i.label,...i.tags].join(' ').toLowerCase())}"><div class="art">${iconSvg(i)}</div><h3>${esc(i.label)}</h3><p>${esc(i.description)}</p><a download href="svg/${i.id}.svg">Download SVG <span aria-hidden="true">↗</span></a></article>`).join('');
write('preview.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cornhole Creative Pack — Volume 01</title><style>
@font-face{font-family:Montserrat;src:url('fonts/Montserrat.ttf')}@font-face{font-family:Cinzel;src:url('fonts/Cinzel.ttf')}*{box-sizing:border-box}body{margin:0;background:#f3efe5;color:#233b32;font:15px/1.6 system-ui,sans-serif}.wrap{max-width:1400px;margin:auto;padding:0 32px}header{padding:30px 0;border-bottom:1px solid #d9dece;display:flex;justify-content:space-between;gap:20px}.eyebrow{font-size:11px;letter-spacing:.2em;font-weight:800;text-transform:uppercase}a{color:inherit;text-underline-offset:4px}h1{font:700 clamp(36px,5vw,68px)/1.08 Cinzel,Georgia,serif;max-width:950px;margin:30px 0 24px;letter-spacing:-.03em}h2{font:700 32px Cinzel,Georgia,serif;margin:0}h3{font:800 15px/1.3 Montserrat,system-ui;margin:16px 0 8px}.hero{padding:48px 0 56px}.hero p{max-width:690px;color:#647065;font-size:17px}.tag{display:inline-block;border:1px solid #cbd1c3;border-radius:30px;padding:7px 14px;font-size:12px;margin:8px 6px 0 0}.intro{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:28px}.intro p{color:#657468;max-width:510px}.templates{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:23px}.template img{width:100%;height:auto;border-radius:6px;box-shadow:0 14px 25px #293c321a;display:block}.template p{font-size:12px;color:#647065}.swatches{display:flex;gap:8px;margin:16px 0}.swatches i{width:18px;height:18px;border-radius:50%;box-shadow:0 0 0 1px #233b3217}.downloads{font-size:11px;display:flex;flex-wrap:wrap;gap:12px}.library{padding:74px 0 38px}.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:20px 0}input,select{font:inherit;border:1px solid #bdc9b8;border-radius:6px;background:#fff;padding:10px;min-height:44px}input[type=search]{flex:1;min-width:180px}input[type=color]{width:52px;padding:5px}.icons{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}.icon{background:#fff;border-radius:10px;padding:24px;display:flex;flex-direction:column}.art{color:var(--ink,#314d3e);display:flex;align-items:center;justify-content:center;aspect-ratio:1.7}.art svg{width:145px;height:145px;max-width:100%}.icon h3{margin-top:18px}.icon p{font-size:12px;color:#6a7369;margin:0 0 17px;flex:1}.icon a{font-size:12px;font-weight:700}.icon[hidden]{display:none}.note{padding:28px;background:#e5eadf;border-radius:10px;margin:44px 0}.note p{max-width:950px;margin:8px 0;font-size:14px}footer{padding:25px 0 45px;color:#667163;font-size:12px}.counter{font-size:12px;color:#6a7369}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #a75635;outline-offset:4px}@media(max-width:1000px){.templates{grid-template-columns:repeat(3,1fr)}.icons{grid-template-columns:repeat(3,1fr)}}@media(max-width:620px){.wrap{padding:0 20px}.templates,.icons{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.intro{display:block}.icon{padding:16px}.art svg{width:110px;height:110px}.hero{padding:30px 0}.toolbar label{font-size:12px}.icon h3{font-size:13px}.library{padding-top:50px}header{font-size:12px}.downloads{display:block}.downloads a{display:block;margin:6px 0}}
</style></head><body><div class="wrap"><header><div class="eyebrow">Cornhole creative pack</div><a href="CLAUDE-INTEGRATION.txt">Claude handoff ↗</a></header><section class="hero"><div class="eyebrow">VOLUME 01 / SIX COLLECTIONS</div><h1>Made for your<br>kind of weekend.</h1><p>Original artwork for weddings, family afternoons, lake weekends, campgrounds, backyard cookouts and game day.</p><span class="tag">24 recolourable SVGs</span><span class="tag">6 editable templates</span><span class="tag">24 × 48 inch format</span></section><section><div class="intro"><h2>Pick your occasion.</h2><p>Names, dates, lettering and illustration colours remain editable in the builder module. Sample names are examples.</p></div><div class="templates">${templateCards}</div></section><section class="library"><div class="intro"><h2>Make it your own.</h2><p>Choose an ink colour to try every mark. SVG downloads inherit a single colour; transparent areas stay transparent.</p></div><div class="toolbar"><label for="category">Collection</label><select id="category"><option value="all">All collections</option>${Object.entries(categories).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><label for="ink">Ink</label><input id="ink" type="color" value="#314d3e"><input id="search" type="search" aria-label="Search icons" placeholder="Search names or keywords"><span class="counter" id="count" role="status">24 icons</span></div><div class="icons">${iconCards}</div></section><aside class="note"><strong>Ready for Claude.</strong><p>Use <a href="integration/creative-pack.mjs">creative-pack.mjs</a> for native editable clip art and templates. Read <a href="CLAUDE-INTEGRATION.txt">the integration prompt</a> before adding it. The SVG board artwork has outlined lettering; use its companion JSON or the module to edit names. The hole appears only in previews. Artwork is supplied at trim size with no added bleed; confirm the printer’s required bleed before production.</p></aside><footer>Original SVG artwork created for this project. Font credits and licences are included in the fonts folder. This pack is a local handoff; it has not been deployed to the live store.</footer></div><script>
const cards=[...document.querySelectorAll('.icon')],category=document.querySelector('#category'),search=document.querySelector('#search'),ink=document.querySelector('#ink');
function filter(){let n=0;const query=search.value.toLowerCase().trim();cards.forEach(c=>{c.hidden=!((category.value==='all'||category.value===c.dataset.category)&&(!query||c.dataset.search.includes(query)));if(!c.hidden)n++;});document.querySelector('#count').textContent=n+' icon'+(n===1?'':'s');}
category.addEventListener('change',filter);search.addEventListener('input',filter);ink.addEventListener('input',()=>document.documentElement.style.setProperty('--ink',ink.value));
</script></body></html>`);
write('validation/text-bounds.json',JSON.stringify(textBounds.slice(0),null,2));
console.log(JSON.stringify({icons:icons.length,templates:templates.length,output:root},null,2));
