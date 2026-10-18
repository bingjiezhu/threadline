/** Load the root's private handoff without printing credentials or using shell eval. */
import{readFileSync,statSync}from'node:fs';import{config,run}from'./bridge.mjs';
const path=process.argv[2];
if(!path)throw Error('Provide the root-owned private JSON path.');
if((statSync(path).mode&0o077)!==0)throw Error('Private handoff must have mode 600.');
const values=JSON.parse(readFileSync(path,'utf8'));
const allowed=['apiKey','projectId','testSender','agentHandle','maxSeconds','minCreatedAt'];
if(Object.keys(values).some(k=>!allowed.includes(k)))throw Error('Unexpected private handoff field.');
const env={...process.env,PHOTON_API_KEY:values.apiKey,PHOTON_PROJECT_ID:values.projectId,PHOTON_TEST_SENDER:values.testSender,PHOTON_AGENT_HANDLE:values.agentHandle,PHOTON_MAX_SECONDS:String(values.maxSeconds||420),PHOTON_MIN_CREATED_AT:values.minCreatedAt||''};
try{await run(config(env));}catch(error){console.error(JSON.stringify({state:'failed',message:error.message}));process.exitCode=1;}
