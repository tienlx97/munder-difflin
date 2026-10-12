import { useEffect, useState, type CSSProperties } from 'react';
import { modelsForProvider } from '@/store/config';
import { TasksKanban } from './TasksKanban';
import { routeCodingTask } from '@shared/codingOfficePolicy';

type Runtime = 'claude' | 'codex';
type Defaults = { runtime: Runtime; models: Record<Runtime,string>; efforts: Record<Runtime,string> };
const roles = [
  ['frontend','FE Developer'], ['backend','BE Developer'],
  ['architect','SA / Solution Architect'], ['qa','QA Engineer'],
  ['reviewer','Code Reviewer'], ['integration','Integration Engineer']
] as const;
type Role = typeof roles[number][0];
const initial = (): Defaults => ({runtime:'codex',models:{claude:'',codex:''},efforts:{claude:'low',codex:'low'}});
const field: CSSProperties = {display:'flex',flexDirection:'column',gap:4,marginBottom:10};
const panel: CSSProperties = {position:'absolute',top:48,right:16,zIndex:1000,width:420,maxWidth:'calc(100vw - 32px)',maxHeight:'calc(100vh - 80px)',overflowY:'auto',boxSizing:'border-box',padding:20,background:'var(--cth-paper-100)',color:'var(--cth-ink-900)',border:'1px solid var(--cth-ink-500)'};
const footer: CSSProperties = {position:'sticky',bottom:-20,background:'var(--cth-paper-100)',padding:'12px 0',borderTop:'1px solid var(--cth-ink-500)'};

