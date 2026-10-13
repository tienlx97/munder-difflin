const { _electron: electron } = require('playwright');
const path = require('node:path');
(async () => {
 const app = await electron.launch({args:[path.resolve('out/main/index.js')],env:{...process.env,DO_NOT_TRACK:'1',XDG_CONFIG_HOME:path.resolve('../.local/state/config')},timeout:30000});
 console.log('launched');
 const page = await app.firstWindow({timeout:15000});
 console.log('window',page.url());
 page.setDefaultTimeout(15000);
 await page.waitForLoadState('domcontentloaded',{timeout:15000});
 console.log('loaded');
 await page.screenshot({path:path.resolve('../.local/evidence/phase0-ui.png')});
 console.log(JSON.stringify({title:await page.title(),text:(await page.locator('body').innerText()).slice(0,700),ptys:await page.evaluate(()=>window.cth.listPtys())}));
 await app.close();
})().catch(e=>{console.error(e);process.exit(1)});
