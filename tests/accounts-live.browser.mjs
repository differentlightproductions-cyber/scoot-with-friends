import{chromium}from'playwright';import assert from'node:assert/strict';import{randomBytes}from'node:crypto';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH===undefined?'C:/Program Files/Google/Chrome/Application/chrome.exe':(process.env.CHROME_PATH||undefined),headless:true});
const username='qa_'+randomBytes(7).toString('hex'),password=randomBytes(24).toString('hex');let created=false,page;
try{
 page=await browser.newPage({viewport:{width:1400,height:900}});await page.goto('https://scoot-with-friends.nicsoundcloud22.chatgpt.site/?map=outdoor');await page.locator('#destination-loading').waitFor({state:'hidden',timeout:60000});
 await page.locator('#start button').filter({hasText:'Sign in / Create account'}).click();const dialog=page.locator('#account-dialog');await dialog.locator('[role=status]').filter({hasText:'Sign in or create'}).waitFor({timeout:15000});
 await dialog.getByRole('button',{name:'Create an account',exact:true}).click();await dialog.locator('[name=username]').fill(username);await dialog.locator('[name=password]').fill(password);const start=Date.now();await dialog.getByRole('button',{name:'Create account',exact:true}).click();
 await dialog.locator('.account-identity').filter({hasText:'Signed in as'}).waitFor({timeout:30000});created=true;const registrationMs=Date.now()-start;
 const cookies=await page.context().cookies();const session=cookies.find(c=>c.name==='__Host-swf-session');assert(session?.httpOnly&&session.secure&&session.sameSite==='Strict');
 const recovery=await dialog.locator('textarea').inputValue();assert.equal(recovery.length,64);await dialog.getByRole('button',{name:'I saved my recovery code'}).click();
 await dialog.getByRole('button',{name:'Sign out',exact:true}).click();await dialog.locator('.account-identity').filter({hasText:'Sign in / Create'}).waitFor();
 await dialog.locator('[name=username]').fill(username);await dialog.locator('[name=password]').fill(password);await dialog.getByRole('button',{name:'Sign in',exact:true}).click();await dialog.locator('.account-identity').filter({hasText:'Signed in as'}).waitFor({timeout:30000});
 await dialog.getByRole('button',{name:'Refresh account'}).click();await dialog.locator('[role=status]').filter({hasText:'up to date'}).waitFor();await page.reload();await page.locator('#destination-loading').waitFor({state:'hidden',timeout:60000});
 const identity=await page.evaluate(async()=>await(await fetch('/api/account/session')).json());assert.equal(identity.account.username,username);
 console.log(JSON.stringify({registrationMs,registration:true,login:true,secureCookie:true,refresh:true,reloadSession:true}));
}finally{try{if(created&&page){const result=await page.evaluate(async({username,password})=>{await fetch('/api/account/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});const r=await fetch('/api/account/delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});return r.status;},{username,password});assert.equal(result,200);console.log('Temporary test account removed.');}}finally{await browser.close();}}
