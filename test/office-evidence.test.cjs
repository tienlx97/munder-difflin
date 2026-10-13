const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {officeFingerprint,officeContext}=require('./load-ts.cjs')('src/main/officeEvidence.ts');
test('verification invalidates edits, untracked files and deletions, but excludes run logs',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'office-evidence-'));
 try{execFileSync('git',['init','-q',root]);fs.writeFileSync(path.join(root,'a.txt'),'before');const a=officeFingerprint(root);fs.writeFileSync(path.join(root,'a.txt'),'after');assert.notEqual(officeFingerprint(root),a);fs.writeFileSync(path.join(root,'a.txt'),'before');fs.mkdirSync(path.join(root,'harness/runs'),{recursive:true});fs.writeFileSync(path.join(root,'harness/runs/log'),'ignored');assert.equal(officeFingerprint(root),a);fs.writeFileSync(path.join(root,'b.txt'),'new');assert.notEqual(officeFingerprint(root),a);fs.unlinkSync(path.join(root,'b.txt'));fs.unlinkSync(path.join(root,'a.txt'));assert.notEqual(officeFingerprint(root),a);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('context lists instruction sources without copying their contents',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'office-context-'));
 try{fs.writeFileSync(path.join(root,'AGENTS.md'),'x'.repeat(50000));const c=officeContext(root,'FE','frontend','Fix label','prior');assert.ok(c.text.length<1000);assert.deepEqual(c.manifest.sources,['AGENTS.md']);assert.ok(c.text.includes('prior'));}finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('continuations account for all earlier attempts and reject unknown or cyclic history',()=>{
 const {continuationUsage}=require('./load-ts.cjs')('src/main/officeEvidence.ts');
 assert.equal(continuationUsage([{id:'a',tokens:10},{id:'b',tokens:20,fromRun:'a'}],'b'),30);
 assert.throws(()=>continuationUsage([{id:'a',tokens:'unknown'}],'a'),/unknown/);
 assert.throws(()=>continuationUsage([{id:'a',tokens:1,fromRun:'a'}],'a'),/Cyclic/);
});