/** Configure the team once; dispatch a task using its saved role settings. */
export function CodingTaskLauncher() {
  const [open,setOpen]=useState(false), [settings,setSettings]=useState(false), [board,setBoard]=useState(false);
  const [defaults,setDefaults]=useState<Record<string,Defaults>>({}), [draft,setDraft]=useState<Record<string,Defaults>>({});
  const [loaded,setLoaded]=useState(false), [busy,setBusy]=useState(false), [message,setMessage]=useState('');
  const [repo,setRepo]=useState<'FE'|'BE'>('FE'), [prompt,setPrompt]=useState('');
  const [role,setRole]=useState(''), [featureId,setFeatureId]=useState(''), [baseRef,setBaseRef]=useState(''), [continueFrom,setContinueFrom]=useState('');
  const [exact,setExact]=useState(false), [file,setFile]=useState(''), [old,setOld]=useState(''), [replacement,setReplacement]=useState('');
  const ready=roles.every(([id])=>!!defaults[id]);
  const roleKey=role||(repo==='FE'?'frontend':'backend');
  const selected=defaults[roleKey];
  const policy=routeCodingTask({repo,prompt,edit:exact?{}:undefined});
  useEffect(()=>{
    let active=true;
    void Promise.resolve().then(()=>window.cth.officePreferences()).then(result=>{
      if(!active)return;
      setDefaults(result.defaults??{});setLoaded(true);
      if(!result.ok)setMessage(result.error??'Cannot load agent settings');
    }).catch(e=>{if(active){setLoaded(true);setMessage(String(e));}});
    return()=>{active=false;};
  },[]);
  const configure=()=>{
    setDraft(Object.fromEntries(roles.map(([id])=>[id,defaults[id]??initial()])));
    setMessage('');setOpen(false);setBoard(false);setSettings(true);
  };
  const newTask=()=>{
    if(!loaded)return;
    if(!ready){configure();return;}
    if(!open){setRole('');setExact(false);setPrompt('');setFeatureId('');setBaseRef('');setContinueFrom('');}
    setMessage('');setSettings(false);setBoard(false);setOpen(!open);
  };
  const change=(id:string,value:Defaults)=>setDraft(current=>({...current,[id]:value}));
  const save=async()=>{
    setBusy(true);setMessage('');
    try{
      const values=Object.fromEntries(roles.map(([id])=>{const v=draft[id];return [id,{...v,models:{claude:v.models.claude.trim(),codex:v.models.codex.trim()}}];}));
      const result=await window.cth.saveOfficeTeam(values);
      if(result.ok){setDefaults(result.defaults??{});setSettings(false);setRole('');setExact(false);setOpen(true);setMessage('Agent team saved. Select FE or BE and enter your task.');}
      else setMessage(result.error??'Save failed');
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  };
  const start=async()=>{
    if(!prompt.trim()){setMessage('Enter a task before starting a worker.');return;}
    setBusy(true);setMessage('');
    try{
      const result=await window.cth.dispatchOfficeTask({repo,prompt,...(role?{role:role as Role}:{}),...(featureId?{featureId}:{}),...(baseRef?{baseRef}:{}),...(continueFrom?{continueFrom}:{}),...(exact?{edit:{file,old,new:replacement}}:{})});
      setMessage(result.ok?`${exact?'Checked patch':'Started'} ${repo} with ${exact?'zero workers':selected?.runtime}. Branch: ${result.run?.branch}`:result.error??'Launch failed');
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  };
  return <>
    <button className="cth-titlebar-nodrag" disabled={!loaded} onClick={newTask}>Coding task</button>
    <button className="cth-titlebar-nodrag" disabled={!loaded} onClick={configure}>Agent settings</button>
    <button className="cth-titlebar-nodrag" onClick={()=>{setBoard(!board);setOpen(false);setSettings(false);}}>Task board</button>
    {board&&<section role="dialog" aria-label="Task board" className="cth-titlebar-nodrag" style={{...panel,left:20,right:20,width:'auto',zIndex:1001}}><button onClick={()=>setBoard(false)}>Close board</button><TasksKanban /></section>}
    {settings&&<section role="dialog" aria-label="Agent settings" className="cth-titlebar-nodrag" style={{...panel,width:560}}>
      <h3>Configure your agent team</h3>
      <p>Save once for this workspace. Configuring an agent does not start it.</p>
      {roles.map(([id,label])=>{
        const value=draft[id]??initial(),runtime=value.runtime;
        return <fieldset key={id} style={{marginBottom:12,padding:12}}><legend>{label}</legend>
          <label style={field}>Runtime<select aria-label={`${id} Runtime`} value={runtime} onChange={e=>change(id,{...value,runtime:e.target.value as Runtime})}><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label>
          <label style={field}>Model<input aria-label={`${id} Model`} value={value.models[runtime]} list={`team-${id}-${runtime}`} placeholder="CLI default (leave empty)" onChange={e=>change(id,{...value,models:{...value.models,[runtime]:e.target.value}})} /><datalist id={`team-${id}-${runtime}`}>{modelsForProvider(runtime).filter(m=>m.id).map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</datalist></label>
          <label style={field}>Effort<select aria-label={`${id} Effort`} value={value.efforts[runtime]} onChange={e=>change(id,{...value,efforts:{...value.efforts,[runtime]:e.target.value}})}><option value="">CLI default</option>{(runtime==='claude'?['low','medium','high','xhigh','max']:['low','medium','high','xhigh']).map(v=><option key={v}>{v}</option>)}</select></label>
        </fieldset>;
      })}
      <footer style={footer}><button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save team configuration'}</button>{' '}<button onClick={()=>setSettings(false)}>Close settings</button><p role="status" style={{overflowWrap:'anywhere'}}>{message}</p></footer>
    </section>}
    {open&&<section role="dialog" aria-label="Coding task" className="cth-titlebar-nodrag" style={panel}>
      <h3>New coding task</h3>
      <label style={field}>Repository<select aria-label="Repository" value={repo} onChange={e=>setRepo(e.target.value as 'FE'|'BE')}><option>FE</option><option>BE</option></select></label>
      <label style={field}>Task<textarea aria-label="Task" rows={6} value={prompt} placeholder="Describe the change or problem to solve…" onChange={e=>setPrompt(e.target.value)} /></label>
      <p>{roleKey}: {selected?.runtime} · {selected?.models[selected.runtime]||'CLI default'} · effort {selected?.efforts[selected.runtime]||'CLI default'}</p>
      <details><summary>Advanced options</summary>
        <label style={field}>Specialist override<select aria-label="Logical role" value={role} onChange={e=>setRole(e.target.value)}><option value="">Automatic FE / BE developer</option>{roles.filter(([id])=>!['frontend','backend'].includes(id)).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <label style={field}>Parent task ID (optional)<input value={featureId} onChange={e=>setFeatureId(e.target.value)} /></label>
        <label style={field}>Base branch (optional)<input value={baseRef} onChange={e=>setBaseRef(e.target.value)} /></label>
        <label style={field}>Continue stopped run (optional)<input value={continueFrom} onChange={e=>setContinueFrom(e.target.value)} /></label>
        <label style={{display:'flex',gap:8,marginBottom:10}}><input type="checkbox" checked={exact} onChange={e=>setExact(e.target.checked)} />Exact FE edit (zero model calls)</label>
        {exact&&<><label style={field}>Source file<input value={file} onChange={e=>setFile(e.target.value)} /></label><label style={field}>Original exact text<input value={old} onChange={e=>setOld(e.target.value)} /></label><label style={field}>Replacement<input value={replacement} onChange={e=>setReplacement(e.target.value)} /></label></>}
      </details>
      <p>{policy.tier} · {policy.seconds} second limit · {policy.risk} risk. One scoped worker; no automatic retry. Merge and deployment require approval.</p>
      <footer style={footer}>{!prompt.trim()&&<p>Enter your request in Task, then click Start worker.</p>}<button disabled={!ready||busy} onClick={()=>void start()}>{busy?'Starting…':'Start worker'}</button>{' '}<button onClick={()=>setOpen(false)}>Close</button><p role="status" style={{overflowWrap:'anywhere'}}>{message}</p></footer>
    </section>}
  </>;
}
