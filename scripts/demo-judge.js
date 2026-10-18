/** Five-minute judging practice. Fictional records, normal code, isolated temporary storage. */
import { makeApp } from '../server.js';
import { seedWarmFixture } from '../src/warm-fixture.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
const dir=mkdtempSync(join(tmpdir(),'threadline-judge-'));
const app=makeApp({dbPath:join(dir,'practice.sqlite'),demo:true});
const password='Practice-'+randomBytes(12).toString('hex');
const session=await app.auth.register({name:'Alex Rivera',email:'practice@example.invalid',password,workspace:'Fictional first-task practice'});
const w=session.user.workspace_id;
const fixture=seedWarmFixture(app,w);
// Stage an authorized but unconfirmed later note BEFORE the original plan.
// Its mere presence must not replace the already confirmed responsibility.
const pendingSource=app.domain.createNote(w,{...fixture.new_source,contact_id:fixture.jordan_id});
const originalPlan=app.warm.plan(w,fixture.goal_id);
const port=Number(process.env.DEMO_PORT||4174);
if(!Number.isInteger(port)||port<0||port>65535)throw new Error('DEMO_PORT must be a valid port.');
app.server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://localhost:${app.server.address().port}/#first-task/${fixture.goal_id}`,email:'practice@example.invalid',password,...fixture,new_note_id:pendingSource.id,original_plan_id:originalPlan.id,notice:'Fictional rehearsal. Two dated sources are prepared; responsibility replacement is not confirmed. You must review, recheck, then approve. No external model or platform session. Your ordinary database is untouched.'},null,2)));
let stopping=false;
async function close(){if(stopping)return;stopping=true;await app.close();rmSync(dir,{recursive:true,force:true});process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
