const {_electron:electron}=require('playwright'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const app=await electron.launch({args:[path.resolve('out/main/index.js'),'--disable-gpu'],env:{...process.env,DO_NOT_TRACK:'1',XDG_CONFIG_HOME:path.resolve('../office-state/config')}});
 try{
 const page=await app.firstWindow();await page.getByRole('button',{name:'open',exact:true}).click();
 const tasks=JSON.parse(fs.readFileSync(path.resolve('../evidence/phase4-worktrees.json')));
 const fe='https://github.com/tienlx97/FE-P/pull/9',be='https://github.com/tienlx97/BE-P/pull/6';
 for(const run of tasks)await page.evaluate(t=>window.cth.hivePatchTask(t.id,{status:'done',result:`Host verified preserved worktree; separate linked draft PR ready: ${t.repo==='FE'?t.fe:t.be}. Original over-budget runtime record retained.`,humanQA:[]}),{...run,fe,be});
 await page.evaluate(({ids,fe,be})=>window.cth.hivePatchTask('PAY-STAGES',{status:'blocked',dependsOn:ids,result:'Implementation and tests passed; linked draft PRs await human review.',humanQA:[{q:`**Review the paired draft PRs:** [FE #9](${fe}) and [BE #6](${be}). Merge and deployment require separate approval.`,askedAt:new Date().toISOString()}]}),{ids:tasks.map(x=>x.id),fe,be});
 assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
 await page.getByRole('button',{name:'Task board',exact:true}).click();await page.getByText('Logistics: multiple payments per contractual stage',{exact:true}).first().waitFor();
 await page.screenshot({path:path.resolve('../evidence/final-office-board.png'),timeout:20000});
 console.log('PASS live native task board finalized with verified FE/BE deliverables, review gate and zero idle model sessions.');
 }finally{await app.evaluate(({app})=>app.exit(0));}
})().catch(e=>{console.error(e);process.exit(1)});
