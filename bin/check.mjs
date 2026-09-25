#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = '0.3.0';
const DEFAULT_CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, '../config/default.json'), 'utf8'));
export const CATALOGUE = JSON.parse(fs.readFileSync(path.join(HERE, '../rules/catalogue.json'), 'utf8'));
const SPELLINGS = [
 ['organization','organisation'],['organizations','organisations'],['center','centre'],['centers','centres'],
 ['program','programme'],['programs','programmes'],['labor','labour'],['color','colour'],['favor','favour'],
 ['defense','defence'],['analyze','analyse'],['analyzed','analysed'],['analyzes','analyses'],
 ['meter','metre'],['meters','metres'],['traveled','travelled'],['modeled','modelled'],['prioritize','prioritise']
];
const REGISTER = ['boom','appetite','furthest behind','on the line','as donors retreat'];
const HEDGES = ['approximately','about','at least','an estimated','a reported','according to'];
const RULES = {
 'UE-SP001':['error','American spelling found in prose.','Use the configured British spelling.'], 'UE-SP002':['error','British and American variants appear in the same file.','Choose one register consistently.'],
 'UE-SP003':['warning','Allowlisted spelling requires review when spellingReview is enabled.','Review this deliberate exception.'],
 'UE-TE001':['error','“maternal deaths” does not identify the maternal mortality ratio.','Use the full indicator name.'], 'UE-TE002':['error','Ambiguous wording for a labour-force participation rate.','State the indicator name.'],
 'UE-TE003':['error','Use “per cent” in running prose.','Use “per cent”.'], 'UE-TE004':['error','Use “the United States” in prose.','Expand the country name.'],
 'UE-NU001':['warning','Numeric date does not use the UN day-month-year form.','Use a month name.'], 'UE-NU002':['warning','Numeric range does not use an en dash.','Use an en dash.'],
 'UE-RE001':['error','Word or phrase is outside the neutral professional register.','Use neutral wording.'], 'UE-RE002':['error','Comparison or superlative is hard-coded in a JavaScript string.','Derive the comparison at runtime.'],
 'UE-RE003':['warning','Prose figure may lack a hedge or source.','Add a hedge and identify the source and date.'], 'UE-DI001':['warning','Coverage count does not state what is being counted.','Name the population, status and time basis.'],
 'UE-EO001':['error','Rendered page title exceeds 60 characters.','Shorten the title.'], 'UE-EO002':['error','Rendered meta description exceeds 160 characters.','Shorten the description.'],
 'UE-EO003':['error','Canonical link is missing, non-absolute or outside the configured deployment origin.','Use an absolute canonical URL on the configured origin.'], 'UE-EO004':['error','Page must contain exactly one h1.','Keep exactly one h1.'], 'UE-EO005':['warning','Page is missing Open Graph or Twitter metadata.','Add the metadata tags.'],
 'UE-AX001':['error','Canvas has no accessible name.','Add an accessible name.'], 'UE-AX002':['error','Label is not associated with a control.','Associate the label and control.'],
 'UE-SE001':['error','External or response data may be assigned through innerHTML.','Use textContent.'], 'UE-SE002':['error','Cross-origin asset lacks exact version pinning, SRI declarations or required attributes.','Pin the exact version and add a SHA-384 SRI declaration and crossorigin attribute.'],
 'UE-SE003':['error','HTTP(S) URL literal uses a mutable branch reference.','Use an immutable commit SHA.'], 'UE-SE004':['error','Leaflet tooltip may receive a string.','Pass a DOM element containing textContent.']
};
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const safeText = value => Array.from(String(value), c => { const cp=c.codePointAt(0); if(c==='\n')return '\\n'; if(c==='\r')return '\\r'; if(c==='\t')return '\\t'; if(cp<=0x1f||(cp>=0x7f&&cp<=0x9f)||cp>=0xd800&&cp<=0xdfff)return `\\${cp<=0xff?'x':'u'}${cp.toString(16).padStart(cp<=0xff?2:4,'0')}`; if(cp===0x2028||cp===0x2029||cp===0x200b||cp===0x200c||cp===0x200d||cp===0x2060||cp===0xfeff||(cp>=0x202a&&cp<=0x202e)||(cp>=0x2066&&cp<=0x2069))return `\\u${cp.toString(16).padStart(4,'0')}`; return c; }).join('');
const decodeEntities = s => s.replace(/&#(x[0-9a-f]+|\d+);/gi,(all,n)=>{const cp=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return Number.isSafeInteger(cp)&&cp>=0&&cp<=0x10ffff&&!(cp>=0xd800&&cp<=0xdfff)?String.fromCodePoint(cp):all;}).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[n.toLowerCase()])).replace(/\s+/g,' ').trim();
const add=(s,line,col,id,suggestion=RULES[id][2])=>s.push({file:line.file,line:line.no,column:col+1,id,severity:RULES[id][0],message:RULES[id][1],suggestion,ruleId:id});
const emit=(s,line,col,id,allow=true)=>{ if(allow && !/(?:ue:ignore)(?:\s+all|\s+UE-([A-Z]{2}\d{3}))/i.test(line.text) || allow===false) add(s,line,col,id); };
function visibleProse(line){
 let s=line.text;
 const mask=re=>s=s.replace(re,m=>m.replace(/[^\n]/g,' '));
 mask(/<!--[\s\S]*?-->/g); mask(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi); mask(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi); mask(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi); mask(/<cite\b[^>]*>[\s\S]*?<\/cite\s*>/gi);
 s=s.replace(/^\s*>[^\n]*/gm,' ').replace(/<[^>]*>/g,' ').replace(/(?:https?:\/\/|\bfile:\/\/|(?:^|\s)\.{0,2}\/)[^\s<>"'`]+/gm,' ').replace(/`[^`]*`/g,' ').replace(/"(?:[^"\n]*)"|“(?:[^”\n]*)”/g,' ');
 return s;
}
function checkProse(store,line,ext,ctx){
 const p=visibleProse(line), suppressed=id=>new RegExp(`ue:ignore(?:\\s+all|\\s+${id})`,'i').test(line.text);
 for(const [bad,good] of ctx.terminologyPairs||[]){const m=p.match(new RegExp(`\\b${esc(bad)}\\b`,'i'));if(m&&!ctx.allowTerminology.some(x=>new RegExp(`\\b${esc(x)}\\b`,'i').test(p)))add(store,line,m.index,'UE-TE001',`Use “${good}”.`);}
 for(const bad of ctx.customRegister||[]){const m=p.match(new RegExp(`\\b${esc(bad)}\\b`,'i'));if(m&&!ctx.allowRegister.has(bad.toLowerCase()))add(store,line,m.index,'UE-RE001');}
 for(const [us,uk] of ctx.spellings){ if(ctx.allow.has(us)||ctx.allow.has(uk)) continue; const m=p.match(new RegExp(`\\b${us}\\b`,'i')); if(m&&!suppressed('UE-SP001')&&!ctx.mixed?.has(us)) add(store,line,m.index,'UE-SP001',`Use “${uk}”.`); }
 const checks=[
  ['UE-TE001',/\bmaternal deaths\b/i],['UE-TE002',/\b(?:women's work|female work)\b/i],
  ['UE-TE004',/(?<![A-Za-z])(?:U\.S\.|US)(?![A-Za-z])/],['UE-NU001',/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/],
  ['UE-NU002',/\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\b/]
 ];
 for(const [id,re] of checks){const m=p.match(re);if(m&&!suppressed(id)&&!(id.startsWith('UE-TE')&&ctx.allowTerminology.some(term=>new RegExp(`\\b${esc(term)}\\b`,'i').test(p))))add(store,line,m.index,id);}
 if(!/^\s*<(?:meta|title|span|div|output|small)\b/i.test(line.text)&&!/(aria-label|role=["'](?:note|tooltip)["']|class=["'][^"']*(?:stat|tile|axis|legend|tooltip))/i.test(line.text)){const m=p.match(/(?<!%)%(?!\w)/);if(m&&!suppressed('UE-TE003'))add(store,line,m.index,'UE-TE003');}
 for(const word of REGISTER){const m=p.match(new RegExp(`\\b${esc(word)}\\b`,'i'));if(m&&!ctx.allowRegister.has(word)&&!suppressed('UE-RE001'))add(store,line,m.index,'UE-RE001');}
 // UE-RE003 is clause-scoped: punctuation boundaries are supported, not arbitrary source lines.
 const clauses=p.split(/(?<=[.!?])\s+|;\s+/); for(const clause of clauses){const m=clause.match(/\b\d[\d,.]*\s*(?:per cent|%|million|billion)\b/i);if(m&&!HEDGES.some(h=>clause.toLowerCase().includes(h))&&!/meta description/i.test(line.text)&&!suppressed('UE-RE003'))add(store,line,p.indexOf(clause)+m.index,'UE-RE003');}
 const coverage=p.match(/\b\d[\d,]*\s+(?:member\s+)?(?:countries|economies|states)\b/i); if(coverage&&!/(?:member|with (?:a )?value|drawable|on the map|reporting|reported|as of|based on|covered by)/i.test(p)&&!suppressed('UE-DI001'))add(store,line,coverage.index,'UE-DI001');
 if(['js','mjs','cjs'].includes(ext)&&/['"`]([^'"`]*\b(?:smallest|largest|highest|lowest|doubled|surpassed|compared with|compared to|below the average|above the average)\b[^'"`]*)['"`]/i.test(line.text)&&!suppressed('UE-RE002'))add(store,line,line.text.search(/\b(?:smallest|largest)\b/i),'UE-RE002');
}
function checkCodeSecurity(store,text,ext,file){
 if(!['js','mjs','cjs'].includes(ext))return;
 const lines=text.split(/\r?\n/).map((text,i)=>({text,no:i+1,file}));
 // Conservative sink policy: this flags assignments and aliases, but does not claim taint tracing.
 for(let i=0;i<lines.length;i++){
  if(/\b(?:innerHTML|outerHTML)\b/.test(lines[i].text)&&!suppress(lines,i,'UE-SE001')){
   const m=lines[i].text.match(/(?:innerHTML|outerHTML)/i); add(store,lines[i],m?.index??0,'UE-SE001');
  }
  if(/\.bindTooltip\s*\(/.test(lines[i].text)){
    const callStart=text.indexOf('.bindTooltip',lines.slice(0,i).join('\n').length);
    const boundary=Math.max(text.lastIndexOf('{',callStart),text.lastIndexOf('}',callStart));
    const localContext=text.slice(boundary+1,Math.min(text.length,callStart+400));
    const call=localContext.match(/\.bindTooltip\s*\([\s\S]*?\)/)?.[0]||'';
    const arg=call.match(/\.bindTooltip\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/)?.[1];
    const localCallIndex=callStart-(boundary+1), assignment=arg&&localContext.match(new RegExp(`(?:const|let|var)\\s+${esc(arg)}\\s*=\\s*document\\.createElement\\s*\\(`, 'i'));
    const direct=/\.bindTooltip\s*\(\s*document\.createElement\s*\(/.test(call)||Boolean(assignment&&assignment.index<localCallIndex);
   if(!direct&&!suppress(lines,i,'UE-SE004'))add(store,lines[i],lines[i].text.indexOf('.bindTooltip'),'UE-SE004');
  }
 }
 for(const m of text.matchAll(/https?:\/\/[^\s'"`)>]+/g)) if(/\/(?:latest|dev|trunk|main|master)(?:\/|$)/i.test(m[0])&&!suppress({text,no:text.slice(0,m.index).split('\n').length,file},'UE-SE003')) add(store,{file,no:text.slice(0,m.index).split('\n').length},m.index,'UE-SE003');
}
function suppress(l,i,id){return new RegExp(`ue:ignore(?:\\s+all|\\s+${id})`,'i').test(l.text)||(i>0&&new RegExp(`ue:ignore(?:\\s+all|\\s+${id})`,'i').test(l.text));}
function checkHtml(file,text,store,ctx){
 const maskRanges=(input,...patterns)=>{const out=[...input];for(const pattern of patterns)for(const match of input.matchAll(pattern)){for(let i=match.index;i<match.index+match[0].length;i++)if(out[i]!=='\n')out[i]=' ';}return out.join('');};
 let structural=maskRanges(text,/<!--[\s\S]*?-->/g,/&lt;(?:cite|script|style|noscript)\b[\s\S]*?(?:&gt;|<)/gi);
 structural=[...structural];
 for(const match of text.matchAll(/<(script|style|noscript)\b[^>]*>[\s\S]*?(<\/\1\s*>)/gi)){const start=text.indexOf('>',match.index)+1,end=match.index+match[0].length-match[1].length;for(let i=start;i<end;i++)if(structural[i]!=='\n')structural[i]=' ';}
 structural=structural.join('');
 const title=structural.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i); if(title&&[...decodeEntities(title[1])].length>60)add(store,{file,no:structural.slice(0,title.index).split('\n').length},title.index,'UE-EO001');
 const tags=[...structural.matchAll(/<meta\b[^>]*>/gi)]; const desc=tags.find(m=>/\bname\s*=\s*["']description["']/i.test(m[0])); const attr=(tag,name)=>tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1]??'';
 if(desc&&[...decodeEntities(attr(desc[0],'content'))].length>160)add(store,{file,no:1},desc.index,'UE-EO002');
 const links=[...structural.matchAll(/<link\b[^>]*>/gi)]; const can=links.find(m=>/\brel\s*=\s*["']canonical["']/i.test(m[0])); const href=can?decodeEntities(attr(can[0],'href')):'';
 let canonicalUrl=null,baseUrl=null;try{if(/^https?:\/\//i.test(href))canonicalUrl=new URL(href);if(ctx.baseOrigin)baseUrl=new URL(ctx.baseOrigin);}catch{} if(!canonicalUrl||(baseUrl&&canonicalUrl.origin!==baseUrl.origin))add(store,{file,no:1},can?.index??0,'UE-EO003');
 if((structural.match(/<h1\b/gi)||[]).length!==1)add(store,{file,no:1},0,'UE-EO004');
 if(!/\bproperty\s*=\s*["']og:/i.test(structural)||!/\bname\s*=\s*["']twitter:/i.test(structural))add(store,{file,no:1},0,'UE-EO005');
 for(const m of structural.matchAll(/<canvas\b([^>]*)>([\s\S]*?)<\/canvas>/gi))if(!/aria-label|aria-labelledby/i.test(m[1])&&!/<figcaption/i.test(m[2]))add(store,{file,no:structural.slice(0,m.index).split('\n').length},m.index,'UE-AX001');
 for(const m of structural.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi))if(!/\bfor\s*=/i.test(m[1])&&!/<(?:input|select|textarea)\b/i.test(m[2]))add(store,{file,no:structural.slice(0,m.index).split('\n').length},m.index,'UE-AX002');
 const sri=/\bintegrity\s*=\s*["'](sha384)-([A-Za-z0-9+/]+={0,2})["']/i;
 for(const m of structural.matchAll(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*(?:"(?:https?:)?\/\/[^"']+"|'(?:https?:)?\/\/[^"']+'|(?:https?:)?\/\/[^\s"'=<>`]+)[^>]*>/gi)){
  const tag=m[0],tagName=m[0].match(/^<(script|link)/i)[1].toLowerCase(),url=m[0].match(/(?:src|href)\s*=\s*(?:"([^"']+)|'([^"']+)'|([^\s"'=<>`]+))/i)?.slice(1).find(Boolean)??'';
  if(tagName==='link'&&!/rel\s*=\s*["']stylesheet["']/i.test(tag))continue;
  const exact=/(?:[@\-/]|version[=_-])\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?/i.test(url)&&!/(?:latest|dev|trunk|main|master)(?:[\/?#]|$)/i.test(url);
  const hash=sri.exec(tag)?.[2],validHash=hash&&Buffer.from(hash,'base64').length===48&&/^[A-Za-z0-9+/]+={0,2}$/.test(hash);
  if(!exact||!validHash||!/crossorigin\s*=\s*["']anonymous["']/i.test(tag))add(store,{file,no:structural.slice(0,m.index).split('\n').length},m.index,'UE-SE002');
 }
}
function check(file,text,cfg){const ext=path.extname(file).slice(1).toLowerCase(),store=[],spellings=cfg.spellings||SPELLINGS,mixed=new Set(spellings.filter(([us,uk])=>new RegExp(`\\b${us}\\b`,'i').test(text)&&new RegExp(`\\b${uk}\\b`,'i').test(text)).map(x=>x[0])),ctx={spellings,allow:new Set(cfg.allowlist.spellings.map(x=>x.toLowerCase())),allowTerminology:cfg.allowlist.terminology,allowRegister:new Set(cfg.allowlist.register.map(x=>x.toLowerCase())),baseOrigin:cfg.baseOrigin||cfg.pageUrl||null,terminologyPairs:cfg.terminologyPairs||[],customRegister:cfg.customRegister||[],mixed};
 if(['html','htm'].includes(ext))checkHtml(file,text,store,ctx);
 text.split(/\r?\n/).forEach((s,i)=>{if(!/^\s*(?:```|~~~|<!--)/.test(s))checkProse(store,{file,text:s,no:i+1},ext,ctx);});
 checkCodeSecurity(store,text,ext,file);
 const proseText=text.split(/\r?\n/).map(s=>visibleProse({text:s})).join('\n'); for(const [us,uk]of ctx.spellings)if(new RegExp(`\\b${us}\\b`,'i').test(proseText)&&new RegExp(`\\b${uk}\\b`,'i').test(proseText))add(store,{file,no:1},0,'UE-SP002');
 if(cfg.spellingReview)for(const word of cfg.allowlist.spellings)if(new RegExp(`\\b${esc(word)}\\b`,'i').test(text))add(store,{file,no:1},0,'UE-SP003');
 return store;
}
function globRe(glob){let out='^(?:.*/)?';for(let i=0;i<glob.length;i++){const c=glob[i];if(c==='*'){if(glob[i+1]==='*'){i++;if(glob[i+1]==='/'){i++;out+='(?:.*/)?';}else out+='.*';}else out+='[^/]*';}else out+=c.replace(/[.+?^${}()|[\]\\]/g,'\\$&');}return new RegExp(out+'$');}
function collect(inputs,ignored){const out=[],seen=new Set(),patterns=ignored.map(globRe);for(const input of inputs){const st=fs.lstatSync(input);if(st.isSymbolicLink()){if(seen.has(input))continue;seen.add(input);out.push(input);continue;}if(st.isFile()){out.push(input);continue;}const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name),n=p.replaceAll('\\','/');if(patterns.some(r=>r.test(n)))continue;if(e.isDirectory())walk(p);else if(e.isFile()&&!e.isSymbolicLink()&&/\.(html?|md|markdown|txt|js|mjs|cjs|json)$/i.test(e.name)&&!seen.has(p)){seen.add(p);out.push(p);}}};walk(input);}return out;}
export function fixText(text,file,cfg){let out=text,changes=[];
 const spans=[/<!--[\s\S]*?-->/g,/<(script|style|noscript|cite|p|div|span|section|article)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,/```[\s\S]*?```/g,/~~~[\s\S]*?~~~/g,/`[^`\n]*`/g,/"(?:[^"\n]*)"|“(?:[^”\n]*)”/g,/(?:^|\n)(?:>[^\n]*(?:\n|$))+/g,/(?:https?:\/\/|\bfile:\/\/|(?:^|\s)\.{0,2}\/)[^\s<>"'`]+/g,/(?:^|\s)(?:\/\/|\/\*)[^\n]*/g,/(?:^|\s)#[^\n]*/g,/<[^>]*>/g,/(?:^|\n)\s*(?:const|let|var|function|class)\b[^\n]*/g];
 const masked=[...text];for(const re of spans)for(const m of text.matchAll(re)){const start=m.index+(m[0].startsWith('\n')||m[0].startsWith(' ')?1:0),end=start+m[0].length;for(let i=start;i<end&&i<masked.length;i++)if(masked[i]!=='\n')masked[i]=' ';}
 for(const [us,uk]of cfg.spellings||SPELLINGS){const re=new RegExp(`\\b${us}\\b`,'gi');out=out.replace(re,(m,off)=>{if(masked.slice(off,off+m.length).includes(' '))return m;/* allowlisted brand phrases are not American/British pairs; unrelated occurrences remain fixable */changes.push(`${file}:${text.slice(0,off).split('\n').length} ${m} → ${uk}`);return uk;});}
 return[out,changes];
}
function validateConfig(c){const err=m=>{throw new Error(`Invalid configuration: ${m}`)};const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);if(!plain(c))err('expected a plain object');const known=new Set(['ignoredPaths','allowlist','severities','rules','spellingReview','baseOrigin']);for(const k of Object.keys(c))if(!known.has(k))err(`unknown top-level key "${k}"`);if(c.baseOrigin!==undefined){try{const u=new URL(c.baseOrigin);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{err('baseOrigin must be an absolute http(s) URL')}}if(c.spellingReview!==undefined&&typeof c.spellingReview!=='boolean')err('spellingReview must be a boolean');if(c.ignoredPaths!==undefined&&(!Array.isArray(c.ignoredPaths)||c.ignoredPaths.some(x=>typeof x!=='string')))err('ignoredPaths must be an array of strings');
 for(const k of ['allowlist','severities','rules'])if(c[k]!==undefined&&!plain(c[k]))err(`${k} must be a plain object`);for(const k of ['spellings','terminology','register'])if(c.allowlist?.[k]!==undefined&&(!Array.isArray(c.allowlist[k])||c.allowlist[k].some(x=>typeof x!=='string')))err(`allowlist.${k} must be an array of strings`);if(c.severities)for(const [id,v]of Object.entries(c.severities)){if(!RULES[id])err(`unknown rule ID ${id}`);if(!['error','warning','info'].includes(v))err(`invalid severity for ${id}`);}if(c.rules)for(const [id,v]of Object.entries(c.rules)){if(!RULES[id])err(`unknown rule ID ${id}`);if(!plain(v)||typeof v.enabled!=='boolean')err(`rules.${id} must contain a boolean enabled value`);}}
function validateProfile(p){
 const bad=m=>{throw new Error(`Invalid profile: ${m}`)},plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),nonempty=v=>typeof v==='string'&&v.trim().length>0;
 const top=new Set(['profileVersion','name','source','spelling','terminology','register','severities','rules','pageUrl']);
 if(!plain(p))bad('expected a plain object'); for(const key of Object.keys(p))if(!top.has(key))bad(`unknown top-level key "${key}"`);
 if(p.profileVersion!==1)bad('profileVersion must be 1'); if(!nonempty(p.name))bad('name must be a non-empty string'); if(!nonempty(p.source))bad('source must be a non-empty string');
 if(p.spelling!==undefined){if(!plain(p.spelling))bad('spelling must be a plain string mapping');for(const [key,value] of Object.entries(p.spelling)){if(!nonempty(key)||!SPELLINGS.some(([supported])=>supported===key))bad(`unknown spelling mapping ${key}`);if(!nonempty(value))bad(`spelling.${key} must be a non-empty string`);}}
 if(p.terminology!==undefined){if(!plain(p.terminology))bad('terminology must be a plain object');for(const key of Object.keys(p.terminology))if(key!=='forbidden')bad(`unknown terminology key "${key}"`);if(p.terminology.forbidden!==undefined&&(!Array.isArray(p.terminology.forbidden)||p.terminology.forbidden.some(pair=>!Array.isArray(pair)||pair.length!==2||!pair.every(nonempty)||pair[0]===pair[1])))bad('terminology.forbidden must contain non-empty [forbidden, correct] pairs');}
 if(p.register!==undefined){if(!plain(p.register))bad('register must be a plain object');for(const key of Object.keys(p.register))if(!['forbidden','approved'].includes(key))bad(`unknown register key "${key}"`);for(const key of ['forbidden','approved'])if(p.register[key]!==undefined&&(!Array.isArray(p.register[key])||p.register[key].some(x=>!nonempty(x))))bad(`register.${key} must contain non-empty strings`);}
 for(const section of ['severities','rules'])if(p[section]!==undefined&&!plain(p[section]))bad(`${section} must be a plain object`);
 if(p.severities)for(const [id,v] of Object.entries(p.severities)){if(!RULES[id])bad(`unknown rule ID ${id}`);if(!['error','warning','info'].includes(v))bad(`invalid severity for ${id}`);}
 if(p.rules)for(const [id,v] of Object.entries(p.rules)){if(!RULES[id])bad(`unknown rule ID ${id}`);if(!plain(v)||typeof v.enabled!=='boolean'||Object.keys(v).some(key=>key!=='enabled'))bad(`rules.${id} must contain only a boolean enabled value`);}
 if(p.pageUrl!==undefined){try{const url=new URL(p.pageUrl);if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{bad('pageUrl must be an absolute http(s) URL');}}
}
function loadProfile(file){
 let st;try{st=fs.lstatSync(file);}catch(e){throw new Error(`Invalid profile: ${e.message}`)}
 if(st.isSymbolicLink())throw new Error('Invalid profile: refusing symbolic link'); if(!st.isFile())throw new Error('Invalid profile: refusing non-regular file'); if(st.nlink!==1)throw new Error(`Invalid profile: refusing hard link (${st.nlink} links)`);
 const fd=fs.openSync(file,'r');try{const opened=fs.fstatSync(fd);if(!opened.isFile()||opened.dev!==st.dev||opened.ino!==st.ino||opened.nlink!==1)throw new Error('Invalid profile: profile identity changed or is linked');const p=JSON.parse(fs.readFileSync(fd,'utf8'));validateProfile(p);return p;}catch(e){if(e.message?.startsWith('Invalid profile:'))throw e;throw new Error(`Invalid profile: ${e.message}`)}finally{fs.closeSync(fd)}
}
function applyProfile(cfg,p){cfg.pageUrl=p.pageUrl;cfg.terminologyPairs=(p.terminology?.forbidden||[]).map(pair=>[...pair]);cfg.customRegister=[...(p.register?.forbidden||[])];Object.assign(cfg.severities,p.severities||{});for(const [id,v] of Object.entries(p.rules||{}))cfg.rules[id]={...(cfg.rules[id]||{}),...v};if(p.register)for(const x of p.register.approved||[])cfg.allowlist.register.push(x);if(p.spelling)cfg.spellings=SPELLINGS.map(([key,value])=>[key,p.spelling[key]||value]);}
function usage(){console.error('Usage: un-editorial-check [paths…] [--fix] [--profile path] [--format text|json|sarif] [--config path] [--quiet] [--self-scan]');}
export function run(argv,io={log:console.log,error:console.error}){try{const opts={paths:[],fix:false,format:'text',config:'.un-editorial.json',profile:null,quiet:false,selfScan:false};for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--fix')opts.fix=true;else if(a==='--quiet')opts.quiet=true;else if(a==='--self-scan')opts.selfScan=true;else if(a==='--help'||a==='-h'){usage();return 0;}else if(a==='--version'){io.log(VERSION);return 0;}else if(a==='--format'||a==='--config'||a==='--profile'){if(i+1>=argv.length||argv[i+1].startsWith('--'))throw new Error(`Option ${a} requires a value`);opts[a.slice(2)]=argv[++i];}else if(a.startsWith('-'))throw new Error(`Unknown option: ${a}`);else opts.paths.push(a);}if(!['text','json','sarif'].includes(opts.format))throw new Error('Invalid --format value; expected text, json or sarif');if(opts.selfScan)opts.paths=[path.join(HERE,'..')];if(!opts.paths.length)opts.paths.push('.');
 const supplied=fs.existsSync(opts.config)?JSON.parse(fs.readFileSync(opts.config,'utf8')):{};validateConfig(supplied);const cfg={...DEFAULT_CONFIG,...supplied,spellings:SPELLINGS.map(pair=>[...pair]),allowlist:{...DEFAULT_CONFIG.allowlist,...supplied.allowlist,spellings:[...(DEFAULT_CONFIG.allowlist.spellings||[]),...(supplied.allowlist?.spellings||[])],terminology:[...(DEFAULT_CONFIG.allowlist.terminology||[]),...(supplied.allowlist?.terminology||[])],register:[...(DEFAULT_CONFIG.allowlist.register||[]),...(supplied.allowlist?.register||[])]},rules:Object.fromEntries(Object.entries({...DEFAULT_CONFIG.rules,...supplied.rules}).map(([id,value])=>[id,{...(value||{})}])),severities:{...DEFAULT_CONFIG.severities,...supplied.severities}};if(opts.profile)applyProfile(cfg,loadProfile(opts.profile));
 const files=collect(opts.paths,cfg.ignoredPaths);for(const f of files){const st=fs.lstatSync(f);if(st.isSymbolicLink())throw new Error(`Refusing symbolic link: ${f}`);if(opts.fix&&st.isFile()&&st.nlink>1)throw new Error(`Refusing hard link in --fix mode (${st.nlink} links): ${f}`);}if(opts.fix)for(const f of files){const ext=path.extname(f).slice(1).toLowerCase();if(!['txt','md','markdown'].includes(ext))throw new Error(`--fix accepts prose files only (.txt or .md); refusing ${ext||'extensionless'} file: ${f}`);}
 let findings=[],fixes=[];for(const file of files){let original,fd;try{fd=fs.openSync(file,opts.fix?'r+':'r');const opened=fs.fstatSync(fd);if(opts.fix&&(!opened.isFile()||opened.nlink!==1))throw new Error(`Refusing changed or hard-linked file before write: ${file}`);original=fs.readFileSync(fd,'utf8');let text=original;if(opts.fix){let c;[text,c]=fixText(original,file,cfg);if(text!==original){const beforeWrite=fs.fstatSync(fd);if(!beforeWrite.isFile()||beforeWrite.nlink!==1||beforeWrite.dev!==opened.dev||beforeWrite.ino!==opened.ino)throw new Error(`Refusing changed or hard-linked file before write: ${file}`);fs.writeSync(fd,text,0,'utf8');}fixes.push(...c);}findings.push(...check(file,text,cfg));}finally{if(fd!==undefined)fs.closeSync(fd);}}
 findings=findings.map(f=>({...f,severity:cfg.severities[f.ruleId]||f.severity})).filter(f=>cfg.rules[f.ruleId]?.enabled!==false).sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line||a.column-b.column);
 if(opts.format==='json')io.log(JSON.stringify({version:VERSION,files:files.length,fixes,findings},null,2));else if(opts.format==='sarif')io.log(JSON.stringify({version:'2.1.0',$schema:'https://json.schemastore.org/sarif-2.1.0.json',runs:[{tool:{driver:{name:'un-editorial-check',version:VERSION,rules:[...new Set(findings.map(f=>f.ruleId))].map(id=>({id}))}},results:findings.map(f=>({ruleId:f.ruleId,level:f.severity==='error'?'error':'warning',message:{text:f.message},locations:[{physicalLocation:{artifactLocation:{uri:f.file},region:{startLine:f.line,startColumn:f.column}}}]}))}]},null,2));else if(!opts.quiet){for(const c of fixes)io.log(safeText(`fixed  ${c}`));for(const f of findings)io.log(safeText(`${f.file}:${f.line}:${f.column}  [${f.ruleId}] ${f.severity}  ${f.message}${f.suggestion?`  (${f.suggestion})`:''}`));}return findings.some(f=>f.severity==='error')?1:0;}catch(e){io.error(safeText(`un-editorial-check: ${e.message}`));return 2;}}
if(process.argv[1] && fs.existsSync(process.argv[1]) && fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1]))process.exitCode=run(process.argv.slice(2));
