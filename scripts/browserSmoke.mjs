import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const temp = mkdtempSync(tmpdir() + '/whenigo-browser-');
const server = spawn(process.execPath, ['--import','tsx','server/index.ts'], {cwd:process.cwd(),env:{...process.env,PORT:'19876',DB_PATH:temp+'/app.db',KAKAO_REST_API_KEY:'',TAGO_SERVICE_KEY:'',NODE_ENV:'test'},stdio:'ignore'});
let browser;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:19876/api/health')).ok)break;}catch{} await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const checks=[];
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:19876')?route.continue():route.abort());
  for(const path of ['/','/login','/privacy','/settings']){
   await page.goto('http://127.0.0.1:19876'+path); await page.waitForFunction(()=>document.body.innerText.trim().length>0);
   assert(await page.locator('body').innerText());
   if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))){console.log(JSON.stringify({path,width:viewport.width,overflow:await page.evaluate(()=>Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,80)})).slice(0,20))}));await page.screenshot({path:'/tmp/whenigo-overflow.png',fullPage:true});throw Error('overflow');}
   checks.push({width:viewport.width,path,overflow:false});
  }
  await page.goto('http://127.0.0.1:19876/');
  await page.route('**/api/route',route=>route.fulfill({json:{from:{name:'출발'},to:{name:'도착'},routes:[{totalMin:30,legs:[{kind:'bus',from:{name:'출발',lat:36.3,lng:127.3},to:{name:'도착',lat:36.31,lng:127.31},durationMin:30,carrier:'603',confidence:'estimated'}]}]}}));
  await page.locator('#field-from').fill('출발');await page.locator('#field-to').fill('도착');
  await page.locator('form.panel button[type=submit]').click();
  await page.waitForSelector('.trip-spine, .spine, .hero--result, .tripstats',{timeout:5000}).catch(()=>{});
  await page.waitForFunction(()=>document.body.innerText.includes('603'));
  assert.equal(errors.length,0,JSON.stringify(errors));
  checks.push({width:viewport.width,routeFixture:'603',runtimeErrors:errors.length});
  await page.screenshot({path:'/tmp/whenigo-'+viewport.width+'.png',fullPage:true});
  await page.close();
 }
 writeFileSync('/tmp/whenigo-browser-results.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
} finally {if(browser)await browser.close();server.kill();rmSync(temp,{recursive:true,force:true});}
