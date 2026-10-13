import {useEffect,useState} from 'react';
type Runs=Awaited<ReturnType<typeof window.cth.officeRuns>>;
export function OfficeRunHistory(){
  const [runs,setRuns]=useState<Runs>([]),[busy,setBusy]=useState(''),[message,setMessage]=useState('');
  const refresh=()=>window.cth.officeRuns().then(setRuns).catch(e=>setMessage(String(e)));
  useEffect(()=>{void refresh();const off=window.cth.onOfficeRunChanged(()=>void refresh());const timer=setInterval(()=>void refresh(),3000);return()=>{off();clearInterval(timer);};},[]);
  const act=async(id:string,accept=false)=>{setBusy(id);setMessage('');try{const result=await (accept?window.cth.acceptOfficeRun(id):window.cth.verifyOfficeRun(id));if(!result.ok)setMessage(result.error??'Operation failed');await refresh();}catch(e){setMessage(String(e));}finally{setBusy('');}};
  return <><h3>Task history</h3><p className="office-muted">Review the diff and task-specific evidence before accepting a verified run.</p><p role="status">{message}</p>{runs.length===0&&<p>No tasks yet. Start a coding task for FE or BE.</p>}<div className="office-runs">{runs.map(run=><article key={run.id}>
    <div><strong>{run.repo} · {run.prompt?.slice(0,160)||run.id}</strong><p>{run.status} · {run.role}</p><small>{run.id}</small></div>
    <p className="office-muted">Fresh input: {run.metrics?.freshInputTokens??'unknown'} · cached: {run.metrics?.cachedInputTokens??'unknown'} · output: {run.metrics?.outputTokens??'unknown'} · total: {run.tokens}</p>
    <p>{run.verification?.reason}</p>{run.evidencePath&&<button onClick={()=>void window.cth.revealPath(run.evidencePath!)}>Open diff & evidence folder</button>}{' '}
    {!['running','verifying','done'].includes(run.status)&&<button disabled={!!busy} onClick={()=>void act(run.id)}>{busy===run.id?'Verifying…':'Run repository checks'}</button>}{' '}
    {run.status==='review-needed'&&run.verification?.status==='passed'&&<button disabled={!!busy} onClick={()=>void act(run.id,true)}>Accept reviewed result</button>}
  </article>)}</div></>;
}
