import { ensure, text, oneOf } from './util.js';
export const channels = ['wechat', 'email', 'meeting', 'browser', 'slack', 'discord', 'other'];
/** URLs are labels, never fetched. Strip credentials, tracking parameters and fragments. */
export function cleanSourceURL(value) {
    const raw = text(value, 'Source URL', 2048, false);
    if (!raw) return '';
    let u; try { u = new URL(raw); } catch { ensure(false, 'Use a complete http or https source URL.'); }
    ensure(['https:', 'http:'].includes(u.protocol) && !u.username && !u.password, 'Source URLs must use http or https without credentials.');
    u.search = ''; u.hash = '';
    return u.toString();
}
export function cleanMetadata(input) {
    return { channel: oneOf(input.channel || 'other', channels, 'conversation source'),
        source_url: cleanSourceURL(input.source_url), tags: text(input.tags, 'Topics', 400, false) };
}
const stop = new Set('a an and are as at be been can could did do does for from had has have how i in is it me my of on or our somebody someone that the their them there these they this to was we were what when where which who whom will with would you your about help spoken know find looking need person anyone people have'.split(' '));
/** Deliberately lexical, not a fabricated semantic or confidence model. */
export function queryTerms(query) {
    const q = text(query,'Search',240).toLocaleLowerCase().normalize('NFKC');
    const segmenter = new Intl.Segmenter('en', {granularity:'word'});
    return [...new Set([...segmenter.segment(q)].filter(x=>x.isWordLike).map(x=>x.segment).filter(x=>!stop.has(x) && [...x].length>1))].slice(0,12);
}
export function evidenceExcerpt(body, terms, max=360) {
    const chars = Array.from(body), lower = body.toLocaleLowerCase();
    const hits=terms.map(t=>lower.indexOf(t)).filter(i=>i>=0), first=hits.length ? Math.min(...hits):0;
    // Lowercasing is used to locate a neighborhood only; the returned quote/offset is always raw text.
    const cp=Array.from(body.slice(0,first)).length, start=Math.max(0,cp-65), end=Math.min(chars.length,start+max);
    return {quote:chars.slice(start,end).join(''),start_cp:start,end_cp:end};
}
const escapeIcs = s => String(s).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
/** RFC 5545 content lines are folded on UTF-8 octets, never inside a character. */
export function foldIcs(line) {
    const parts=[]; let current='',count=0;
    for(const char of line) { const n=Buffer.byteLength(char,'utf8'); if(count+n>75){parts.push(current); current=' '; count=1;}current+=char;count+=n; }
    parts.push(current);return parts.join('\r\n');
}
export function taskCalendar(task, generatedAt=new Date()) {
    ensure(task.status==='open','Only an open reminder can be exported.',409,'task_not_open');
    ensure(task.due_on,'Set a due date before exporting this reminder.',409,'date_required');
    const date=task.due_on.replaceAll('-',''), end=new Date(task.due_on+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
    const stamp=generatedAt.toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Threadline//Personal Reminders 1.2//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${task.id}@threadline.local`,`DTSTAMP:${stamp}`,`SEQUENCE:${task.version}`,`DTSTART;VALUE=DATE:${date}`,`DTEND;VALUE=DATE:${end.toISOString().slice(0,10).replaceAll('-','')}`,`SUMMARY:${escapeIcs(task.title)}`,'DESCRIPTION:Reminder exported by you from Threadline. This file is not a live calendar sync.','STATUS:CONFIRMED','TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR'];
    return lines.map(foldIcs).join('\r\n')+'\r\n';
}
