/** Narrow local-fork launch hook. Reuses native PTYs, hive tasks and avatars. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, readdirSync, lstatSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, isAbsolute, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readConfig } from './config';
import { isSafeRev } from './git';
import { linkWorktreeDeps } from './worktreeDeps';
import { routeCodingTask, type TaskTier } from '../shared/codingOfficePolicy';
import type { HiveManager, HiveTask } from './hive';
import type { PtyManager } from './pty';
import type { WebContents } from 'electron';

export interface OfficeRequest { repo: 'FE' | 'BE'; runtime: 'claude' | 'codex'; model?:string; effort?:'low'|'medium'|'high'|'xhigh'|'max'; prompt: string; tier?:TaskTier; featureId?:string; role?:'frontend'|'backend'|'architect'|'qa'|'reviewer'|'integration'; baseRef?:string; continueFrom?:string; edit?:{file:string;old:string;new:string;dryRun?:boolean}; }
const quote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'";
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], {encoding:'utf8',timeout:15000}).trim();
interface Run { id: string; agentId:string; role: string; repo: string; runtime: string; cwd: string; branch: string; startedAt: string; status: string; model: string; tokens: number | string; cost: string | number; policy?:ReturnType<typeof routeCodingTask>; }
export interface OfficeDefaults { runtime:'claude'|'codex'; models:Record<'claude'|'codex',string>; efforts:Record<'claude'|'codex',string>; }
export class CodingOffice {
  private runs = new Map<string, Run>();
  private owners = new Map<string, WebContents | null>();
  constructor(private hive: HiveManager, private pty: PtyManager) {
    const home=readConfig().harnessHome;
    const dir=home?join(home,'office-runs'):null;
    if(dir&&existsSync(dir))for(const id of readdirSync(dir)){
      try{
        const run=JSON.parse(readFileSync(join(dir,id,'run.json'),'utf8')) as Run;
        if(run.status==='running'){
          Object.assign(run,{status:'blocked',reason:'application interrupted; worktree preserved',endedAt:new Date().toISOString()});
          this.runs.set(run.id,run);this.persist(run);
          this.hive.patchTask(run.id,{status:'blocked',result:'Application interrupted. Inspect preserved worktree and hand off explicitly.'});
        }
      }catch{/* Preserve malformed evidence; never delete files or worktrees. */}
    }
  }
  preferences(): Record<string,OfficeDefaults> {
    const home=readConfig().harnessHome;if(!home)throw new Error('No workspace selected');
    const path=join(home,'office-preferences.json');
    if(!existsSync(path))return {};
    const values=JSON.parse(readFileSync(path,'utf8'));
    if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Invalid saved office preferences');
    for(const [role,value] of Object.entries(values))this.validatePreference(role,value as OfficeDefaults);
    return values;
  }
  private validatePreference(role:string,value:OfficeDefaults) {
    if(!['frontend','backend','architect','qa','reviewer','integration'].includes(role)||!value||!['claude','codex'].includes(value.runtime))throw new Error('Invalid role preferences');
    for(const runtime of ['claude','codex'] as const){
      const model=value.models?.[runtime],effort=value.efforts?.[runtime];
      if(typeof model!=='string'||(model!==''&&!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(model)))throw new Error('Invalid saved model');
      if(!(runtime==='claude'?['','low','medium','high','xhigh','max']:['','low','medium','high','xhigh']).includes(effort))throw new Error('Invalid saved effort');
    }
  }
  savePreference(role:string,value:OfficeDefaults) {
    this.validatePreference(role,value);
    const values=this.preferences(),home=readConfig().harnessHome!;
    values[role]={runtime:value.runtime,models:{claude:value.models.claude,codex:value.models.codex},efforts:{claude:value.efforts.claude,codex:value.efforts.codex}};
    mkdirSync(home,{recursive:true});const path=join(home,'office-preferences.json'),temp=path+'.'+randomUUID()+'.tmp';
    writeFileSync(temp,JSON.stringify(values,null,2)+'\n',{mode:0o600});renameSync(temp,path);
    return values;
  }
  saveTeam(values:Record<string,OfficeDefaults>) {
    const roles=['frontend','backend','architect','qa','reviewer','integration'];
    if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Invalid team configuration');
    for(const role of roles)this.validatePreference(role,values[role]);
    const home=readConfig().harnessHome;if(!home)throw new Error('No workspace selected');
    // Read first so malformed existing settings are preserved for diagnosis.
    this.preferences();const normalized:Record<string,OfficeDefaults>={};
    for(const role of roles){const v=values[role];normalized[role]={runtime:v.runtime,models:{...v.models},efforts:{...v.efforts}};}
    mkdirSync(home,{recursive:true});const path=join(home,'office-preferences.json'),temp=path+'.'+randomUUID()+'.tmp';
    writeFileSync(temp,JSON.stringify(normalized,null,2)+'\n',{mode:0o600});renameSync(temp,path);return normalized;
  }
  async dispatch(request:Omit<OfficeRequest,'runtime'|'model'|'effort'>,owner:WebContents|null) {
    if(!request||!['FE','BE'].includes(request.repo))throw new Error('Select FE or BE');
    const preferences=this.preferences();
    if(!['frontend','backend','architect','qa','reviewer','integration'].every(role=>preferences[role]))throw new Error('Configure the agent team first');
    const role=request.role??(request.repo==='FE'?'frontend':'backend'),saved=preferences[role];
    if(!saved)throw new Error('Role is not configured');
    const model=saved.models[saved.runtime],effort=saved.efforts[saved.runtime] as OfficeRequest['effort'];
    return this.start({...request,role,runtime:saved.runtime,model:model||undefined,effort:effort||undefined},owner);
  }
  async start(raw: OfficeRequest, owner: WebContents | null) {
    const config=readConfig(), roots=config.codingOffice;
    if (!roots || !config.harnessHome) throw new Error('Coding office roots/helper are not configured');
    if (!raw || !['FE','BE'].includes(raw.repo) || !['claude','codex'].includes(raw.runtime) || typeof raw.prompt!=='string' || !raw.prompt.trim() || raw.prompt.length>12000) throw new Error('Invalid coding task');
    if (process.platform!=='linux' || !existsSync('/usr/bin/bwrap')) throw new Error('Verified Linux bubblewrap isolation required');
    if (!isAbsolute(roots.worker) || !existsSync(roots.worker)) throw new Error('Trusted worker helper missing');
    const repo=realpathSync(roots[raw.repo]);
    if (repo===realpathSync(roots[raw.repo==='FE'?'BE':'FE'])) throw new Error('FE/BE roots must differ');
    if (git(repo,'rev-parse','--show-toplevel')!==repo) throw new Error('Registered root is not a Git root');
    if (git(repo,'status','--porcelain','--untracked-files=no')) throw new Error('Tracked edits exist; preserve them before dispatch');
    if(raw.featureId&&(!/^[A-Za-z0-9_-]{1,80}$/.test(raw.featureId)))throw new Error('Invalid parent task id');
    if(raw.tier&&!['XS','S','M','L'].includes(raw.tier))throw new Error('Invalid tier');
    if(raw.model!==undefined&&(typeof raw.model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(raw.model)))throw new Error('Invalid model id');
    if(raw.effort!==undefined&&!(raw.runtime==='claude'?['low','medium','high','xhigh','max']:['low','medium','high','xhigh']).includes(raw.effort))throw new Error('Invalid effort for selected runtime');
    const policy=routeCodingTask(raw);
    const role=raw.role??(raw.repo==='FE'?'frontend':'backend');
    if(!['frontend','backend','architect','qa','reviewer','integration'].includes(role))throw new Error('Invalid logical role');
    if(role==='frontend'&&raw.repo!=='FE'||role==='backend'&&raw.repo!=='BE')throw new Error('Coder role does not match repository');
    policy.roles=[role as 'frontend'|'backend'];
    if(raw.baseRef&&!isSafeRev(raw.baseRef))throw new Error('Unsafe base revision');
    if ([...this.runs.values()].some(r=>r.role===role&&r.status==='running')) throw new Error('Role already has an active task');
    const id=`office-${role}-${randomUUID().slice(0,8)}`;
    let cwd=join(config.harnessHome,'worktrees',raw.repo,id), branch=`agent/${id}`;
    let previous: (Run & {attempt?:number}) | undefined;
    if(raw.continueFrom){
      if(!/^office-[a-z]+-[a-f0-9]{8}$/.test(raw.continueFrom))throw new Error('Invalid handoff run id');
      previous=JSON.parse(readFileSync(join(config.harnessHome,'office-runs',raw.continueFrom,'run.json'),'utf8'));
      if(!previous||previous.repo!==raw.repo||previous.role!==role||this.pty.list().some(p=>p.id===previous!.id))throw new Error('Handoff requires a stopped run with the same role and repo');
      if(previous.policy&&['XS','S','M','L'].indexOf(previous.policy.tier)>['XS','S','M','L'].indexOf(policy.tier))Object.assign(policy,previous.policy);
      cwd=realpathSync(previous.cwd); branch=previous.branch;
      if(!cwd.startsWith(resolve(config.harnessHome,'worktrees',raw.repo)+sep)||git(cwd,'rev-parse','--path-format=absolute','--git-common-dir')!==join(repo,'.git')||git(cwd,'branch','--show-current')!==branch)throw new Error('Handoff worktree provenance mismatch');
      if((previous.attempt??1)>=policy.retries+1)throw new Error('Attempt limit exhausted; human escalation required');
    }
    mkdirSync(join(config.harnessHome,'worktrees',raw.repo),{recursive:true});
    // Deliberately fail closed. Never fall back to a shared or protected checkout.
    if(!previous) git(repo,'worktree','add',cwd,'-b',branch,raw.baseRef??'HEAD');
    const run:Run={id,agentId:`office-${role}`,role,repo:raw.repo,runtime:raw.runtime,cwd,branch,startedAt:new Date().toISOString(),status:'running',model:'unknown',tokens:'unknown',cost:'unknown'};
    Object.assign(run,{requestedModel:raw.edit?null:raw.model??null,requestedEffort:raw.edit?null:raw.effort??null,policy,prompt:raw.prompt,featureId:raw.featureId??null,runtime:raw.edit?'none':raw.runtime,attempt:(previous?.attempt??0)+1,fromRun:previous?.id??null});
    this.runs.set(id,run); this.owners.set(id,owner); this.persist(run);
    this.hive.addTask({id,title:raw.prompt.slice(0,100),description:raw.prompt,assignee:run.agentId,runId:id,status:'doing',dependsOn:[],priority:1,createdAt:new Date().toISOString(),repo:raw.repo,branch,role,runtime:raw.runtime,tier:policy.tier,featureId:raw.featureId??null} as HiveTask);
    if(raw.featureId){
      const ledger=this.hive.tasks() as {tasks:HiveTask[]};
      const parent=ledger.tasks?.find(t=>t.id===raw.featureId);
      if(parent)this.hive.patchTask(parent.id,{dependsOn:[...new Set([...(parent.dependsOn??[]),id])]});
    }
    const deps=await linkWorktreeDeps(repo,cwd);
    if(!deps.ok){this.finish(id,1,'Dependency link failed');throw new Error(`Dependencies unavailable: ${deps.error}`);}
    if(raw.edit){
      try {
        const edit=raw.edit;
        if(raw.repo!=='FE'||typeof edit.file!=='string'||!/^src\/.+\.(jsx?|tsx?)$/.test(edit.file)||typeof edit.old!=='string'||!edit.old||typeof edit.new!=='string')throw new Error('Exact FE source edit required');
        const path=resolve(cwd,edit.file);
        if(!path.startsWith(resolve(cwd)+sep)||realpathSync(path)!==path)throw new Error('Path escapes worktree or is a symlink');
        const source=readFileSync(path,'utf8');
        if(source.split(edit.old).length!==2)throw new Error('Original must match exactly once; no edit performed');
        if(!/^label="[^"\n]*"$/.test(edit.old)||!/^label="[^"\n]*"$/.test(edit.new))throw new Error('Deterministic lane accepts a verified JSX button label only');
        const prefix=source.slice(0,source.indexOf(edit.old));
        if(prefix.lastIndexOf('<Button')<prefix.lastIndexOf('/>'))throw new Error('Match is not in a Button context');
        if(edit.dryRun){this.finish(id,0,'OFFICE_RESULT '+JSON.stringify({status:'done',tokens:0,cost:0,model:'none',dryRun:true}));return run;}
        writeFileSync(path,source.replace(edit.old,edit.new));
        const checks=execFileSync('node',[join(cwd,'node_modules/eslint/bin/eslint.js'),edit.file],{cwd,encoding:'utf8',timeout:45000});
        writeFileSync(join(config.harnessHome,'office-runs',id,'checks.log'),checks);
        const files=git(cwd,'diff','--name-only').split('\n');
        if(files.length!==1||files[0]!==edit.file)throw new Error('Unexpected files changed');
        writeFileSync(join(config.harnessHome,'office-runs',id,'change.patch'),git(cwd,'diff')+'\n');
        this.finish(id,0,'OFFICE_RESULT '+JSON.stringify({status:'done',tokens:0,cost:0,model:'none',checks:'eslint passed',workers:0}));
        return run;
      }catch(e){this.finish(id,1,'OFFICE_RESULT '+JSON.stringify({status:'blocked',reason:String(e),tokens:0,cost:0}));throw e;}
    }
    if(previous)writeFileSync(join(config.harnessHome,'office-runs',id,'handoff.json'),JSON.stringify({from:previous.id,fromRuntime:previous.runtime,toRuntime:raw.runtime,role,repo:raw.repo,cwd,branch,diff:git(cwd,'diff','--stat'),remaining:raw.prompt,changedFiles:git(cwd,'status','--short')},null,2)+'\n');
    await this.hive.ensureAgent({id:run.agentId,name:role[0].toUpperCase()+role.slice(1),provider:raw.runtime,role,cwd});
    // Do NOT inject the full hive roster/prompt into the CLI: direct task only.
    const prompt=`${raw.prompt}\nWork only in this worktree. Do not delegate, commit, push, merge, deploy, access secrets or modify .git. Preserve repository instructions. Return changed files and checks.`;
    const command=`python3 ${quote(roots.worker)} --worktree ${quote(cwd)} --runtime ${raw.runtime} ${raw.model?'--model '+quote(raw.model)+' ':''}${raw.effort?'--effort '+quote(raw.effort)+' ':''}--seconds ${policy.seconds} --token-cap ${policy.tokens} --max-steps ${policy.steps} ${role==='reviewer'?'--read-only ':''}--log ${quote(join(config.harnessHome,'office-runs',id,'terminal.log'))} --prompt ${quote(prompt)}`;
    const result=this.pty.spawn({id,cwd,command:'python3',shellScript:command,cols:120,rows:32},owner);
    if (!result.ok) { this.finish(id,1,result.error); throw new Error(result.error); }
    owner?.send('hive:agentSpawned',{id:run.agentId,ptyId:id,name:role[0].toUpperCase()+role.slice(1),provider:raw.runtime,model:raw.model,cwd,command,role,worktreePath:cwd,character:({frontend:'jim',backend:'dwight',architect:'oscar',qa:'pam',reviewer:'stanley',integration:'ryan'} as Record<string,string>)[role]});
    return run;
  }
  finish(id:string,exitCode:number,tail?:string) {
    const run=this.runs.get(id); if (!run || run.status!=='running') return;
    const text=(tail??'').replace(/\x1b\[[0-9;]*[A-Za-z]/g,'');
    const line=text.split(/\r?\n/).reverse().find(x=>x.startsWith('OFFICE_RESULT '));
    let observed:Record<string,unknown>={};
    try { if(line) observed=JSON.parse(line.slice(14)); } catch { /* unknown metrics, fail closed */ }
    Object.assign(run,{status:exitCode===0&&observed.status==='done'?'done':'blocked',endedAt:new Date().toISOString(),exitCode,metrics:observed,reason:observed.reason??(observed.status==='done'?null:tail==='interrupted'?'stopped or interrupted':exitCode===0?'missing result':'worker failed'),tokens:observed.tokens??'unknown',cost:observed.cost??'unknown',model:observed.model??'unknown'});
    if(typeof observed.sessionId==='string'&&observed.sessionId!=='unknown')this.hive.recordSession(run.agentId,observed.sessionId);
    try {
      let patch=git(run.cwd,'diff','--binary');
      const extra=git(run.cwd,'ls-files','--others','--exclude-standard').split('\n').filter(Boolean);
      for(const file of extra){
        if(lstatSync(join(run.cwd,file)).isSymbolicLink()||/(^|\/)(\.env[^/]*|\.ai-login\.local\.md)$/.test(file))continue;
        try { patch+='\n'+git(run.cwd,'diff','--no-index','--binary','--','/dev/null',file); }
        catch(e){const result=e as {status?:number;stdout?:string};if(result.status===1&&result.stdout)patch+='\n'+result.stdout;else throw e;}
      }
      writeFileSync(join(readConfig().harnessHome!,'office-runs',id,'change.patch'),patch+'\n');
      Object.assign(run,{changedFiles:git(run.cwd,'status','--short')});
    }catch(e){Object.assign(run,{patchExportError:String(e)});}
    this.persist(run);
    const owner=this.owners.get(id);
    if(owner&&!owner.isDestroyed()) owner.send('office:runChanged',run);
    this.owners.delete(id);
    const tasks=this.hive.tasks() as {tasks:HiveTask[]};
    this.hive.writeTasks((tasks.tasks??[]).map(t=>t.id===id?{
      ...t,status:run.status==='done'?'done':'blocked',notes:JSON.stringify(run),
      result:`${run.runtime}: ${run.status}. Worktree: ${run.cwd}`,
      ...(run.status==='blocked'?{humanQA:[...(t.humanQA??[]),{
        q:'**Run stopped:** '+String(observed.reason??'interrupted or failed')+'. Inspect preserved branch '+run.branch+' and run evidence before a new attempt. No automatic retry was started.',
        askedAt:new Date().toISOString()
      }]}:{})
    }:t));
    // No automatic worktree deletion, restart, retry, manager message or fallback.
  }
  private persist(run:Run) {
    const dir=join(readConfig().harnessHome!,'office-runs',run.id); mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'run.json'),JSON.stringify(run,null,2)+'\n');
  }
}
