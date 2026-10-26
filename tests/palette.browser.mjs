// Run against a local preview with Playwright installed. Native OS picker UI still requires device testing.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true,args:['--no-sandbox']});
try{for(const width of [320,390,1200]){const page=await browser.newPage({viewport:{width,height:844},hasTouch:width<500,isMobile:width<500}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.addInitScript(()=>{window.modelTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(t){window.modelTools[t.name]=t;}}});});await page.goto(process.env.CUBER_TEST_URL||'http://127.0.0.1:4173/');await page.locator('[data-mode=paint]').click();
const swatch=page.locator('[data-color-index="3"]'),picker=page.locator('[data-picker-index="3"]');
await page.evaluate(()=>{window.swatchBefore=document.querySelector('[data-color-index="3"]');window.colorActivations=[];document.addEventListener('click',e=>{if(e.target.matches('.swatch-picker'))window.colorActivations.push({trusted:e.isTrusted,type:e.target.type,index:e.target.dataset.pickerIndex});});});
if(width<500)await swatch.tap();else await swatch.click();
assert.equal(await picker.isEnabled(),true);assert.equal(await page.evaluate(()=>window.swatchBefore===document.querySelector('[data-color-index="3"]')),true,'first tap keeps the same palette DOM');
const bounds=await picker.boundingBox();assert.ok(bounds.width>=26&&bounds.height>=26);assert.equal(await picker.evaluate(el=>document.elementFromPoint(el.getBoundingClientRect().x+el.clientWidth/2,el.getBoundingClientRect().y+el.clientHeight/2)===el),true);
if(width<500)await picker.tap();else await picker.click();
assert.deepEqual(await page.evaluate(()=>window.colorActivations),[{trusted:true,type:'color',index:'3'}]);
await picker.evaluate(el=>{el.value='#7744aa';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
assert.equal(await page.evaluate(()=>window.modelTools.read_cube_model.execute().color),'#7744aa');assert.equal(await swatch.getAttribute('data-color'),'#7744aa');
await page.waitForTimeout(900);await page.reload();await page.waitForFunction(()=>window.modelTools?.read_cube_model);assert.equal(await page.evaluate(()=>window.modelTools.read_cube_model.execute().palette[3]),'#7744aa');
await page.locator('[data-mode=paint]').click();assert.equal(await page.locator('[data-picker-index="3"]').isEnabled(),true);assert.deepEqual(errors,[]);console.log('PASS',width,'trusted direct picker tap, stable first tap, color update and autosave restore');await page.close();}}finally{await browser.close();}
