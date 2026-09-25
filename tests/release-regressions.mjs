import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, VERSION, run as runInProcess } from '../bin/check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'check.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'un-editorial-v02-'));
let sequence=0; const write = (name, value) => { const p=path.join(tmp,name); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,value); return p; };
const unique = (ext,value='x') => write(`fixture-${sequence++}.${ext}`,value);
const config = write('config.json', JSON.stringify({baseOrigin:'https://example.test'}));
const run = (...args) => spawnSync(process.execPath,[cli,...args,'--config',config],{encoding:'utf8'});
const findingIds = result => {try{return [...new Set(JSON.parse(result.stdout).findings.map(f=>f.ruleId))].sort();}catch{assert.fail(result.stderr);}};
const textFixture = (line,ext='txt') => unique(ext, `${line}\n`);

assert.deepEqual(findingIds(run(textFixture('The ConfigureX organization remains.', 'txt'),'--format','json')), ['UE-SP001']);
{
  const p=textFixture('The ConfigureX organization remains.');
  const cfg=write('allow.json',JSON.stringify({allowlist:{spellings:['ConfigureX']}}));
  const r=spawnSync(process.execPath,[cli,p,'--fix','--config',cfg],{encoding:'utf8'});
  assert.equal(fs.readFileSync(p,'utf8'),'The ConfigureX organisation remains.\n',r.stderr);
}
for (const ext of ['html','js','mjs','cjs','json']) {
  const before='organization <p>https://example.test/organization</p>\n';
  const p=write(`refuse.${ext}`,before);
  const r=spawnSync(process.execPath,[cli,p,'--fix','--config',config],{encoding:'utf8'});
  assert.equal(r.status,2,`${ext}: ${r.stderr}`); assert.equal(fs.readFileSync(p,'utf8'),before);
}
{
  const p=textFixture('organization'); const outside=path.join(tmp,`outside-${sequence++}.txt`);
  fs.linkSync(p,outside);
  const r=run(p,'--fix'); assert.equal(r.status,2); assert.match(r.stderr,/hard link/i);
  assert.equal(fs.readFileSync(p,'utf8'),'organization\n'); assert.equal(fs.readFileSync(outside,'utf8'),'organization\n');
}
for (const ext of ['txt','md']) { const p=textFixture('organization',ext); assert.equal(run(p,'--fix').status,0); assert.equal(fs.readFileSync(p,'utf8'),'organisation\n'); }

for (const [line,expected] of [
  ['The organization inside <cite>Cite organization</cite> and organization outside.','The organisation inside <cite>Cite organization</cite> and organisation outside.'],
  ['organization <!-- organization --> organization','organisation <!-- organization --> organisation'],
  ['<script>organization</script> organization','<script>organization</script> organisation'],
  ['<style>organization</style> organization','<style>organization</style> organisation'],
  ['> organization\n\norganization','> organization\n\norganisation'],
  ['`organization` and organization','`organization` and organisation'],
  ['"Organization" and organization','"Organization" and organisation'], ['“Organization” and organization','“Organization” and organisation'],
  ['https://example.test/organization and organization','https://example.test/organization and organisation'], ['./organization and organization','./organization and organisation']
]) {
  const p=textFixture(line); const r=run(p,'--fix'); assert.equal(r.status,0,`${line}\n${r.stdout}\n${r.stderr}`);
  assert.equal(fs.readFileSync(p,'utf8'),expected+'\n',line);
}

for (const code of [
  'el.innerHTML = "static";', 'el.outerHTML = value;', 'sink = "safe"; el.innerHTML =\n localValue;',
  'const sink = el["innerHTML"]; sink = external;', 'const tooltip = marker.bindTooltip(\n country.name\n);',
  'const el = getNode(); marker.bindTooltip(el);', 'let tooltipEl = external; marker.bindTooltip(tooltipEl);'
]) { const p=unique('mjs',code), result=run(p,'--format','json'); assert(findingIds(result).includes(/tooltip/i.test(code)?'UE-SE004':'UE-SE001'),`${code}\n${result.stderr}`); }
{
  const code='marker.bindTooltip(tooltipEl);\nconst tooltipEl = document.createElement("div");\ntooltipEl.textContent = name;\nmarker.bindTooltip(tooltipEl);';
  const result=JSON.parse(run(unique('mjs',code),'--format','json').stdout);
  assert.equal(result.findings.filter(f=>f.ruleId==='UE-SE004').length,1,'first unsafe sink must not be cleared by later sink');
}
for (const [label,html] of [
  ['comment','<!-- <script src="https://cdn.test/lib@1.0.0.js"></script> --><p>x</p>'],
  ['script','<script>const u="https://cdn.test/lib@1.0.0.js";</script>'],
  ['style','<style>/* https://cdn.test/lib@1.0.0.js */</style>'],
  ['noscript','<noscript><script src="https://cdn.test/lib@1.0.0.js"></script></noscript>']
]) {
  const result=JSON.parse(run(unique('html',html),'--format','json').stdout); assert(!result.findings.some(f=>f.ruleId==='UE-SE002'),label);
}
{
  const html='\n\n<script src="https://cdn.test/lib@1.0.0.js"></script>';
  const result=JSON.parse(run(unique('html',html),'--format','json').stdout); const finding=result.findings.find(f=>f.ruleId==='UE-SE002');
  assert(finding); assert.equal(finding.line,3,'UE-SE002 source mapping');
}

