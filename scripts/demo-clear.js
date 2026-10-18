/** Isolated rehearsal using normal application methods. No reset route or staged backend. */
import {makeApp} from '../server.js';
import {seedClarityFixture} from '../src/clarity-fixture.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
const dir=mkdtempSync(join(tmpdir(),'threadline-clear-'));
const app=makeApp({dbPath:join(dir,'practice.sqlite'),demo:true});
const password='Practice-'+randomBytes(12).toString('hex');
const session=await app.auth.register({name:'Alex Rivera',email:'practice@example.invalid',password,workspace:'Fictional first-task practice'});
const info=seedClarityFixture(app,session.user.workspace_id,{createGoal:!process.argv.includes('--setup')});
const port=Number(process.env.DEMO_PORT||4174);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('DEMO_PORT must be a valid port.');
app.server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://localhost:${app.server.address().port}/#first-task${info.goal_id?'/'+info.goal_id:''}`,email:'practice@example.invalid',password,...info,notice:'Fictional practice data. Saved notes only; no live AI or installed messaging app. A later note is present but unconfirmed. You must check the change and approve the tasks.'},null,2)));
let stopping=false;
async function close(){if(stopping)return;stopping=true;await app.close();rmSync(dir,{recursive:true,force:true});process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
