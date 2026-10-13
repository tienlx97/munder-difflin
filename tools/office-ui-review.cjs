const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve('..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'office-ui-'));
 const profile=path.join(temp,'config/Electron');fs.mkdirSync(profile,{recursive:true});
 const config=JSON.parse(fs.readFileSync(path.join(root,'.local/state/config/Electron/config.json'),'utf8'));
 // A disposable copy of history/preferences; no workers or provider requests.
 const home=path.join(temp,'home');fs.cpSync(path.join(root,'.local/state/home'),home,{recursive:true,filter:src=>!src.includes('/worktrees')&&!src.includes('/office-runs')});
 config.harnessHome=home;config.recentHarnessHomes=[home];fs.writeFileSync(path.join(profile,'config.json'),JSON.stringify(config));
 const app=await electron.launch({args:[path.resolve('out/main/index.js'),'--disable-gpu'],env:{...process.env,DO_NOT_TRACK:'1',XDG_CONFIG_HOME:path.join(temp,'config')},timeout:30000});
 try{
 const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'open',exact:true}).click();
 await page.getByRole('button',{name:'Agent settings',exact:true}).click();
 await page.getByLabel('frontend Model',{exact:true}).waitFor();
 assert.equal(await page.locator('fieldset').count(),1);
 assert.equal(await page.getByRole('button',{name:'add agent',exact:false}).count(),0);
 await page.getByRole('button',{name:/BE Developer/}).click();
 await page.getByLabel('backend Model',{exact:true}).fill('fixture-ui-model');
 await page.getByRole('button',{name:'Save team configuration'}).click();
 await page.getByRole('combobox',{name:'Repository',exact:true}).selectOption('BE');
 assert.ok(await page.getByRole('dialog',{name:'Coding task',exact:true}).textContent().then(t=>t.includes('fixture-ui-model')));
 await page.getByText('Advanced options',{exact:true}).click();
 assert.equal(await page.getByText('Exact FE edit (zero model calls)',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Agent settings',exact:true}).click();
 await page.getByRole('button',{name:/FE Developer/}).click();
 const output=path.join(root,'.local/evidence');fs.mkdirSync(output,{recursive:true});
 await page.screenshot({path:path.join(output,'office-team-desktop.png')});
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(480,480);w.setSize(620,700);});
 await page.screenshot({path:path.join(output,'office-team-small.png')});
 const dialog=page.getByRole('dialog',{name:'Agent settings',exact:true});assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await dialog.waitFor();
 assert.equal(await page.getByText('Voice',{exact:true}).count(),0);
 await page.getByText('Workspace configuration & diagnostics',{exact:true}).click();
 await page.getByRole('button',{name:'Check runtimes',exact:true}).click();
 await page.getByText(/Version checks make no provider request/).waitFor();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Task board',exact:true}).click();
 await page.getByRole('heading',{name:'Task history'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.cth.listPtys()),[]);
 assert.deepEqual(errors,[]);
 console.log('PASS: role editing/persistence, FE/BE task defaults, hidden unused actions, responsive layout, Escape, unified settings, diagnostics; zero model sessions.');
 }finally{await app.evaluate(({app})=>app.exit(0));fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
