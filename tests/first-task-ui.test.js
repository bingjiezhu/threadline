/** Rendering contract unit tests. Not a claim of native-browser acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {apiTest} from './helpers/http.js';
const source=readFileSync(new URL('../public/warm-ui.js',import.meta.url),'utf8');
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setupView(record=null,goals=[]){
 const ctx={window:{},document:{querySelector:()=>null}};vm.createContext(ctx);vm.runInContext(source,ctx);
 const state={view:'first-task',data:{demo:false,ai:{configured:false},contacts:[],notes:[]}};
 return ctx.window.createWarmUI({state,api:async path=>path==='/api/warm'?{goals,routes:[]}:record,reload:async()=>{},go:()=>{},esc,btn:(a,l,i,c='',id='')=>`<button data-action="${esc(a)}" data-id="${esc(id)}">${esc(l)}</button>`,field:()=>'',area:()=>'',select:()=>'',icon:()=>'<svg></svg>',avatar:s=>`<span>${esc(s)}</span>`,badge:(s,l=s)=>`<span>${esc(l)}</span>`,fmtDate:s=>s,localDay:()=> '2026-10-17',formModal:()=>{},toast:()=>{},openModal:()=>{}});
}
function goal(patch={}){
 const r={id:'route-1',person_name:'Jordan Lee',note_id:'note-1',source_title:'Owner update',effective_on:'2026-10-16',route_role:'approver',quote:'Jordan now handles sandbox access. Training is still required.'};
 return {id:'goal-1',title:'My first sandbox walkthrough',role:'New solutions engineer',topic:'sandbox-access',success:'Run one approved test.',status:'open',due_on:null,plans:[{id:'plan-1',status:'proposed',version:1,mode:'local',tasks:[],body:{resolution:'ready',steps:['read','ask','verify'].map(kind=>({id:kind,kind,route_id:r.id,title:kind,instruction:'Check the source',draft:kind==='ask'?'Hello Jordan':''})),evidence:[r],history:[],unknowns:['Access is not confirmed.'],trace:['Check sources']}}],...patch};
}
test('Focused empty view contains no sample people and requires the user to set a task',async()=>{
 const html=await setupView().firstTaskPage();assert.match(html,/Set my first task/);assert.doesNotMatch(html,/Maya|Jordan|Add to my tasks/);
});
test('Focused proposal shows the actual owner, source and explicit approval without claiming execution',async()=>{
 const html=await setupView(goal()).firstTaskPage('goal-1');assert.match(html,/Jordan Lee/);assert.match(html,/Training is still required/);assert.match(html,/Not saved yet/);assert.match(html,/name="confirm".*required/);assert.match(html,/Plan: saved notes · AI wording off/);
});
test('Focused view escapes user-supplied goal and quotation content',async()=>{
 const g=goal();g.title='<img src=x onerror=alert(1)>';g.plans[0].body.evidence[0].quote='<script>attack()</script>';
 const html=await setupView(g).firstTaskPage(g.id);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.doesNotMatch(html,/<script>|<img src=x/);
});
test('Stale focused plan withholds even a residual old owner and does not expose task approval',async()=>{
 const g=goal();g.plans[0].status='stale';const html=await setupView(g).firstTaskPage(g.id);
 assert.match(html,/This plan is out of date/);assert.doesNotMatch(html,/Jordan Lee|Training is still required|Add to my tasks/);
});
test('A conflicting focused plan has no executable next steps and asks for clarification',async()=>{
 const g=goal();g.plans[0].body.resolution='needs_clarification';g.plans[0].body.steps=[];
 const html=await setupView(g).firstTaskPage(g.id);assert.match(html,/guessed person/);assert.doesNotMatch(html,/id="warm-approval"/);
});
test('Completed selected steps are not silently presented as a completed goal',async()=>{
 const g=goal();g.plans[0].status='approved';g.plans[0].tasks=[{step_id:'read',id:'task-1',status:'done'}];
 const html=await setupView(g).firstTaskPage(g.id);assert.match(html,/1 \/ 1 done/);assert.match(html,/In progress/);assert.match(html,/Record the result/);assert.doesNotMatch(html,/Reported complete by you/);
});
apiTest('Focused assets are served by the real application; no new unauthenticated data route exists',async({base})=>{
 const r=await fetch(base+'/first-task.css');assert.equal(r.status,200);assert.match(await r.text(),/firstwin-grid/);
 const page=await fetch(base+'/');assert.match(await page.text(),/first-task.css/);
 assert.equal((await fetch(base+'/api/warm')).status,401);
});

test('Focused change label does not invent a connection to an unrelated superseded route',async()=>{
 const g=goal();g.plans[0].body.history=[{id:'old-mentor',status:'superseded',person_name:'Unrelated Mentor'}];
 const html=await setupView(g).firstTaskPage(g.id);assert.doesNotMatch(html,/Unrelated Mentor|YOU CONFIRMED THE CHANGE/);
 g.plans[0].body.evidence[0].supersedes_id='old-approver';g.plans[0].body.history.push({id:'old-approver',status:'superseded',person_name:'Maya Chen'});
 const correct=await setupView(g).firstTaskPage(g.id);assert.match(correct,/YOU CONFIRMED THE CHANGE/);assert.match(correct,/Maya Chen/);assert.doesNotMatch(correct,/Unrelated Mentor/);
});

// Clarity is a rendering change, not a change to who is permitted to act.
test('First-task view explains a sandbox the first time it appears',async()=>{
 const html=await setupView(goal()).firstTaskPage('goal-1');
 assert.match(html,/Test site \(sandbox\): a safe place to practice without changing the live app/);
});
test('Unrelated tasks do not acquire a made-up test-site explanation',async()=>{
 const g=goal({title:'Prepare my first client call',topic:'client-calls'});
 const html=await setupView(g).firstTaskPage(g.id);assert.doesNotMatch(html,/class="firstwin-definition"/);
});
test('Plain labels preserve original wording and do not make source verification an authority guarantee',async()=>{
 const g=goal();const html=await setupView(g).firstTaskPage(g.id);
 assert.ok(html.includes(esc(g.plans[0].body.evidence[0].quote)));
 assert.match(html,/according to your note/);assert.match(html,/Checked by you/);
});
test('AI mode is only labeled active when the persisted plan records it',async()=>{
 const g=goal();g.plans[0].mode='openai';const html=await setupView(g).firstTaskPage(g.id);
 assert.match(html,/AI-assisted wording/);assert.doesNotMatch(html,/AI off/);
});
test('Technical inspection stays accessible in a collapsed disclosure',async()=>{
 const html=await setupView(goal()).firstTaskPage('goal-1');
 assert.match(html,/<details class="firstwin-checks"><summary>How it works &amp; limits/);
 assert.match(html,/Check sources/);assert.doesNotMatch(html,/<details class="firstwin-checks" open/);
});
test('An approved plan never shows a second create-task button',async()=>{
 const g=goal();g.plans[0].status='approved';const html=await setupView(g).firstTaskPage(g.id);
 assert.doesNotMatch(html,/Add to my tasks/);assert.match(html,/Your task list/);
});
