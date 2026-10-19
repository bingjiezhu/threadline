import test from 'node:test';import assert from 'node:assert/strict';import {setup} from './helpers/http.js';import {randomUUID} from 'node:crypto';
async function fixture(t){const f=await setup();t.after(()=>f.app.close());const c=f.client();await c.register();return c;}
async function importNote(c,provider,path,content){const input={provider,files:[{path,content}]};const p=await c.call('/api/memory/imports/preview','POST',input);assert.equal(p.status,200);const result=await c.call('/api/memory/imports/commit','POST',{...input,preview_hash:p.data.preview_hash,selected:p.data.files.map(({path,hash})=>({path,hash})),confirm:true});assert.equal(result.status,200);return result.data.imported[0].source_id;}
const request=(message,session='phone-memory-test')=>({channel:'imessage',session,message_id:randomUUID(),created_at:new Date().toISOString(),message});
async function ask(c,message){const r=await c.call('/api/memory/conversations/message','POST',request(message));assert.equal(r.status,200,JSON.stringify(r.data));return r.data.reply;}
test('natural imported-memory phone queries avoid contact workflows and return concise scoped excerpts',async t=>{
 const c=await fixture(t);
 await importNote(c,'codex','preferences/writing.md','Avoid mechanical parallelism and empty slogans. Keep original sources.');
 await importNote(c,'claude','workspace/working-style-pragmatic.md','Prefer direct answers and one practical next step.');
 await c.call('/api/memory/sources','POST',{title:'Unrelated demo working preferences',body:'Demo contact Alex likes decorative filler.',origin:'web'});
 const before=(await c.call('/api/state')).data;
 const a=await ask(c,'Tell me about mechanical parallelism in my imported Codex memories.');
 assert.match(a,/mechanical parallelism/);assert.doesNotMatch(a,/Whose records|decorative filler|Claude/);assert.ok(a.length<=1600);
 const b=await ask(c,'Show the source for my Claude working-style-pragmatic memory.');
 assert.match(b,/direct answers/);assert.doesNotMatch(b,/Whose records|decorative filler|mechanical parallelism/);assert.ok(b.length<=1600);
 const after=(await c.call('/api/state')).data;assert.equal(after.notes.length,before.notes.length);assert.equal(after.tasks.length,before.tasks.length);
});
test('requests to create a task about imported memory still require confirmation',async t=>{
 const c=await fixture(t);const reply=await ask(c,'Tomorrow remind me to review my Claude memory.');
 assert.match(reply,/Ready to add/);assert.match(reply,/confirm/);assert.equal((await c.call('/api/state')).data.tasks.length,0);
});
test('an unknown topic in an explicit imported-memory scope gives no invented or demo answer',async t=>{
 const c=await fixture(t);await importNote(c,'claude','preferences.md','Prefer direct answers.');
 const result=await ask(c,'Find my Claude memory about nonexistent-quasar-calibration.');
 assert.match(result,/could not find/i);assert.doesNotMatch(result,/Prefer direct answers/);
});
