/** Fingerprint algorithm adapted from FE-P/harness/lib/workflow.mjs. */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readlinkSync} from 'node:fs';
import {join} from 'node:path';
export function officeFingerprint(root:string):string {
  const files=[...new Set(execFileSync('git',['ls-files','-c','-o','--exclude-standard','-z'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).split('\0').filter(Boolean))].sort();
  const hash=createHash('sha256');
  for(const file of files){
    if(file.startsWith('harness/runs/')||file.startsWith('.memsearch/')||file==='harness/PROGRESS.md')continue;
    const path=join(root,file);let stat;try{stat=lstatSync(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}
    if(!stat.isFile()&&!stat.isSymbolicLink())throw new Error('Unsupported input: '+file);
    const data=stat.isSymbolicLink()?readlinkSync(path):readFileSync(path);
    hash.update(JSON.stringify([file,stat.isSymbolicLink()?'link':'file',!!(stat.mode&0o111),createHash('sha256').update(data).digest('hex')]));
  }
  return hash.digest('hex');
}
export function officeContext(root:string,repo:string,role:string,task:string,previous?:string){
  const sources=['AGENTS.md','harness/GOLDEN_RULES.md','harness/README.md'];
  // Paths only: the CLI already loads repository instructions; don't duplicate them.
  const available=sources.filter(p=>{try{return lstatSync(join(root,p)).isFile();}catch{return false;}});
  const text=`${task}\nRepository: ${repo}. Role: ${role}.\nRelevant instruction pointers: ${available.join(', ')}. Read only task-relevant sections. Keep tool output bounded; summarize checks rather than dumping logs.\n${previous?'Continue the existing diff; previous run: '+previous+'. Inspect changed files before editing.\n':''}Work only in this worktree. Do not delegate, commit, push, merge, deploy, access secrets or modify .git. Preserve repository instructions. Return changed files, checks and any remaining UI/browser verification.`;
  return {text,manifest:{schemaVersion:1,sources:available,characters:text.length,taskCharacters:task.length,previous:previous??null}};
}

export function continuationUsage(runs:Array<{id:string;tokens:number|string;fromRun?:string|null}>,id:string):number {
  const seen=new Set<string>();let total=0,current:string|null|undefined=id;
  while(current){
    if(seen.has(current))throw new Error('Cyclic continuation history');seen.add(current);
    const run=runs.find(r=>r.id===current);
    if(!run||typeof run.tokens!=='number'||!Number.isFinite(run.tokens)||run.tokens<0)throw new Error('Previous usage is unknown; inspect evidence before starting a new task');
    total+=run.tokens;current=run.fromRun;
  }
  return total;
}
