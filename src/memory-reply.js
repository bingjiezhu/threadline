/** Compact read-only presentation of validated memory results for messaging channels. */
const tidy=value=>String(value||'').replace(/\s+/g,' ').trim();
function shorten(value,limit,normalizeWhitespace=true){const text=normalizeWhitespace?tidy(value):String(value||'').trim();if(text.length<=limit)return text;const cut=text.slice(0,limit-1);const end=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('。'),cut.lastIndexOf('; '));return (end>limit*.65?cut.slice(0,end+1):cut)+'…';}
export function formatMemoryReply(run,{maxChars=1600}={}) {
  if(run.state!=='done')return shorten('I could not complete this memory request: '+(run.error||'Please try again.'),maxChars);
  const references=[],seen=new Set();
  for(const citation of run.citations||[]){const key=citation.source_id+':'+citation.quote;if(seen.has(key))continue;seen.add(key);references.push(citation);}
  if(!references.length)return shorten(run.answer||'I could not find that in your saved memory.',maxChars);
  if(run.provider!=='vertex'){
    const shown=references.slice(0,2);
    const entries=shown.map((c,index)=>`[${index+1}] ${shorten(c.title,90)}\n“${shorten(c.quote,480,false)}”`);
    const count=references.length>shown.length?` ${references.length-shown.length} more source(s) are available in the website.`:'';
    return shortenPreservingLines('From your saved memory:\n\n'+entries.join('\n\n')+'\n\nLocal search · original excerpts.'+count+' Open Memory on your computer for the full text.',maxChars);
  }
  const labels=references.slice(0,3).map((c,index)=>`[${index+1}] ${shorten(c.title,75)}`).join('\n');
  const actionText=run.actions?.length?' Task proposals are in the website for you to review; none was created.':'';
  const footer='\n\n'+labels+'\nGemini used selected saved excerpts.'+actionText;
  return shorten(run.answer,Math.max(200,maxChars-footer.length))+footer;
}
function shortenPreservingLines(text,limit){return text.length<=limit?text:text.slice(0,limit-1)+'…';}