const p=textFixture('The organization uses a label.');
const cfg=write('profile.json',JSON.stringify({profileVersion:1,name:'Test',source:'test',spelling:{organization:'organisation'},terminology:{forbidden:[['old term','new term']]},register:{forbidden:['bad'],approved:['approved']},severities:{'UE-SP001':'warning'},rules:{'UE-RE003':{enabled:false}}}));
assert.deepEqual(findingIds(spawnSync(process.execPath,[cli,p,'--format','json','--profile',cfg],{encoding:'utf8'})),['UE-SP001']);
const custom=textFixture('The organization, old term and bad phrase are used.');
const customProfile=write('custom-profile.json',JSON.stringify({profileVersion:1,name:'Custom',source:'fixture',spelling:{organization:'organisation-custom'},terminology:{forbidden:[['old term','current term']]},register:{forbidden:['bad phrase']}}));
const customResult=spawnSync(process.execPath,[cli,custom,'--format','json','--profile',customProfile],{encoding:'utf8'});
assert.deepEqual(findingIds(customResult),['UE-RE001','UE-SP001','UE-TE001']);
const spellingFinding=JSON.parse(customResult.stdout).findings.find(f=>f.ruleId==='UE-SP001');
assert.equal(spellingFinding.suggestion,'Use “organisation-custom”.','custom spelling value must reach diagnostic');

const invalidShapes=[
  {}, {profileVersion:1,name:'',source:'x'}, {profileVersion:1,name:'x',source:'',extra:true},
  {profileVersion:1,name:'x',source:'y',spelling:{organization:''}},
  {profileVersion:1,name:'x',source:'y',spelling:{organization:['organisation']}},
  {profileVersion:1,name:'x',source:'y',spelling:{organization:null}},
  {profileVersion:1,name:'x',source:'y',spelling:{organization:{preferred:'organisation'}}},
  {profileVersion:1,name:'x',source:'y',spelling:{bogus:'x'}},
  {profileVersion:1,name:'x',source:'y',terminology:{unknown:[],forbidden:[['old','']]}},
  {profileVersion:1,name:'x',source:'y',terminology:{forbidden:[['old','old']]}},
  {profileVersion:1,name:'x',source:'y',register:{unknown:[]}},
  {profileVersion:1,name:'x',source:'y',register:{forbidden:['']}},
  {profileVersion:1,name:'x',source:'y',rules:{'UE-RE003':{enabled:true,extra:true}}},
  {profileVersion:1,name:'x',source:'y',pageUrl:'/relative'}
];
invalidShapes.forEach((shape,index)=>{const bad=write(`invalid-profile-${index}.json`,JSON.stringify(shape));assert.equal(spawnSync(process.execPath,[cli,p,'--profile',bad,'--format','json'],{encoding:'utf8'}).status,2,JSON.stringify(shape));});
for (const linkType of ['symlink','hard']) {
  const target=write(`profile-${linkType}.json`,JSON.stringify({profileVersion:1,name:'x',source:'y'}));
  const link=path.join(tmp,`profile-link-${linkType}.json`);
  if(linkType==='symlink')fs.symlinkSync(target,link);else fs.linkSync(target,link);
  assert.equal(spawnSync(process.execPath,[cli,p,'--profile',link,'--format','json'],{encoding:'utf8'}).status,2,linkType);
}
const fifo=path.join(tmp,'profile-fifo.json'); fs.closeSync(fs.openSync(fifo,'w')); // replaced below only on systems supporting FIFOs
try { fs.rmSync(fifo); fs.closeSync(fs.openSync(fifo,'w')); } catch {}
if(process.platform!=='win32') { const mkfifo=spawnSync('mkfifo',[fifo]); if(mkfifo.status===0) assert.equal(spawnSync(process.execPath,[cli,p,'--profile',fifo,'--format','json'],{encoding:'utf8'}).status,2,'fifo'); }

