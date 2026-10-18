/** Disposable fictional workspace server; imports the frozen Final engine unchanged. */
import {makeApp} from '../../server.js';
import{mkdtempSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
const dir=mkdtempSync(join(tmpdir(),'threadline-asi-fictional-'));
const app=makeApp({dbPath:join(dir,'fictional.sqlite')});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
console.log(JSON.stringify({origin:'http://localhost:'+app.server.address().port,pid:process.pid,synthetic_database:true}));
let stopped=false;async function stop(){if(stopped)return;stopped=true;await app.close();rmSync(dir,{recursive:true,force:true});process.exit(0);}process.on('SIGTERM',stop);process.on('SIGINT',stop);
