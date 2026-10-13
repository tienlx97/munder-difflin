const { _electron: electron } = require('playwright');
const path=require('node:path'),fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const app=await electron.launch({args:[path.resolve('out/main/index.js'),'--disable-gpu'],env:{...process.env,DO_NOT_TRACK:'1',XDG_CONFIG_HOME:path.resolve('../.local/state/config')},timeout:30000});
 try {
 const page=await app.firstWindow();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));
 await page.getByRole('button',{name:'open',exact:true}).click();
 await page.getByRole('button',{name:'Coding task',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[],'idle floor spawns no model sessions');
 const rejected=await page.evaluate(()=>window.cth.startOfficeTask({repo:'OTHER',runtime:'codex',prompt:'test'}));
 assert.equal(rejected.ok,false);
 assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
 await page.getByRole('button',{name:'Coding task',exact:true}).click();
 await page.getByText('Advanced options',{exact:true}).click();await page.getByLabel('Read-only analysis (no code changes)').check();
 await page.getByRole('textbox',{name:'Task',exact:true}).fill('Read package.json only and report its name. Do not edit files.');
 await page.getByRole('button',{name:'Start worker',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Started FE with codex'}).waitFor();
 const fe=await page.evaluate(()=>window.cth.listPtys());assert.equal(fe.length,1);assert.ok(fe[0].cwd.includes('/FE/'));
 await page.getByRole('combobox',{name:'Repository',exact:true}).selectOption('BE');
 await page.getByRole('textbox',{name:'Task',exact:true}).fill('Read global.json only and report the SDK version. Do not edit files.');
 await page.getByRole('button',{name:'Start worker',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Started BE with codex'}).waitFor();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 const started=await page.evaluate(()=>window.cth.listPtys());
 const startedIds=started.map(x=>x.id);
 console.log('STARTED',JSON.stringify(started));
 await page.screenshot({path:path.resolve('../.local/evidence/phase1-office.png'),timeout:20000});
 // Observe the native terminal and poll durable task completion, rather than a fake session.
 const deadline=Date.now()+180000;
 while(Date.now()<deadline){
  const list=await page.evaluate(()=>window.cth.listPtys());
  if(!list.some(x=>x.id.startsWith('office-'))) break;
  await new Promise(r=>setTimeout(r,1000));
 }
 const home=path.resolve('../.local/state/home');
 const runs=fs.readdirSync(path.join(home,'office-runs')).filter(id=>startedIds.includes(id)).map(id=>JSON.parse(fs.readFileSync(path.join(home,'office-runs',id,'run.json'))));
 console.log('RUNS',JSON.stringify(runs));
 assert.equal(runs.length,2);assert.ok(runs.every(x=>x.status==='done'));
 const {execFileSync}=require('node:child_process');
 for(const run of runs) assert.equal(execFileSync('git',['-C',run.cwd,'status','--porcelain'],{encoding:'utf8'}).trim(),'');
 assert.ok(runs.every(x=>x.runtime==='codex'));
 await page.getByText('codex: done',{exact:true}).first().waitFor();assert.ok(runs.every(x=>typeof x.tokens==='number'));
 await page.screenshot({path:path.resolve('../.local/evidence/phase1-complete.png'),timeout:20000});
 console.log('PASS Phase 1: two independent worktrees, real CLI sessions, native office and terminals, no manager.');
 } finally { await app.evaluate(({app})=>app.exit(0)); }
})().catch(e=>{console.error(e);process.exit(1)});
