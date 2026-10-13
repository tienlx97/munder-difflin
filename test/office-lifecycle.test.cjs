const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),ts=require('typescript'),{execFileSync}=require('node:child_process');
const load=require('./load-ts.cjs');
function fixture(){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'office-life-')),home=path.join(base,'home'),cwd=path.join(home,'worktrees/FE/task'),id='office-frontend-12345678';
 fs.mkdirSync(cwd,{recursive:true});execFileSync('git',['init','-q',cwd]);fs.writeFileSync(path.join(cwd,'code.txt'),'initial');
 const config={harnessHome:home,codingOffice:{FE:cwd,BE:path.join(base,'BE'),worker:path.join(base,'office-worker.py')}};
 fs.writeFileSync(path.join(base,'verify-worktree.py'),'print("gate passed")\n');
 const events=[],hive={patchTask:(id,v)=>events.push(v),tasks:()=>({tasks:[{id}]}),writeTasks:v=>events.push(v[0]),recordSession:()=>{}};
 const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/main/codingOffice.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',source)(key=>key==='./config'?{readConfig:()=>config,writeConfig:()=>{}}:key==='./git'?{isSafeRev:()=>true}:key==='./worktreeDeps'?{}:key==='./officeEvidence'?load('src/main/officeEvidence.ts'):key==='../shared/codingOfficePolicy'?load('src/shared/codingOfficePolicy.ts'):require(key),mod,mod.exports);
 const office=new mod.exports.CodingOffice(hive,{list:()=>[]});
 const run={id,agentId:'office-frontend',role:'frontend',repo:'FE',runtime:'codex',cwd,branch:'test',startedAt:new Date().toISOString(),status:'running',model:'unknown',tokens:'unknown',cost:'unknown'};
 fs.mkdirSync(path.join(home,'office-runs',id),{recursive:true});office.runs.set(id,run);
 return {base,cwd,id,office,run,events,close:()=>fs.rmSync(base,{recursive:true,force:true})};
}
test('CLI success requires independent checks and acceptance; stale evidence is rejected',async()=>{
 const f=fixture();try{f.office.finish(f.id,0,'OFFICE_RESULT '+JSON.stringify({status:'done',tokens:12}));assert.equal(f.run.status,'review-needed');assert.throws(()=>f.office.accept(f.id),/verification/);await f.office.verify(f.id);assert.equal(f.run.verification.status,'passed');fs.writeFileSync(path.join(f.cwd,'code.txt'),'changed');assert.throws(()=>f.office.accept(f.id),/verification/);await f.office.verify(f.id);f.office.accept(f.id);assert.equal(f.run.status,'done');}finally{f.close();}
});
test('failing gate cannot be accepted',async()=>{const f=fixture();try{f.office.finish(f.id,0,'OFFICE_RESULT {"status":"done","tokens":1}');fs.writeFileSync(path.join(f.base,'verify-worktree.py'),'raise SystemExit(1)');await f.office.verify(f.id);assert.equal(f.run.status,'blocked');assert.throws(()=>f.office.accept(f.id));}finally{f.close();}});
test('read-only completion requires unchanged inputs',()=>{const f=fixture();try{f.run.readOnly=true;f.run.initialDigest=load('src/main/officeEvidence.ts').officeFingerprint(f.cwd);fs.writeFileSync(path.join(f.cwd,'code.txt'),'changed');f.office.finish(f.id,0,'OFFICE_RESULT {"status":"done","tokens":1}');assert.equal(f.run.status,'blocked');}finally{f.close();}});
