/** Private JSONL adapter to the SAME conversation implementation used by Photon. */
import {readFileSync,lstatSync,statSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {createAssistant} from '../photon/assistant.mjs';

export function assistantEnvironment(path,inherited=process.env){
  if(!path||!isAbsolute(path)||!lstatSync(path).isFile()||(statSync(path).mode&0o077)||(statSync(dirname(path)).mode&0o077))throw Error('A private operator configuration is required.');
  const c=JSON.parse(readFileSync(path,'utf8'));
  if(c.replyLanguage!=='en'||!c.allowedSender||!c.allowedSession)throw Error('An English owner-bound configuration is required.');
  return {config:c,env:{...inherited,THREADLINE_APP_ORIGIN:c.appOrigin,THREADLINE_APP_ACCESS_FILE:c.appAccessFile,
    THREADLINE_ASSISTANT_STATE_FILE:c.assistantStateFile,THREADLINE_VERTEX_CONFIG_FILE:c.vertexConfigFile,
    THREADLINE_REPLY_LANGUAGE:'en',THREADLINE_CHAT_CHANNEL:'asi-one'}};
}

export async function runLineBridge({input=process.stdin,output=process.stdout,configPath=process.env.THREADLINE_ASI_CONFIG,assistantFactory=createAssistant}={}){
  const {config,env}=assistantEnvironment(configPath),expected=`asi:${config.allowedSender}:${config.allowedSession}`;
  const assistant=await assistantFactory({env});const lines=createInterface({input});
  const send=value=>output.write(JSON.stringify(value)+'\n');send({ready:true});
  try{
    for await(const line of lines){
      let request;
      try{
        request=JSON.parse(line);
        if(!request||typeof request.id!=='string'||request.id.length>200||request.session!==expected||typeof request.text!=='string'||request.text.length>4000||typeof request.messageId!=='string'||!request.messageId||request.messageId.length>200||!Number.isFinite(Date.parse(request.createdAt)))throw Error('Invalid authorized message');
        const reply=await assistant.call(request.session,request.text,{messageId:'asi:'+request.messageId,createdAt:request.createdAt});
        send({id:request.id,reply});
      }catch{send({id:typeof request?.id==='string'?request.id.slice(0,200):null,error:'The request could not be completed. Check the private operator configuration or the app.'});}
    }
  }finally{await assistant.close();lines.close();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await runLineBridge();}catch{process.stderr.write('The personal assistant could not start. Check the private operator configuration and local app.\n');process.exitCode=1;}
}
