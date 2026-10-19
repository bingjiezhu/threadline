import test from 'node:test';import assert from 'node:assert/strict';
import {formatMemoryReply} from '../src/memory-reply.js';
test('phone memory replies are bounded and do not repeat answer plus identical source quotations',()=>{
 const sentence='A specific preference from the saved original. ';
 const citations=Array.from({length:4},(_,i)=>({source_id:String(i),title:'Codex · note-'+i+'.md',quote:sentence.repeat(40)}));
 const reply=formatMemoryReply({state:'done',provider:'local',answer:'Large duplicated body. '.repeat(500),citations:[citations[0],citations[0],...citations.slice(1)]});
 assert.ok(reply.length<=1600);assert.doesNotMatch(reply,/Large duplicated body/);assert.equal((reply.match(/Codex · note-0.md/g)||[]).length,1);assert.match(reply,/original excerpts/);assert.match(reply,/Open Memory on your computer/);assert.doesNotMatch(reply,/localhost/);
});
test('no-result and failed local requests remain honest rather than inventing notes',()=>{
 assert.equal(formatMemoryReply({state:'done',answer:'I could not find that topic.',citations:[]}), 'I could not find that topic.');
 assert.match(formatMemoryReply({state:'failed',error:'A source changed.'}), /could not complete.*source changed/i);
});
test('AI phone answer stays bounded while preserving numbered source labels and unexecuted action status',()=>{
 const reply=formatMemoryReply({state:'done',provider:'vertex',answer:'Supported statement [1]. '.repeat(100),citations:[{source_id:'one',title:'Claude · preferences.md',quote:'Original.'}],actions:[{title:'Prepare an agenda'}]});
 assert.ok(reply.length<=1600);assert.match(reply,/\[1\] Claude/);assert.match(reply,/none was created/);assert.match(reply,/Gemini/);
});
