import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';

test('The disposable practice command runs real auth and matching without mutating the normal workspace', {timeout:20000}, async()=>{
 const child=spawn(process.execPath,['scripts/demo.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,DEMO_PORT:'0',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let output='',err='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>err+=b);
 let data;
 try{
  for(let i=0;i<150;i++){try{data=JSON.parse(output);break;}catch{}if(child.exitCode!==null)throw Error(err);await sleep(50);}
  assert.ok(data?.url,err);assert.match(data.notice,/Fictional/);
  const origin=data.url;const health=await(await fetch(origin+'/api/health')).json();assert.equal(health.version,'1.3.2');
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email:data.email,password:data.password})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];const auth=await login.json();
  async function api(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Cookie:cookie,...(body?{'Content-Type':'application/json',Origin:origin,'X-CSRF-Token':auth.csrf,'Idempotency-Key':crypto.randomUUID()}: {})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.ok,true,await r.clone().text());return r.json();}
  const before=await api('/api/state');assert.equal(before.demo,true);assert.equal(before.contacts.length,2);assert.equal(before.reviews.filter(r=>r.state==='suggested').length,0);assert.equal(before.ai.configured,false);
  const maya=before.contacts.find(p=>p.name==='Maya Chen'),project=before.projects.find(p=>p.contact_id===maya.id);
  const text='We completed a private deployment for an internal knowledge-search workflow.';
  await api('/api/capture',{body:text,title:'Confirmed delivery in a fictional practice',occurred_on:new Date().toISOString().slice(0,10),annotation:{kind:'capability',topic:'private-deployment',quote:text,certainty:'confirmed',approve:true}});
  // Follow-up candidates are computed by the same release route used by the UI.
  await api('/api/reviews/refresh',{});
  const after=await api('/api/state');assert.equal(after.reviews.filter(r=>r.state==='suggested').length,1);assert.equal(after.projects.find(p=>p.id===project.id).status,'waiting');assert.match(after.projects[0].unknowns,/not confirmed/);
 }finally{
  child.kill('SIGTERM');for(let i=0;i<60&&child.exitCode===null;i++)await sleep(50);
  if(child.exitCode===null)child.kill('SIGKILL');
 }
});
