const {_electron:electron}=require('playwright'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
(async()=>{
 const app=await electron.launch({args:[path.resolve('out/main/index.js'),'--disable-gpu'],env:{...process.env,DO_NOT_TRACK:'1',XDG_CONFIG_HOME:path.resolve('../.local/state/config')}});
 try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'open',exact:true}).click();
 const target='src/features/auth/components/login-form.jsx';
 const preview=await page.evaluate(file=>window.cth.startOfficeTask({repo:'FE',runtime:'codex',prompt:'Đổi chữ button Login thành A',edit:{file,old:'label="Đăng nhập"',new:'label="A"',dryRun:true}}),target);
 assert.equal(preview.ok,true,preview.error);assert.equal(execFileSync('git',['-C',preview.run.cwd,'diff'],{encoding:'utf8'}),'');
 const edited=await page.evaluate(file=>window.cth.startOfficeTask({repo:'FE',runtime:'codex',prompt:'Đổi chữ button Login thành A',edit:{file,old:'label="Đăng nhập"',new:'label="A"'}}),target);
 assert.equal(edited.ok,true,edited.error);
 assert.deepEqual(execFileSync('git',['-C',edited.run.cwd,'diff','--name-only'],{encoding:'utf8'}).trim().split('\n'),[target]);
 assert.ok(fs.readFileSync(path.join(edited.run.cwd,target),'utf8').includes('label="A"'));
 assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
 const run=JSON.parse(fs.readFileSync(path.resolve('../.local/state/home/office-runs',edited.run.id,'run.json')));
 assert.equal(run.status,'review-needed');assert.equal(run.tokens,0);assert.equal(run.metrics.workers,0);assert.equal(run.policy.manager,false);assert.equal(run.policy.tier,'XS');
 const ambiguous=await page.evaluate(file=>window.cth.startOfficeTask({repo:'FE',runtime:'codex',prompt:'Change label',edit:{file,old:'import',new:'A'}}),target);
 assert.equal(ambiguous.ok,false);assert.ok(ambiguous.error.includes('exactly once'));
 const escape=await page.evaluate(()=>window.cth.startOfficeTask({repo:'FE',runtime:'codex',prompt:'Change label',edit:{file:'src/../../../../BE-P/main.js',old:'x',new:'y'}}));assert.equal(escape.ok,false);
 console.log('PASS exact edit/dry-run/ambiguous refusal/path containment/scoped eslint/no model or manager sessions');console.log(JSON.stringify(run,null,2));
 }finally{await app.evaluate(({app})=>app.exit(0));}
})().catch(e=>{console.error(e);process.exit(1)});
