const {_electron:electron}=require('playwright'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const app=await electron.launch({args:[path.resolve('out/main/index.js'),'--disable-gpu'],env:{...process.env,DO_NOT_TRACK:'1',XDG_CONFIG_HOME:path.resolve('../.local/state/config')}});
 const page=await app.firstWindow();await page.getByRole('button',{name:'open',exact:true}).click();
 const contract=fs.readFileSync(path.resolve('../docs/contracts/payment-stage-occurrences.md'),'utf8');
 await page.evaluate(()=>window.cth.hiveAddTask({id:'PAY-STAGES',title:'Logistics: multiple payments per contractual stage',description:'Additive FE/BE contract; linked worktrees and PRs; human review before merge/deploy.',assignee:'human',status:'doing',dependsOn:[],priority:3,createdAt:new Date().toISOString()}));
 const scopes={
 BE:'Use existing HasValueJsonConverter/ValueJsonComparer to persist an additive nullable JSON column on ContractPaymentTerms. Extend Domain PaymentTerm and Create/Update validators; default omitted occurrences to one 100% occurrence. Map requests, responses, commands, handlers and ContractsController; leave commissions unchanged. Add NEW forward-only EF migration/snapshot, NEVER apply to live DB. Update sample-data.sql idempotently, requests and docs/api/Contracts.md. Add direct Domain/validator/real HTTP roundtrip tests using existing factories. Run focused dotnet tests and format. SDK on PATH. Do not commit; host runs full gate and commits/PR.',
 FE:'Read docs/astryx-workflow.md; discover Astryx props using pnpm exec astryx. Reuse logistics-contracts PaymentTermsFields and hooks. Extend schema/types/API normalization/payload/useContractForm to create/edit/reload children. Nested editor only for contracts (hasPaymentType true), commissions unchanged. Show child ratio (of parent), conditions, method, derived amounts; add/remove rows retaining one; validate total 100. Overview named card must show nested breakdown; do not mark terms paid by count of unrelated PaymentSchedules. Reuse Meta/Astryx/StyleX. Add meaningful validation/default/API/amount tests. Dependencies are preinstalled by native link; do not reinstall shared modules. Do not commit; host runs full gate and browser checks. Use dev port 3002 if necessary.'
 };
 const started=[];
 for(const repo of ['BE','FE']){
  const prompt=`Implement PAY-STAGES in ${repo} only. Read AGENTS.md and relevant Golden Rules. ${contract}\n${scopes[repo]}\nAdd focused OpenSpec payment-stage-occurrences proposal/spec/tasks and harness/PROGRESS entry. Preserve unrelated work. Never access production/secrets, merge, push, deploy or delete shared files. Return changes and actual checks.`;
  const result=await page.evaluate(t=>window.cth.startOfficeTask(t),{repo,runtime:'codex',tier:'L',featureId:'PAY-STAGES',prompt});if(!result.ok)throw Error(result.error);started.push(result.run);
 }
 fs.writeFileSync(path.resolve('../.local/evidence/phase4-worktrees.json'),JSON.stringify(started,null,2)+'\n');console.log('STARTED',JSON.stringify(started));
 await page.screenshot({path:path.resolve('../.local/evidence/phase4-office.png'),timeout:20000});
 const deadline=Date.now()+1850000;
 while(Date.now()<deadline){if(!(await page.evaluate(()=>window.cth.listPtys())).some(x=>started.some(y=>y.id===x.id)))break;await new Promise(r=>setTimeout(r,2000));}
 console.log('RUNS',JSON.stringify(started.map(x=>JSON.parse(fs.readFileSync(path.resolve('../.local/state/home/office-runs',x.id,'run.json'))))));
 await app.evaluate(({app})=>app.exit(0));
})().catch(e=>{console.error(e);process.exit(1)});
