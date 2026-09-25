import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from '../bin/check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'check.mjs');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'un-editorial-'));
const write = (name, text) => { const p = path.join(tmpRoot, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };
const config = write('config.json', JSON.stringify({ allowlist: { spellings: ['ConfigureX'], terminology: [], register: [] }, baseOrigin: 'https://example.test' }));
const capture = argv => { const out=[], err=[]; const code=run(argv,{log:v=>out.push(String(v)),error:v=>err.push(String(v))}); return { code, stdout: out.join('\n'), stderr: err.join('\n') }; };
const ids = result => [...new Set(JSON.parse(result.stdout).findings.map(f=>f.ruleId))].sort();
const SRI = 'A'.repeat(64);
const html = (head='', body='<h1>Page</h1>') => `<!doctype html><html><head><title>Valid</title><meta name="description" content="Short"><link rel="canonical" href="https://example.test/page"><meta property="og:title" content="Title"><meta name="twitter:card" content="summary">${head}</head><body>${body}</body></html>`;

// The exact expected-rule corpus. Each file is isolated, so incidental findings fail the test.
const bad = {
  'UE-SP001': ['organization in prose.', 'txt'], 'UE-SP002': ['organization and organisation.', 'txt'],
  'UE-TE001': ['Maternal deaths are shown.', 'txt'], 'UE-TE002': ["Women's work is shown.", 'txt'],
  'UE-TE003': ['Progress reached 25% this year.', 'txt'], 'UE-TE004': ['The US reported a value.', 'txt'],
  'UE-NU001': ['Recorded on 11/09/2026.', 'txt'], 'UE-NU002': ['Coverage was 1990-2025.', 'txt'],
  'UE-RE001': ['A boom followed.', 'txt'], 'UE-RE002': ["const label = 'smallest region';", 'mjs'],
  'UE-RE003': ['The value was 25 per cent.', 'txt'], 'UE-DI001': ['The dashboard covers 258 economies.', 'txt'],
  'UE-SE001': ['el.innerHTML = response.data;', 'mjs'], 'UE-SE002': ['<script src="https://cdn.example.test/a.js"></script>', 'html'],
  'UE-SE003': ["const u='https://example.test/geo/master/data.json';", 'mjs'], 'UE-SE004': ['marker.bindTooltip(country.name);', 'mjs']
};
for (const [id, [snippet, ext]] of Object.entries(bad)) {
  const p = write(`bad/${id}.${ext}`, (id === 'UE-SE002' ? html('', `<h1>Page</h1>${snippet}`) : snippet) + '\n');
  const r = capture([p, '--format', 'json', '--config', config]);
  assert.deepEqual(ids(r), [id], `${id} must fire exactly: ${r.stdout}`);
}
// Remaining HTML rules.
const htmlBad = {
  'UE-EO001': html().replace('<title>Valid</title>', '<title>' + 'Long title '.repeat(8) + '</title>'),
  'UE-EO002': html().replace('<meta name="description" content="Short">', '<meta name="description" content="' + 'Long description '.repeat(20) + '">'),
  'UE-EO003': html().replace('https://example.test/page', 'https://other.test/page'),
  'UE-EO004': html('', '<h1>One</h1><h1>Two</h1>'), 'UE-EO005': html().replace(/<meta property="og:title"[^>]+>|<meta name="twitter:card"[^>]+>/g, ''),
  'UE-AX001': html('', '<h1>Page</h1><canvas></canvas>'), 'UE-AX002': html('', '<h1>Page</h1><label>Name</label>')
};
for (const [id, source] of Object.entries(htmlBad)) {
  const p=write(`bad/${id}.html`, source); const r=capture([p,'--format','json','--config',config]);
  assert.deepEqual(ids(r), [id], `${id} must fire exactly: ${r.stdout}`);
}
const good = [
  ['sp001.txt','The organisation uses a neutral register.\n'], ['sp002.txt','The organisation uses British spelling.\n'],
  ['sp003.txt','The product is ConfigureX.\n'], ['te001.txt','The maternal mortality ratio is 200 per 100,000 live births (World Bank, 2023).\n'],
  ['te002.txt','The female labour-force participation rate is approximately 50 per cent (ILO, 2024).\n'], ['te003.html',html('', '<h1>Page</h1><div class="stat-tile">25%</div>')],
  ['te004.txt','The United States reported a value.\n'], ['nu001.txt','The value was recorded on 9 November 2026.\n'],
  ['nu002.txt','Coverage was 1990–2025.\n'], ['re001.txt','The value increased in 2025.\n'],
  ['re002.mjs','const label = deriveComparison(rows);\n'], ['re003.txt','Approximately 25 per cent of respondents were surveyed in 2025.\n'],
  ['di001.txt','The map draws 171 economies with a reported value as of 2025.\n'],
  ['se001.mjs','el.textContent = response.data;\n'], ['se002.html', html(`<script src="https://cdn.example.test/a-1.2.3.js" integrity="sha384-${SRI}" crossorigin="anonymous"></script>`)],
  ['se003.mjs',"const prose='The main and master branches matter.';\nconst u='https://example.test/geo/0123456789abcdef/data.json';\n"], ['se004.mjs','const el=document.createElement("span");el.textContent=country.name;marker.bindTooltip(el);\n']
];
for (const [name,text] of good) { const p=write(`good/${name}`,text); const r=capture([p,'--format','json','--config',config]); assert.deepEqual(ids(r), [], `${name} must be clean: ${r.stdout}`); }
for (const [name,text] of good) { const p=write(`good2/${name}`,text); const r=capture([p,'--format','json','--config',config]); assert.deepEqual(ids(r), [], `${name} must be clean`); }

// Security, safety and config validation.
const target=write('target.txt','organization\n'); const link=path.join(tmpRoot,'link.txt'); try{fs.symlinkSync(target,link);}catch{}
if(fs.existsSync(link)){ const r=capture([link,'--fix','--config',config]); assert.equal(r.code,2); assert.equal(fs.readFileSync(target,'utf8'),'organization\n'); assert.match(r.stderr,/symbolic link/i); }
const controls='A\u0000B\nC\rD\tE\u001bF\u007fG\u0085H\u009bI\u202eJ\u2067K'; const ctl=write(`ctl\u001b[202e name.txt`,`organization ${controls}\n`); const cr=capture([ctl,'--config',config]); assert.doesNotMatch(cr.stdout, /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/); assert(cr.stdout.includes('\\x1b'),`missing escaped filename ESC: ${cr.stdout}`);
const protectedFix=write('protected.txt',[
  '<p>organization</p> <!-- organization --> `organization` <cite>organization</cite>',
  'https://example.test/organization "Published Organization Title"',
  "const s='organization'; // organization",
  'The date 11/09/2026 and 25% remain unchanged.'
].join('\n')+'\n'); const before=fs.readFileSync(protectedFix,'utf8'); capture([protectedFix,'--fix','--config',config]); assert.equal(fs.readFileSync(protectedFix,'utf8'),before);
for (const [body,id] of [[html('<script src="https://cdn.example.test/a.js" integrity="nope" crossorigin="anonymous"></script>'),'UE-SE002'], [html('<script src="https://cdn.example.test/a-latest.js" integrity="sha384-${SRI}" crossorigin="anonymous"></script>'),'UE-SE002'], ['el.innerHTML =\n  response.data;','UE-SE001']]) { const p=write(`edge-${id}-${Math.random()}.${id==='UE-SE002'?'html':'mjs'}`,body+'\n'); const r=capture([p,'--format','json','--config',config]); assert(ids(r).includes(id),`expected ${id}`); }
const mismatch=write('mismatch.html',html().replace('https://example.test/page','https://other.test/page')); assert(ids(capture([mismatch,'--format','json','--config',config])).includes('UE-EO003'));
for (const [label,canonical] of [['scheme','http://example.test/page'],['port','https://example.test:444/page'],['hostname','https://other.test/page']]) { const p=write(`origin-${label}.html`,html().replace('https://example.test/page',canonical)); assert(ids(capture([p,'--format','json','--config',config])).includes('UE-EO003'),`${label} mismatch`); }
const noBase=write('nobase.json',JSON.stringify({baseOrigin:undefined})); assert(!ids(capture([mismatch,'--format','json','--config',noBase])).includes('UE-EO003'),'absolute-only check');
for (const branch of ['latest','dev','trunk']) { const p=write(`mutable-${branch}.mjs`,`const u='https://example.test/geo/${branch}/data.json';\n`); assert(ids(capture([p,'--format','json','--config',config])).includes('UE-SE003'),branch); }
const apostropheFix=write('apostrophe.txt',"It isn't organization's plan. Published \"Organization Title\" remains.\n"); capture([apostropheFix,'--fix','--config',config]); assert.equal(fs.readFileSync(apostropheFix,'utf8'),"It isn't organization's plan. Published \"Organization Title\" remains.\n");
const configErrors=[
  [{baseOrigin:'ftp://example.test'},/baseOrigin.*absolute http\(s\) URL/i],
  [{baseOrigin:'file:///tmp'},/baseOrigin.*absolute http\(s\) URL/i],
  [{baseOrigin:'javascript:alert(1)'},/baseOrigin.*absolute http\(s\) URL/i],
  [{baseOrigin:'/relative'},/baseOrigin.*absolute http\(s\) URL/i],
  [{baseOrigin:null},/baseOrigin.*absolute http\(s\) URL/i],
  [{spellingReview:'false'},/spellingReview must be a boolean/i],
  [{allowlist:null},/allowlist must be a plain object/i],
  [{allowlist:[]},/allowlist must be a plain object/i],
  [{allowlist:{spellings:null}},/allowlist\.spellings must be an array of strings/i],
  [{rules:null},/rules must be a plain object/i],
  [{rules:[]},/rules must be a plain object/i],
  [{severities:'error'},/severities must be a plain object/i],
  [{severities:null},/severities must be a plain object/i],
  [{unknownSetting:true},/unknown top-level key "unknownSetting"/]
];
for (const [settings,re] of configErrors) { const p=write(`invalid-${Math.random()}.json`,JSON.stringify(settings)); const r=capture(['--config',p]); assert.equal(r.code,2,`${JSON.stringify(settings)}: ${r.stderr}`); assert.match(r.stderr,re,r.stderr); }
// Entity decoding and whitespace-normalised rendered length.
const encoded=write('encoded.html',html('<meta name="description" content="' + 'A&amp;B '.repeat(40) + '">').replace('<title>Valid</title>','<title>One &amp; two</title>'));
assert(!ids(capture([encoded,'--format','json','--config',config])).includes('UE-EO002'));
// Clause-scoped hedge.
const clauses=write('clauses.txt','Approximately 10 per cent. The other value was 20 per cent.\n'); assert.deepEqual(ids(capture([clauses,'--format','json','--config',config])),['UE-RE003']);
// Normalised glob directory pruning, including similar substrings.
const ignored=write('ignore/node_modules/a.txt','boom\n'), sibling=write('ignore/node_modules-copy/a.txt','boom\n'); const ig=write('ignore-config.json',JSON.stringify({ignoredPaths:['node_modules/**'],allowlist:{spellings:[],terminology:[],register:[]},baseOrigin:'https://example.test'}));
const ir=capture([path.dirname(path.dirname(ignored)),'--format','json','--config',ig]); assert.deepEqual(JSON.parse(ir.stdout).files,1); assert.match(ir.stdout,/node_modules-copy/);
// Schema and option errors are exit 2.
for (const argv of [['--format','xml'],['--config'],['--bogus'],['no-such-path']]) assert.equal(capture(argv).code,2,argv.join(' '));
const malformed=write('malformed.json','{'); assert.equal(capture(['--config',malformed]).code,2);
const badSchema=write('bad-schema.json',JSON.stringify({severities:{'UE-NOPE':'error'},allowlist:{spellings:'bad'}})); assert.equal(capture(['--config',badSchema]).code,2);
// Output streams and formats through a subprocess.
for (const [format,entry] of [['json','findings'],['sarif','runs']]) { const p=write(`out-${format}.txt`,'boom\n'); const proc=spawnSync(process.execPath,[cli,p,'--format',format,'--config',config],{encoding:'utf8'}); assert.equal(proc.status,1); assert(entry in JSON.parse(proc.stdout)); assert.equal(proc.stderr,''); }
const help=spawnSync(process.execPath,[cli,'--help'],{encoding:'utf8'}); assert.equal(help.status,0); assert.match(help.stderr,/Usage:/);
assert.notEqual(fs.statSync(cli).mode & 0o111,0);

// Pack/install smoke: no dependencies, package file list, executable invocation.
const pack=spawnSync('npm',['pack','--dry-run','--json'],{cwd:root,encoding:'utf8'}); assert.equal(pack.status,0,pack.stderr); const packData=JSON.parse(pack.stdout); assert(packData[0].files.some(f=>f.path==='config/default.json'));
const packPath=path.join(tmpRoot,'un-editorial-check.tgz'); const packed=spawnSync('npm',['pack','--pack-destination',tmpRoot],{cwd:root,encoding:'utf8'}); assert.equal(packed.status,0,packed.stderr); fs.renameSync(path.join(tmpRoot,packed.stdout.trim().split('\n').at(-1)),packPath);
const installDir=path.join(tmpRoot,'install'); fs.mkdirSync(installDir); const installedPack=spawnSync('npm',['install','--no-audit','--no-fund',packPath],{cwd:installDir,encoding:'utf8'}); assert.equal(installedPack.status,0,installedPack.stderr); const installed=path.join(installDir,'node_modules','.bin','un-editorial-check'); const smoke=spawnSync(installed,['--version'],{encoding:'utf8'}); assert.equal(smoke.status,0,smoke.stderr); assert.equal(smoke.stdout.trim(),'0.1.0');
fs.rmSync(tmpRoot,{recursive:true,force:true});
console.log('ok — exact-rule corpus, good corpus, safety, config, formats, subprocess and package/install smoke');
