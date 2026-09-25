#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VERSION = '0.1.0';
const DEFAULT_CONFIG = JSON.parse(fs.readFileSync(path.join(HERE, '../config/default.json'), 'utf8'));
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
const safeText = value => Array.from(String(value), (c,i) => { const cp=c.codePointAt(0); if(c==='\n')return '\\n'; if(c==='\r')return '\\r'; if(c==='\t')return '\\t'; if(cp<=0x1f||(cp>=0x7f&&cp<=0x9f)||cp>=0xd800&&cp<=0xdfff)return `\\${cp<=0xff?'x':'u'}${cp.toString(16).padStart(cp<=0xff?2:4,'0')}`; if((cp>=0x202a&&cp<=0x202e)||(cp>=0x2066&&cp<=0x2069))return `\\u${cp.toString(16)}`; return c; }).join('');
const decodeEntities = s => s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10))).replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[n.toLowerCase()])).replace(/\s+/g,' ').trim();
const add=(s,line,col,id)=>s.push({file:line.file,line:line.no,column:col+1,id,severity:RULES[id][0],message:RULES[id][1],suggestion:RULES[id][2],ruleId:id});
const emit=(s,line,col,id,allow=true)=>{ if(allow && !/(?:ue:ignore)(?:\s+all|\s+UE-([A-Z]{2}\d{3}))/i.test(line.text) || allow===false) add(s,line,col,id); };
function visibleProse(line){ return line.text.replace(/<[^>]*>/g,' ').replace(/https?:\/\/\S+/g,' ').replace(/`[^`]*`/g,' '); }
function checkProse(store,line,ext,ctx){
 const p=visibleProse(line), suppressed=id=>new RegExp(`ue:ignore(?:\\s+all|\\s+${id})`,'i').test(line.text);
 for(const [us,uk] of SPELLINGS){ if(ctx.allow.has(us)||ctx.allow.has(uk)) continue; const m=p.match(new RegExp(`\\b${us}\\b`,'i')); if(m&&!suppressed('UE-SP001')&&!ctx.mixed?.has(us)) add(store,line,m.index,'UE-SP001'); }
 const checks=[
  ['UE-TE001',/\bmaternal deaths\b/i],['UE-TE002',/\b(?:women's work|female work)\b/i],
  ['UE-TE004',/(?<![A-Za-z])(?:U\.S\.|US)(?![A-Za-z])/],['UE-NU001',/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/],
  ['UE-NU002',/\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\b/]
 ];
 for(const [id,re] of checks){const m=p.match(re);if(m&&!suppressed(id))add(store,line,m.index,id);}
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
 // Multiline assignment: inspect the complete statement rather than a single line.
 for(let i=0;i<lines.length;i++) if(/\.(?:innerHTML|outerHTML)\s*=/.test(lines[i].text)){
  const stmt=lines.slice(i,Math.min(i+6,lines.length)).map(x=>x.text).join('\n').split(';')[0];
  if(/\b(?:response|json|geojson|country|entity|properties|external|data|value|fetched|remote)\b/i.test(stmt)&&!suppress(lines,i,'UE-SE001')) add(store,lines[i],lines[i].text.indexOf('innerHTML')>=0?lines[i].text.indexOf('innerHTML'):lines[i].text.indexOf('outerHTML'),'UE-SE001');
 }
 for(const l of lines){
  if(/\.bindTooltip\s*\(/.test(l.text)&&!/(?:DOM|document\.|createElement|tooltipEl)/.test(l.text)&&!suppress(l,'UE-SE004'))add(store,l,l.text.indexOf('.bindTooltip'),'UE-SE004');
 }
 for(const m of text.matchAll(/https?:\/\/[^\s'"`)>]+/g)) if(/\/(?:latest|dev|trunk|main|master)(?:\/|$)/i.test(m[0])&&!suppress({text,no:text.slice(0,m.index).split('\n').length,file},'UE-SE003')) add(store,{file,no:text.slice(0,m.index).split('\n').length},m.index,'UE-SE003');
}
function suppress(l,i,id){return new RegExp(`ue:ignore(?:\\s+all|\\s+${id})`,'i').test(l.text)||(i>0&&new RegExp(`ue:ignore(?:\\s+all|\\s+${id})`,'i').test(l.text));}
function checkHtml(file,text,store,ctx){
 const title=text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i); if(title&&[...decodeEntities(title[1])].length>60)add(store,{file,no:text.slice(0,title.index).split('\n').length},title.index,'UE-EO001');
 const tags=[...text.matchAll(/<meta\b[^>]*>/gi)]; const desc=tags.find(m=>/\bname\s*=\s*["']description["']/i.test(m[0])); const attr=(tag,name)=>tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1]??'';
 if(desc&&[...decodeEntities(attr(desc[0],'content'))].length>160)add(store,{file,no:1},desc.index,'UE-EO002');
 const links=[...text.matchAll(/<link\b[^>]*>/gi)]; const can=links.find(m=>/\brel\s*=\s*["']canonical["']/i.test(m[0])); const href=can?decodeEntities(attr(can[0],'href')):'';
 let canonicalUrl=null,baseUrl=null;try{if(/^https?:\/\//i.test(href))canonicalUrl=new URL(href);if(ctx.baseOrigin)baseUrl=new URL(ctx.baseOrigin);}catch{} if(!canonicalUrl||(baseUrl&&canonicalUrl.origin!==baseUrl.origin))add(store,{file,no:1},can?.index??0,'UE-EO003');
 if((text.match(/<h1\b/gi)||[]).length!==1)add(store,{file,no:1},0,'UE-EO004');
 if(!/\bproperty\s*=\s*["']og:/i.test(text)||!/\bname\s*=\s*["']twitter:/i.test(text))add(store,{file,no:1},0,'UE-EO005');
 for(const m of text.matchAll(/<canvas\b([^>]*)>([\s\S]*?)<\/canvas>/gi))if(!/aria-label|aria-labelledby/i.test(m[1])&&!/<figcaption/i.test(m[2]))add(store,{file,no:text.slice(0,m.index).split('\n').length},m.index,'UE-AX001');
 for(const m of text.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi))if(!/\bfor\s*=/i.test(m[1])&&!/<(?:input|select|textarea)\b/i.test(m[2]))add(store,{file,no:text.slice(0,m.index).split('\n').length},m.index,'UE-AX002');
 const sri=/\bintegrity\s*=\s*["'](sha384)-([A-Za-z0-9+/]+={0,2})["']/i;
 for(const m of text.matchAll(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["'](?:https?:)?\/\/[^"']+["'][^>]*>/gi)){
  const tag=m[0],tagName=m[0].match(/^<(script|link)/i)[1].toLowerCase(),url=m[0].match(/(?:src|href)\s*=\s*["']([^"']+)/i)[1];
  if(tagName==='link'&&!/rel\s*=\s*["']stylesheet["']/i.test(tag))continue;
  const exact=/(?:[@\-/]|version[=_-])\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?/i.test(url)&&!/(?:latest|dev|trunk|main|master)(?:[\/?#]|$)/i.test(url);
  const hash=sri.exec(tag)?.[2],validHash=hash&&Buffer.from(hash,'base64').length===48&&/^[A-Za-z0-9+/]+={0,2}$/.test(hash);
  if(!exact||!validHash||!/crossorigin\s*=\s*["']anonymous["']/i.test(tag))add(store,{file,no:text.slice(0,m.index).split('\n').length},m.index,'UE-SE002');
 }
}
function check(file,text,cfg){const ext=path.extname(file).slice(1).toLowerCase(),store=[],mixed=new Set(SPELLINGS.filter(([us,uk])=>new RegExp(`\\b${us}\\b`,'i').test(text)&&new RegExp(`\\b${uk}\\b`,'i').test(text)).map(x=>x[0])),ctx={allow:new Set(cfg.allowlist.spellings.map(x=>x.toLowerCase())),allowRegister:new Set(cfg.allowlist.register.map(x=>x.toLowerCase())),baseOrigin:cfg.baseOrigin||null,mixed};
 if(['html','htm'].includes(ext))checkHtml(file,text,store,ctx);
 text.split(/\r?\n/).forEach((s,i)=>{if(!/^\s*(?:```|~~~|<!--)/.test(s))checkProse(store,{file,text:s,no:i+1},ext,ctx);});
 checkCodeSecurity(store,text,ext,file);
 const textLower=text.toLowerCase(); for(const [us,uk]of SPELLINGS)if(new RegExp(`\\b${us}\\b`,'i').test(text)&&new RegExp(`\\b${uk}\\b`,'i').test(text))add(store,{file,no:1},0,'UE-SP002');
 if(cfg.spellingReview)for(const word of cfg.allowlist.spellings)if(new RegExp(`\\b${esc(word)}\\b`,'i').test(text))add(store,{file,no:1},0,'UE-SP003');
 return store;
}
function globRe(glob){let out='^(?:.*/)?';for(let i=0;i<glob.length;i++){const c=glob[i];if(c==='*'){if(glob[i+1]==='*'){i++;if(glob[i+1]==='/'){i++;out+='(?:.*/)?';}else out+='.*';}else out+='[^/]*';}else out+=c.replace(/[.+?^${}()|[\]\\]/g,'\\$&');}return new RegExp(out+'$');}
function collect(inputs,ignored){const out=[],seen=new Set(),patterns=ignored.map(globRe);for(const input of inputs){const st=fs.lstatSync(input);if(st.isSymbolicLink()){if(seen.has(input))continue;seen.add(input);out.push(input);continue;}if(st.isFile()){out.push(input);continue;}const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name),n=p.replaceAll('\\','/');if(patterns.some(r=>r.test(n)))continue;if(e.isDirectory())walk(p);else if(e.isFile()&&!e.isSymbolicLink()&&/\.(html?|md|txt|js|mjs|cjs|json)$/i.test(e.name)&&!seen.has(p)){seen.add(p);out.push(p);}}};walk(input);}return out;}
function fixText(text,file,cfg){let out=text,changes=[];if(cfg.allowlist.spellings.length)return[text,changes];
 // Mask everything except plain text: comments, code, tags, URLs/paths, inline code and quoted titles.
 const masked=text.replace(/<!--[\s\S]*?-->|```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|https?:\/\/\S*|(?:^|\s)(?:\/|\.\/)[^\s]*|(?:^|\s)(?:\/\/|\/\*)[^\n]*|(?:^|\s)(?:#|\/\/)[^\n]*|<\/?[A-Za-z][^>]*>|"(?:[^"\n]*)"|“(?:[^”\n]*)”/g,m=>m.replace(/[^\n]/g,' '));
 for(const [us,uk]of SPELLINGS){const re=new RegExp(`\\b${us}\\b`,'gi');out=out.replace(re,(m,off)=>{const pos=off+m.indexOf(m);if(masked.slice(pos,pos+m.length)!==' '.repeat(m.length))return m;const pair=SPELLINGS.find(x=>x[0]===m.toLowerCase());changes.push(`${file}:${text.slice(0,off).split('\n').length} ${m} → ${pair[1]}`);return pair[1];});}
 return[out,changes];
}
function validateConfig(c){const err=m=>{throw new Error(`Invalid configuration: ${m}`)};const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);if(!plain(c))err('expected a plain object');const known=new Set(['ignoredPaths','allowlist','severities','rules','spellingReview','baseOrigin']);for(const k of Object.keys(c))if(!known.has(k))err(`unknown top-level key "${k}"`);if(c.baseOrigin!==undefined){try{const u=new URL(c.baseOrigin);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{err('baseOrigin must be an absolute http(s) URL')}}if(c.spellingReview!==undefined&&typeof c.spellingReview!=='boolean')err('spellingReview must be a boolean');if(c.ignoredPaths!==undefined&&(!Array.isArray(c.ignoredPaths)||c.ignoredPaths.some(x=>typeof x!=='string')))err('ignoredPaths must be an array of strings');
 for(const k of ['allowlist','severities','rules'])if(c[k]!==undefined&&!plain(c[k]))err(`${k} must be a plain object`);for(const k of ['spellings','terminology','register'])if(c.allowlist?.[k]!==undefined&&(!Array.isArray(c.allowlist[k])||c.allowlist[k].some(x=>typeof x!=='string')))err(`allowlist.${k} must be an array of strings`);if(c.severities)for(const [id,v]of Object.entries(c.severities)){if(!RULES[id])err(`unknown rule ID ${id}`);if(!['error','warning','info'].includes(v))err(`invalid severity for ${id}`);}if(c.rules)for(const [id,v]of Object.entries(c.rules)){if(!RULES[id])err(`unknown rule ID ${id}`);if(!plain(v)||typeof v.enabled!=='boolean')err(`rules.${id} must contain a boolean enabled value`);}}
function usage(){console.error('Usage: un-editorial-check [paths…] [--fix] [--format text|json|sarif] [--config path] [--quiet]');}
export function run(argv,io={log:console.log,error:console.error}){try{const opts={paths:[],fix:false,format:'text',config:'.un-editorial.json',quiet:false};for(let i=0;i<argv.length;i++){const a=argv[i];if(a==='--fix')opts.fix=true;else if(a==='--quiet')opts.quiet=true;else if(a==='--help'||a==='-h'){usage();return 0;}else if(a==='--version'){io.log(VERSION);return 0;}else if(a==='--format'||a==='--config'){if(i+1>=argv.length||argv[i+1].startsWith('--'))throw new Error(`Option ${a} requires a value`);opts[a.slice(2)]=argv[++i];}else if(a.startsWith('-'))throw new Error(`Unknown option: ${a}`);else opts.paths.push(a);}if(!['text','json','sarif'].includes(opts.format))throw new Error('Invalid --format value; expected text, json or sarif');if(!opts.paths.length)opts.paths.push('.');
 const supplied=fs.existsSync(opts.config)?JSON.parse(fs.readFileSync(opts.config,'utf8')):{};validateConfig(supplied);const cfg={...DEFAULT_CONFIG,...supplied,allowlist:{...DEFAULT_CONFIG.allowlist,...supplied.allowlist},rules:{...DEFAULT_CONFIG.rules,...supplied.rules},severities:{...DEFAULT_CONFIG.severities,...supplied.severities}};validateConfig(cfg);
 const files=collect(opts.paths,cfg.ignoredPaths);if(opts.fix)for(const f of files)if(fs.lstatSync(f).isSymbolicLink())throw new Error(`Refusing symbolic link in --fix mode: ${f}`);
 let findings=[],fixes=[];for(const file of files){const original=fs.readFileSync(file,'utf8');let text=original;if(opts.fix){let c;[text,c]=fixText(original,file,cfg);if(text!==original)fs.writeFileSync(file,text);fixes.push(...c);}findings.push(...check(file,text,cfg));}
 findings=findings.map(f=>({...f,severity:cfg.severities[f.ruleId]||f.severity})).filter(f=>cfg.rules[f.ruleId]?.enabled!==false).sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line||a.column-b.column);
 if(opts.format==='json')io.log(JSON.stringify({version:VERSION,files:files.length,fixes,findings},null,2));else if(opts.format==='sarif')io.log(JSON.stringify({version:'2.1.0',$schema:'https://json.schemastore.org/sarif-2.1.0.json',runs:[{tool:{driver:{name:'un-editorial-check',version:VERSION,rules:[...new Set(findings.map(f=>f.ruleId))].map(id=>({id}))}},results:findings.map(f=>({ruleId:f.ruleId,level:f.severity==='error'?'error':'warning',message:{text:f.message},locations:[{physicalLocation:{artifactLocation:{uri:f.file},region:{startLine:f.line,startColumn:f.column}}}]}))}]},null,2));else if(!opts.quiet){for(const c of fixes)io.log(safeText(`fixed  ${c}`));for(const f of findings)io.log(safeText(`${f.file}:${f.line}:${f.column}  [${f.ruleId}] ${f.severity}  ${f.message}${f.suggestion?`  (${f.suggestion})`:''}`));}return findings.some(f=>f.severity==='error')?1:0;}catch(e){io.error(safeText(`un-editorial-check: ${e.message}`));return 2;}}
if(process.argv[1] && fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1]))process.exitCode=run(process.argv.slice(2));
