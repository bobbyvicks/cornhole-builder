import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {createCanvas,Path2D}=require('@napi-rs/canvas');
const sharp=require('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const get=f=>fs.readFileSync(path.join(root,f),'utf8');
const manifest=JSON.parse(get('manifest.json'));
globalThis.Path2D=Path2D;
const {PACK_CLIPS,PACK_CATEGORIES,PACK_ICON_DATA,makeCreativeTemplates}=await import('../integration/creative-pack.mjs');
const report={status:'passed',iconCount:0,templateCount:0,checks:[],icons:[],templates:[]};
assert.equal(manifest.icons.length,24);assert.equal(Object.keys(PACK_CLIPS).length,24);
assert.equal(new Set(manifest.icons.map(i=>i.id)).size,24);
assert.equal(Object.keys(PACK_CATEGORIES).length,6);
for(const cat of Object.keys(PACK_CATEGORIES))assert.equal(manifest.icons.filter(i=>i.category===cat).length,4);
for(const icon of manifest.icons){
 const svg=get(icon.file),def=PACK_CLIPS[icon.id],p=new Path2D();def.path(p);
 assert.ok(svg.includes('viewBox="0 0 100 100"'));
 assert.ok(svg.includes('fill="currentColor"'));assert.ok(svg.includes('fill-rule="evenodd"'));
 assert.ok(!/<(?:script|image|foreignObject)\b/i.test(svg));assert.ok(!/\b(?:href|onload)=/i.test(svg));
 const b=p.computeTightBounds();assert.ok(b.every(Number.isFinite));assert.ok(b[0]>=6.5&&b[1]>=6.5&&b[2]<=93.5&&b[3]<=93.5,`${icon.id}: unsafe bounds ${b}`);
 const raster=await sharp(Buffer.from(svg.replace('fill="currentColor"','fill="#275CA7"'))).resize(320,320).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const c=createCanvas(320,320),ctx=c.getContext('2d');ctx.scale(3.2,3.2);ctx.fillStyle='#275CA7';ctx.fill(p,def.rule);
 const native=ctx.getImageData(0,0,320,320).data;
 let ink=0,alphaDifference=0;
 for(let j=0;j<native.length;j+=4){
   const a=raster.data[j+3];alphaDifference+=Math.abs(a-native[j+3]);
   if(a===255){ink++;assert.equal(raster.data[j],39);assert.equal(raster.data[j+1],92);assert.equal(raster.data[j+2],167);}
 }
 assert.ok(ink>1000&&ink<80000,`${icon.id}: empty or incorrectly filled image`);
 assert.equal(raster.data[3],0);assert.equal(raster.data[raster.data.length-1],0);
 const error=alphaDifference/(320*320*255);assert.ok(error<0.015,`${icon.id}: native/SVG silhouette mismatch ${error}`);
 report.icons.push({id:icon.id,bounds:b,opaquePixels:ink,svgVsNativeAlphaError:Number(error.toFixed(6))});
}
report.iconCount=24;report.checks.push('24 unique SVGs; six categories with four icons each','Every SVG parses and renders with a recoloured fill and transparent background','Native Path2D renderer and standalone SVG silhouettes agree','Artwork bounds retain at least 6.5% margins');
let serial=0;
const defaults={text:{outline:'#111111',outlineWidth:0,rotation:0,arc:0,spacing:0,shadow:false},clip:{color:'#f5f5f0',outline:'#111111',outlineWidth:0,rotation:0,opacity:1,flipH:false,width:8}};
const normalize=e=>({...defaults[e.type],...e,id:e.id||`test-${++serial}`});
const T=(text,o)=>normalize({type:'text',text,font:'Anton',size:4,color:'#f5f5f0',x:12,y:30,...o});
const C=(name,o)=>normalize({type:'clip',name,x:12,y:20,...o});
const freshBoard=(o={})=>({base:{kind:'paint',color:'#1f3a93',color2:'#4fa3e3',angle:180,stain:'walnut',...o.base},pattern:{kind:'none',color:'#f5f5f0',size:3,...o.pattern},elements:(o.elements||[]).map(normalize)});
const factories=makeCreativeTemplates({T,C,freshBoard});assert.equal(factories.length,6);
const textBounds=JSON.parse(get('validation/text-bounds.json'));
function clearOfHole(b){const nx=Math.max(b.x,Math.min(12,b.x+b.w)),ny=Math.max(b.y,Math.min(9,b.y+b.h));return Math.hypot(nx-12,ny-9)>3.1;}
for(const template of factories){
 const a=template.board(),b=template.board();assert.notEqual(a,b);assert.notEqual(a.elements,b.elements);
 assert.equal(a.elements.length,b.elements.length);assert.ok(a.elements.length>0);
 assert.equal(new Set([...a.elements,...b.elements].map(e=>e.id)).size,a.elements.length*2);
 for(const el of a.elements){
   assert.ok(el.type==='text'||el.type==='clip');
   if(el.type==='clip'){
     assert.ok(PACK_CLIPS[el.name]);
     const ip=new Path2D();PACK_CLIPS[el.name].path(ip);const ib=ip.computeTightBounds();
     const box={x:el.x+(ib[0]-50)*el.width/100,y:el.y+(ib[1]-50)*el.width/100,w:(ib[2]-ib[0])*el.width/100,h:(ib[3]-ib[1])*el.width/100};
     assert.ok(box.x>=.6&&box.x+box.w<=23.4&&box.y>=.6&&box.y+box.h<=47.4,`${template.id}: clip outside safe trim margin`);
     assert.ok(clearOfHole(box),`${template.id}: clip overlaps hole`);
   }
 }
 const originals=b.elements.map(e=>e.text||e.name);a.elements[0].text='MUTATION CHECK';a.base.color='#000000';
 assert.deepEqual(template.board().elements.map(e=>e.text||e.name),originals);assert.notEqual(template.board().base.color,'#000000');
 const vector=get(`templates/svg/${template.id}.svg`);
 assert.ok(vector.includes('width="24in"')&&vector.includes('height="48in"'));
 assert.ok(!/<(?:text|image|script)\b/i.test(vector),`${template.id}: vector proof contains live text or raster content`);
 await sharp(Buffer.from(vector)).resize(240,480).png().toBuffer();
 const bounds=textBounds.filter(t=>t.templateId===template.id);
 for(const tb of bounds){assert.ok(tb.x>=.7&&tb.x+tb.w<=23.3&&tb.y>=.7&&tb.y+tb.h<=47.3,`${template.id}: text outside safe trim margin: ${tb.text}`);assert.ok(clearOfHole(tb),`${template.id}: text touches hole`);}
 report.templates.push({id:template.id,elementCount:b.elements.length,independentInstances:true,trimInches:[24,48],textAndArtClearOfHole:true});
}
report.templateCount=6;report.checks.push('Six editable template factories use the current helper contract and fresh element IDs','Template instances are independent and do not mutate source definitions','Default text and clip art remain inside safe trim margins and clear of the hole','Six board SVGs render at 24 × 48 inches and contain outlined vector text');
for(const file of ['preview.html','CLAUDE-INTEGRATION.txt','README.md','previews/collection-overview.png','previews/icons-contact-sheet.png'])assert.ok(fs.existsSync(path.join(root,file)));
report.checks.push('Gallery, contact sheets, source data, font notices and Claude handoff present');
fs.writeFileSync(path.join(root,'validation/report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,icons:report.iconCount,templates:report.templateCount,checks:report.checks},null,2));
