/** Optional release check: node scripts/verify-baseline-upgrade.js /path/to/extracted/Threadline-v1 */
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {openStore} from '../src/store.js';
import {createDomain} from '../src/domain.js';
import {createAuth} from '../src/auth.js';
import {createRelationships} from '../src/relationships.js';
import {createWarmStart} from '../src/warm-start.js';
const baseline=process.argv[2];if(!baseline)throw Error('Provide the path to the trusted, extracted English 1.0 or 1.2 Threadline source. It will run trusted baseline modules on a temporary synthetic database.');
const baselineVersion=JSON.parse(readFileSync(join(baseline,'package.json'),'utf8')).version;assert.ok(['1.0.0','1.2.0'].includes(baselineVersion));const baselineSchema=baselineVersion==='1.0.0'?1:2;
const load=p=>import(pathToFileURL(resolve(baseline,p)).href);
const OldStore=await load('src/store.js'),OldAuth=await load('src/auth.js'),OldDomain=await load('src/domain.js');
const folder=mkdtempSync(join(tmpdir(),'threadline-real-v1-upgrade-')),file=join(folder,'data.sqlite');const checks=[];let store;
const ok=name=>checks.push({name,passed:true});
try{
 store=OldStore.openStore(file);const A=OldAuth.createAuth(store),D=OldDomain.createDomain(store);
 const password='Synthetic-only-upgrade-password!';const login=await A.register({name:'Upgrade Owner',email:'upgrade@example.invalid',password,workspace:'Synthetic upgrade workspace'});const w=login.user.workspace_id;
 const c=D.createContact(w,{name:'Baseline Contact',company:'Synthetic Company'}),p=D.createProject(w,{name:'Before the upgrade',contact_id:c.id,status:'waiting',unknowns:'Budget and owner are unconfirmed.'}),n=D.createNote(w,{title:'Baseline conversation',contact_id:c.id,project_id:p.id,occurred_on:'2026-01-02',body:'We require private deployment. Budget is not confirmed.'});
 let claim=D.createClaim(w,{note_id:n.id,kind:'requirement',topic:'private-deployment',quote:'We require private deployment.',certainty:'confirmed'});claim=D.decideClaim(w,claim.id,{version:claim.version,decision:'approve'});
 const oldexport=D.export(w);assert.equal(store.db.prepare('SELECT version FROM schema_meta').get().version,baselineSchema);ok(`Actual English ${baselineVersion} code creates an authenticated schema-${baselineSchema} database with source and approved evidence`);store.close();
 store=openStore(file);const N=createDomain(store),R=createRelationships(store,N);assert.equal(store.db.prepare('SELECT version FROM schema_meta').get().version,3);ok('Current code migrates the actual baseline schema to version 3');
 const state=N.state(w);assert.equal(state.contacts[0].id,c.id);assert.equal(state.projects[0].id,p.id);assert.equal(state.claims[0].id,claim.id);assert.equal(state.projects[0].status,'waiting');assert.equal(N.noteDetail(w,n.id).body,n.body);assert.deepEqual(N.export(w).tables.contacts,oldexport.tables.contacts);ok('Contact IDs, project state, exact original text, approved evidence and core export survive');
 const warm=createWarmStart(store,N),goal=warm.createGoal(w,{title:'First sandbox test',role:'New colleague',topic:'sandbox',success:'Run one approved test'});
 const rel=R.capture(w,{body:'A new follow-through note after the upgrade.',contact_id:c.id,channel:'wechat',reminder:{title:'Keep the promise',due_on:'2026-11-01'}});store.close();store=openStore(file);assert.equal(createDomain(store).noteDetail(w,rel.note.id).capture.channel,'wechat');assert.equal(createDomain(store).state(w).tasks[0].title,'Keep the promise');assert.equal(createWarmStart(store,createDomain(store)).goal(w,goal.id).title,goal.title);ok('New capture metadata, reminder and onboarding goal persist through a second complete reopen');
 const auth=await createAuth(store).login({email:'upgrade@example.invalid',password});assert.equal(auth.user.workspace_id,w);ok('The original credential continues to authenticate the existing workspace');
 assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');ok('Foreign-key and SQLite integrity checks pass');
 console.log(JSON.stringify({release:'1.3.1',status:'passed',baseline:`Actual extracted English ${baselineVersion} modules`,fixture:'Synthetic records only in an isolated temporary database',checks},null,2));
}finally{store?.close();rmSync(folder,{recursive:true,force:true});}
