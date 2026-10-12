import { useState } from 'react';
import { modelsForProvider } from '@/store/config';
import { TasksKanban } from './TasksKanban';
import { routeCodingTask } from '@shared/codingOfficePolicy';

/** Two repo workers on the existing floor; no additional office or scheduler. */
export function CodingTaskLauncher() {
  const [open,setOpen]=useState(false);
  const [board,setBoard]=useState(false);
  const [role,setRole]=useState('');
  const [featureId,setFeatureId]=useState('');
  const [baseRef,setBaseRef]=useState('');
  const [continueFrom,setContinueFrom]=useState('');
  const [repo,setRepo]=useState<'FE'|'BE'>('FE');
  const [runtime,setRuntime]=useState<'claude'|'codex'>('codex');
  const [models,setModels]=useState<Record<'claude'|'codex',string>>({claude:'',codex:''});
  const model=models[runtime];
  const [prompt,setPrompt]=useState('');
  const [exact,setExact]=useState(false);
  const [file,setFile]=useState('');
  const [old,setOld]=useState('');
  const [replacement,setReplacement]=useState('');
  const policy=routeCodingTask({repo,prompt,edit:exact?{}:undefined});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const start=async()=>{
    setBusy(true);setMessage('');
    try {
      const result=await window.cth.startOfficeTask({repo,runtime,prompt,...(model.trim()?{model:model.trim()}:{}),...(role?{role:role as 'reviewer'|'qa'|'architect'|'integration'}:{}),...(baseRef?{baseRef}:{}),...(featureId?{featureId}:{}),...(continueFrom?{continueFrom}:{}),...(exact?{edit:{file,old,new:replacement}}:{})});
      setMessage(result.ok?`${exact?'Checked patch':'Started'} ${repo} with ${exact?'zero workers':runtime}. Branch: ${result.run?.branch}`:result.error??'Launch failed');
    } catch(e) {setMessage(String(e));}
    finally {setBusy(false);}
  };
  return <>
    <button className="cth-titlebar-nodrag" onClick={()=>setOpen(!open)}>Coding task</button>
    <button className="cth-titlebar-nodrag" onClick={()=>setBoard(!board)}>Task board</button>
    {board&&<section role="dialog" aria-label="Task board" style={{position:'absolute',top:48,left:20,right:20,zIndex:1001,maxHeight:'80vh',overflow:'auto',background:'var(--cth-paper-100)',padding:16}}><button onClick={()=>setBoard(false)}>Close board</button><TasksKanban /></section>}
    {open&&<section role="dialog" aria-label="Coding task" style={{position:'absolute',top:48,right:16,zIndex:1000,width:420,maxWidth:'calc(100vw - 32px)',maxHeight:'calc(100vh - 80px)',overflowY:'auto',boxSizing:'border-box',padding:20,background:'var(--cth-paper-100)',color:'var(--cth-ink-900)',border:'1px solid var(--cth-ink-500)'}}>
      <p>Launch one worker in an isolated worktree. Michael stays idle.</p>
      <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Repository <select aria-label="Repository" value={repo} onChange={e=>setRepo(e.target.value as 'FE'|'BE')}><option>FE</option><option>BE</option></select></label>{' '}
      <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Runtime <select aria-label="Runtime" value={runtime} onChange={e=>setRuntime(e.target.value as 'claude'|'codex')}><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label>
      <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Model<input aria-label="Model" list={`office-models-${runtime}`} value={model} placeholder="CLI default (leave empty)" disabled={exact} onChange={e=>setModels({...models,[runtime]:e.target.value})} /><datalist id={`office-models-${runtime}`}>{modelsForProvider(runtime).filter(m=>m.id).map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</datalist></label>
      <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Role <select aria-label="Logical role" value={role} onChange={e=>setRole(e.target.value)}><option value="">Coder for selected repo</option><option value="architect">Architect</option><option value="qa">QA</option><option value="reviewer">Reviewer</option><option value="integration">Integration</option></select></label>
      <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Parent task ID (optional)<input value={featureId} onChange={e=>setFeatureId(e.target.value)} /></label>
      <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Base branch (optional)<input value={baseRef} onChange={e=>setBaseRef(e.target.value)} /></label>
      <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Continue stopped run (optional)<input value={continueFrom} onChange={e=>setContinueFrom(e.target.value)} /></label>
      <label style={{display:'block',marginTop:12}}>Task<textarea aria-label="Task" rows={5} value={prompt} onChange={e=>setPrompt(e.target.value)} style={{display:'block',width:'100%'}} /></label>
      <label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}><input type="checkbox" checked={exact} onChange={e=>setExact(e.target.checked)} />Exact FE edit (zero model calls)</label>
      {exact&&<><label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Source file<input value={file} onChange={e=>setFile(e.target.value)} /></label><label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Original exact text<input value={old} onChange={e=>setOld(e.target.value)} /></label><label style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10}}>Replacement<input value={replacement} onChange={e=>setReplacement(e.target.value)} /></label></>}
      <p>{policy.tier} · {policy.seconds} second limit · {policy.risk} risk. No automatic retry. Review patches before merge or deployment.</p>
      <button disabled={busy||!prompt.trim()} onClick={()=>void start()}>{busy?'Starting…':'Start worker'}</button>{' '}
      <button onClick={()=>setOpen(false)}>Close</button>
      <p role="status">{message}</p>
    </section>}
  </>;
}
