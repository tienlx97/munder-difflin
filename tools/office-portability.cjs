const { _electron:electron }=require('playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const app=await electron.launch({args:[path.resolve('out/main/index.js'),'--disable-gpu'],env:{...process.env,DO_NOT_TRACK:'1',XDG_CONFIG_HOME:path.resolve('../office-state/config')},timeout:30000});
 try {
  const page=await app.firstWindow();page.setDefaultTimeout(20000);
  await page.getByRole('button',{name:'open',exact:true}).click();
  const before=fs.readdirSync(path.resolve('../office-state/home/office-runs'));
  const started=[];
  for(const repo of ['FE','BE']){
   const result=await page.evaluate(repo=>window.cth.startOfficeTask({repo,runtime:'claude',prompt:repo==='FE'?'Read package.json only; report name. Do not edit.':'Read global.json only; report SDK version. Do not edit.'}),repo);
   assert.equal(result.ok,true,result.error);started.push(result.run.id);
  }
  const deadline=Date.now()+90000;
  while(Date.now()<deadline){
   if(!(await page.evaluate(()=>window.cth.listPtys())).some(x=>started.includes(x.id)))break;
   await new Promise(r=>setTimeout(r,1000));
  }
  const runs=started.map(id=>JSON.parse(fs.readFileSync(path.resolve('../office-state/home/office-runs',id,'run.json'))));
  console.log(JSON.stringify(runs,null,2));
  assert.ok(runs.every(x=>x.runtime==='claude'));assert.ok(before.every(id=>fs.existsSync(path.resolve('../office-state/home/office-runs',id,'run.json'))));
  const blocked=runs.filter(x=>x.status==='blocked');
  if(blocked.length){
   assert.ok(blocked.every(x=>x.reason==='usage_limit_reached'||/OAuth session expired/.test(String(x.reason))));
   await page.getByText('claude: blocked',{exact:true}).first().waitFor();
   console.log('BLOCKED Phase 2 gate: real Claude sessions reported provider quota/authentication failure; no retries or fallback were launched. Original Codex histories preserved.');
  }else{assert.ok(runs.every(x=>x.status==='done'));console.log('PASS both Claude role executions');}
  await page.screenshot({path:path.resolve('../evidence/phase2-runtime-blocked.png'),timeout:20000});
  assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
  console.log('PASS failure visibility / no retry / independent runtime history checks');
 }finally{await app.evaluate(({app})=>app.exit(0));}
})().catch(e=>{console.error(e);process.exit(1)});
