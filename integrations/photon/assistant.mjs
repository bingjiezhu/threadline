/** Thin authenticated channel client: all conversation and memory state lives in Threadline. */
import { randomUUID, createHash } from 'node:crypto';
import { createAppClient } from '../../src/personal-conversation.js';
export { createAppClient, parseLocalIntent, parseDay, localDay } from '../../src/personal-conversation.js';
export async function createAssistant({env=process.env,client}={}) {
  const app = client || await createAppClient({origin:env.THREADLINE_APP_ORIGIN||'http://localhost:4173',accessFile:env.THREADLINE_APP_ACCESS_FILE||''});
  return {
    async call(session,message,meta={}) {
      const message_id=meta.messageId||randomUUID();
      const input={session,message,message_id,created_at:meta.createdAt||new Date().toISOString(),channel:env.THREADLINE_CHAT_CHANNEL||'imessage'};
      const key='conversation-'+createHash('sha256').update(input.channel+':'+session+':'+message_id).digest('hex');
      const response=await app.request('/api/memory/conversations/message','POST',input,key);
      return response.reply;
    },
    async close(){await app.close?.();}
  };
}