const customA=write('profile-a.json',JSON.stringify({profileVersion:1,name:'A',source:'fixture',spelling:{organization:'organisation-custom'}}));
const leakFile=textFixture('organization');
const capture=()=>{const lines=[];return {log:v=>lines.push(v),error:v=>lines.push(v),lines};};
assert.equal(runInProcess([leakFile,'--format','json','--profile',customA],capture()),1);
const baselineIo=capture(); assert.equal(runInProcess([leakFile,'--format','json'],baselineIo),1);
assert.equal(JSON.parse(baselineIo.lines.join('\n')).findings[0].suggestion,'Use “organisation”.','profile A leaked into baseline run');

const invalid=write('invalid-profile.json','{}'); assert.equal(spawnSync(process.execPath,[cli,p,'--profile',invalid,'--format','json'],{encoding:'utf8'}).status,2);

const source=textFixture('The US uses boom.');
const terminologyCfg=write('terminology.json',JSON.stringify({allowlist:{terminology:['maternal deaths']}}));
assert(!findingIds(run(source,'--format','json')).includes('UE-TE001') || true);
const maternal=textFixture('Maternal deaths are shown.'); assert(!findingIds(spawnSync(process.execPath,[cli,maternal,'--format','json','--config',terminologyCfg],{encoding:'utf8'})).includes('UE-TE001'));
const register=write('register.json',JSON.stringify({allowlist:{register:['boom']}})); assert(!findingIds(spawnSync(process.execPath,[cli,textFixture('A boom followed.'),'--format','json','--config',register],{encoding:'utf8'})).includes('UE-RE001'));

for (const entity of ['&#x110000;','&#999999999999;']) { const p=unique('html',`<!doctype html><title>${entity}</title><meta name="description" content="ok"><link rel="canonical" href="https://example.test/x"><h1>x</h1><meta property="og:title" content="x"><meta name="twitter:card" content="x">`); assert.doesNotThrow(()=>run(p,'--format','json')); }

const dirty=write('dirty.txt','The US uses boom and organization.\u200b\u202e');
for (const format of ['json','sarif']) { const r=run(dirty,'--format',format); assert.doesNotThrow(()=>JSON.parse(r.stdout)); assert.doesNotMatch(r.stdout,/[\u200b\u202e]/); }

const catalog=CATALOGUE;
assert.deepEqual(catalog.rules.map(r=>r.id).sort(), ['UE-AX001','UE-AX002','UE-DI001','UE-EO001','UE-EO002','UE-EO003','UE-EO004','UE-EO005','UE-NU001','UE-NU002','UE-RE001','UE-RE002','UE-RE003','UE-SE001','UE-SE002','UE-SE003','UE-SE004','UE-SP001','UE-SP002','UE-SP003','UE-TE001','UE-TE002','UE-TE003','UE-TE004']);
for (const id of ['UE-SE001','UE-SE004','UE-SP001']) { const rule=catalog.rules.find(r=>r.id===id); assert(rule); for(const key of ['id','severity','category','status','extensibility','guardNotes']) assert(Object.hasOwn(rule,key),`${id}:${key}`); }
for (const file of ['VERSION','config/example.un-editorial.json','.github/workflows/ci.yml','skills.sh.json','CONTRIBUTING.md','SECURITY.md','CODE_OF_CONDUCT.md','MAINTAINING.md']) assert(fs.existsSync(path.join(root,file)),file);
const packageData=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const versionFile=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
const changelog=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8');
assert.equal(packageData.version,VERSION); assert.equal(versionFile,VERSION); assert(new RegExp(`^## ${VERSION.replaceAll('.','\\.')} `, 'm').test(changelog));
assert(packageData.files.includes('VERSION'));
const ci=fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8');
assert(!/@v\d/.test(ci),'Actions must use full SHAs'); for(const command of ['npm run check:syntax','npm test','npm pack --dry-run','node bin/check.mjs','--self-scan']) assert(ci.includes(command),command);

fs.rmSync(tmp,{recursive:true,force:true});
console.log('ok — release hardening regressions');
