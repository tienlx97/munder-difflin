// Native Electron/PTy/kanban lifecycle tests. Worker is a local protocol fixture,
// not Claude/Codex, so this does not certify real Claude execution.
const {_electron:electron}=require('playwright'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'office-native-'));
const home=path.join(dir,'hive'),profile=path.join(dir,'config'),roots={};
for(const repo of ['FE','BE']){const cwd=path.join(dir,repo);fs.mkdirSync(cwd);execFileSync('git',['init','-b','main',cwd]);fs.writeFileSync(path.join(cwd,'readme.txt'),'fixture\n');execFileSync('git',['-C',cwd,'add','.']);execFileSync('git',['-C',cwd,'-c','user.name=Office fixture','-c','user.email=fixture@localhost','commit','-m','fixture']);roots[repo]=cwd;}
const helper=path.join(dir,'worker.py');fs.writeFileSync(helper,`import argparse,json,pathlib,time\np=argparse.ArgumentParser();p.add_argument('--worktree');p.add_argument('--runtime');p.add_argument('--prompt');p.add_argument('--model');p.add_argument('--effort');a,_=p.parse_known_args()\nif 'Slow fixture' in a.prompt:\n pathlib.Path(a.worktree,'keep.txt').write_text('preserved patch')\n print('fixture running',flush=True);time.sleep(30)\nstatus='blocked' if 'Quota fixture' in a.prompt else 'done'\nprint('OFFICE_RESULT '+json.dumps({'runtime':a.runtime,'status':status,'reason':'fixture quota' if status=='blocked' else None,'tokens':'unknown','cost':'unknown','model':'unknown','receivedModel':a.model,'receivedEffort':a.effort}),flush=True)\n`);
fs.mkdirSync(path.join(profile,'Electron'),{recursive:true});fs.writeFileSync(path.join(profile,'Electron/config.json'),JSON.stringify({onboardingComplete:true,harnessHome:home,registeredRepos:Object.values(roots),autoMode:false,managerAutostart:false,orchestratorMaySpawn:false,semanticMemory:false,reflectEnabled:false,missions:[],opsStandupSeeded:true,heartbeatSeeded:true,compactMaintenanceSeeded:true,autoUpdate:false,telemetryEnabled:false,codingOffice:{...roots,worker:helper}}));
async function launch(){const app=await electron.launch({args:[path.resolve('out/main/index.js'),'--disable-gpu'],env:{...process.env,DO_NOT_TRACK:'1',XDG_CONFIG_HOME:profile}});const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.getByRole('button',{name:'open',exact:true}).click();return{app,page};}
const read=id=>JSON.parse(fs.readFileSync(path.join(home,'office-runs',id,'run.json')));
async function finish(page,id){const deadline=Date.now()+15000;while(Date.now()<deadline){if(read(id).status!=='running')return read(id);await new Promise(r=>setTimeout(r,100));}throw Error('Fixture did not finish');}
(async()=>{
 let {app,page}=await launch();
 try{
 assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
 const denied=await page.evaluate(cwd=>window.cth.spawnPty({id:'unbounded-fixture',cwd,command:'codex'}),roots.FE);assert.equal(denied.ok,false);
 const incomplete=await page.evaluate(()=>window.cth.dispatchOfficeTask({repo:'FE',prompt:'Good fixture'}));assert.equal(incomplete.ok,false);
 await page.getByRole('button',{name:'Coding task',exact:true}).click();await page.getByRole('dialog',{name:'Agent settings',exact:true}).waitFor();
 for(const id of ['frontend','backend','architect','qa','reviewer','integration']){
  const runtime=id==='backend'?'claude':'codex';await page.getByLabel(`${id} Runtime`,{exact:true}).selectOption(runtime);await page.getByLabel(`${id} Model`,{exact:true}).fill(`fixture-${id}`);await page.getByLabel(`${id} Effort`,{exact:true}).selectOption(id==='frontend'?'xhigh':'high');
 }
 await page.getByLabel('frontend Runtime',{exact:true}).selectOption('claude');await page.getByLabel('frontend Model',{exact:true}).fill('fixture-claude');await page.getByLabel('frontend Effort',{exact:true}).selectOption('max');await page.getByLabel('frontend Runtime',{exact:true}).selectOption('codex');assert.equal(await page.getByLabel('frontend Model',{exact:true}).inputValue(),'fixture-frontend');
 assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);await page.getByRole('button',{name:'Save team configuration',exact:true}).click();await page.getByRole('dialog',{name:'Coding task',exact:true}).waitFor();
 const preferences=JSON.parse(fs.readFileSync(path.join(home,'office-preferences.json'),'utf8'));assert.equal(Object.keys(preferences).length,6);assert.equal(preferences.frontend.runtime,'codex');assert.equal(preferences.backend.runtime,'claude');assert.equal(preferences.frontend.models.claude,'fixture-claude');assert.ok(!fs.existsSync(path.join(profile,'office-preferences.json')));assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
 const invalidTeam=await page.evaluate(()=>window.cth.saveOfficeTeam({frontend:{runtime:'codex',models:{claude:'',codex:''},efforts:{claude:'low',codex:'low'}}}));assert.equal(invalidTeam.ok,false);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home,'office-preferences.json'),'utf8')),preferences);
 const taskDialog=page.getByRole('dialog',{name:'Coding task',exact:true});assert.equal(await taskDialog.evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region')),'no-drag');assert.equal(await taskDialog.getByLabel('Model',{exact:true}).count(),0);assert.equal(await taskDialog.getByLabel('Effort',{exact:true}).count(),0);assert.equal(await taskDialog.getByLabel('Logical role',{exact:true}).isVisible(),false);
 await taskDialog.getByRole('button',{name:'Start worker',exact:true}).click();await page.getByRole('status').filter({hasText:'Enter a task before starting'}).waitFor();assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
 for(const repo of ['FE','BE']){
  await page.getByLabel('Repository',{exact:true}).selectOption(repo);await page.getByLabel('Task',{exact:true}).fill(`Good fixture ${repo} through Start worker`);await taskDialog.getByRole('button',{name:'Start worker',exact:true}).click();await page.getByRole('status').filter({hasText:`Started ${repo} with ${repo==='FE'?'codex':'claude'}`}).waitFor();
  const clicked=fs.readdirSync(path.join(home,'office-runs')).map(read).find(r=>r.prompt===`Good fixture ${repo} through Start worker`);assert.ok(clicked);const result=await finish(page,clicked.id);assert.equal(result.status,'done');assert.equal(result.role,repo==='FE'?'frontend':'backend');assert.equal(result.requestedModel,repo==='FE'?'fixture-frontend':'fixture-backend');assert.equal(result.requestedEffort,repo==='FE'?'xhigh':'high');
 }
 const beforeTamper=new Set(fs.readdirSync(path.join(home,'office-runs')));const tampered=await page.evaluate(()=>window.cth.dispatchOfficeTask({repo:'FE',prompt:'Good fixture tampered',runtime:'claude',model:'wrong',effort:'max'}));assert.equal(tampered.ok,true);const chosen=await finish(page,tampered.run.id);assert.equal(chosen.runtime,'codex');assert.equal(chosen.requestedModel,'fixture-frontend');assert.equal(chosen.requestedEffort,'xhigh');assert.equal(fs.readdirSync(path.join(home,'office-runs')).length,beforeTamper.size+1);
 await page.screenshot({path:path.resolve('../evidence/team-simple-task.png')});await taskDialog.getByRole('button',{name:'Close',exact:true}).click();
 const invalidModel=await page.evaluate(()=>window.cth.startOfficeTask({repo:'FE',runtime:'codex',prompt:'Good fixture',model:'bad;command'}));assert.equal(invalidModel.ok,false);
 const invalidEffort=await page.evaluate(()=>window.cth.startOfficeTask({repo:'FE',runtime:'codex',prompt:'Good fixture',effort:'max'}));assert.equal(invalidEffort.ok,false);
 const runs=[];
 for(const [repo,runtime] of [['FE','claude'],['FE','codex'],['BE','codex'],['BE','claude']]){
  const r=await page.evaluate(t=>window.cth.startOfficeTask(t),{repo,runtime,model:`fixture-${runtime}`,effort:runtime==='claude'?'max':'xhigh',prompt:'Good fixture'});assert.equal(r.ok,true,r.error);runs.push(await finish(page,r.run.id));
 }
 assert.equal(runs[0].agentId,runs[1].agentId);assert.equal(runs[2].agentId,runs[3].agentId);assert.deepEqual(runs.map(x=>x.runtime),['claude','codex','codex','claude']);
 assert.ok(runs.every(x=>x.requestedModel===`fixture-${x.runtime}`&&x.metrics.receivedModel===x.requestedModel&&x.model==='unknown'&&x.requestedEffort===(x.runtime==='claude'?'max':'xhigh')&&x.metrics.receivedEffort===x.requestedEffort));
 assert.ok(runs.every(x=>x.tokens==='unknown'&&x.cost==='unknown'));
 await page.getByRole('button',{name:'Task board',exact:true}).click();await page.getByRole('button',{name:'Close board',exact:true}).click();
 const quota=await page.evaluate(()=>window.cth.startOfficeTask({repo:'FE',runtime:'codex',prompt:'Quota fixture'}));const failed=await finish(page,quota.run.id);assert.equal(failed.status,'blocked');
 const ledger=await page.evaluate(()=>window.cth.hiveTasks());assert.ok(ledger.tasks.find(x=>x.id===failed.id).humanQA.length);
 const slow=await page.evaluate(()=>window.cth.startOfficeTask({repo:'FE',runtime:'codex',prompt:'Slow fixture'}));
 const deadline=Date.now()+5000;while(Date.now()<deadline&&!fs.existsSync(path.join(slow.run.cwd,'keep.txt')))await new Promise(r=>setTimeout(r,50));
 assert.ok(fs.existsSync(path.join(slow.run.cwd,'keep.txt')));
 const active=await page.evaluate(id=>window.cth.startOfficeTask({repo:'FE',runtime:'claude',prompt:'Good fixture',continueFrom:id}),slow.run.id);assert.equal(active.ok,false);
 await page.evaluate(id=>window.cth.killPty(id),slow.run.id);assert.equal(read(slow.run.id).status,'blocked');
 const handoff=await page.evaluate(id=>window.cth.startOfficeTask({repo:'FE',runtime:'claude',prompt:'Good fixture',continueFrom:id}),slow.run.id);assert.equal(handoff.ok,true,handoff.error);const continued=await finish(page,handoff.run.id);
 assert.equal(continued.cwd,slow.run.cwd);assert.ok(fs.existsSync(path.join(continued.cwd,'keep.txt')));assert.ok(fs.existsSync(path.join(home,'office-runs',continued.id,'handoff.json')));assert.equal(read(slow.run.id).runtime,'codex');
 for(const role of ['architect','qa','reviewer','integration'])for(const runtime of ['claude','codex']){
  const r=await page.evaluate(t=>window.cth.startOfficeTask(t),{repo:'FE',role,runtime,model:`fixture-${runtime}`,effort:runtime==='claude'?'max':'xhigh',prompt:'Good fixture'});assert.equal(r.ok,true,r.error);const done=await finish(page,r.run.id);assert.equal(done.role,role);assert.equal(done.runtime,runtime);assert.equal(done.requestedModel,`fixture-${runtime}`);assert.equal(done.metrics.receivedModel,done.requestedModel);assert.equal(done.metrics.receivedEffort,done.requestedEffort);
 }
 const reviewer=await page.evaluate(()=>window.cth.startOfficeTask({repo:'BE',runtime:'codex',role:'reviewer',prompt:'Good fixture',baseRef:'main'}));assert.equal(reviewer.ok,true,reviewer.error);const reviewed=await finish(page,reviewer.run.id);assert.equal(reviewed.role,'reviewer');
 const unsafe=await page.evaluate(()=>window.cth.startOfficeTask({repo:'BE',runtime:'codex',prompt:'Good fixture',baseRef:'--help'}));assert.equal(unsafe.ok,false);
 await page.screenshot({path:path.resolve('../evidence/phase5-native-office.png'),timeout:20000});
 await app.evaluate(({app})=>app.exit(0));
 // Inject a realistic interrupted record in this TEST profile and recover it on startup.
 const record={...continued,id:'office-frontend-1234abcd',status:'running'};const recordDir=path.join(home,'office-runs',record.id);fs.mkdirSync(recordDir);fs.writeFileSync(path.join(recordDir,'run.json'),JSON.stringify(record));
 ({app,page}=await launch());assert.equal(read(record.id).status,'blocked');assert.ok(fs.existsSync(path.join(record.cwd,'keep.txt')));assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
 await page.getByRole('button',{name:'Agent settings',exact:true}).click();assert.equal(await page.getByLabel('frontend Model',{exact:true}).inputValue(),'fixture-frontend');assert.equal(await page.getByLabel('frontend Effort',{exact:true}).inputValue(),'xhigh');assert.equal(await page.getByLabel('backend Runtime',{exact:true}).inputValue(),'claude');assert.equal(await page.getByLabel('qa Model',{exact:true}).inputValue(),'fixture-qa');await page.screenshot({path:path.resolve('../evidence/team-settings.png')});
 const savedPreferences=fs.readFileSync(path.join(home,'office-preferences.json'),'utf8');await app.evaluate(({app})=>app.exit(0));const otherConfig=JSON.parse(fs.readFileSync(path.join(profile,'Electron/config.json'),'utf8'));otherConfig.harnessHome=path.join(dir,'other-hive');fs.writeFileSync(path.join(profile,'Electron/config.json'),JSON.stringify(otherConfig));({app,page}=await launch());const otherDefaults=await page.evaluate(()=>window.cth.officePreferences());assert.deepEqual(otherDefaults.defaults,{});assert.equal(fs.readFileSync(path.join(home,'office-preferences.json'),'utf8'),savedPreferences);assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
 console.log('PASS team configuration once, FE/BE-only task buttons, server-selected models/efforts, one worker per task, all-role defaults after restart, separate workspace and atomic invalid-team refusal; no provider calls.');
 console.log('PASS native fixture: runtime attributes/stable role identity, no idle model sessions, native board, quota escalation, stopped-run handoff, dirty patch retention, reviewer/base ref, interrupted-record recovery. No real provider calls.');
 console.log(JSON.stringify({profile:dir,runtimeFixtureRuns:runs.map(x=>({id:x.id,agentId:x.agentId,runtime:x.runtime}))}));
 }finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
})().catch(e=>{console.error(e);process.exit(1)});
