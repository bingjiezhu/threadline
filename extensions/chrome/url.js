/** Selected text is carried in a URL fragment, not posted or sent to a third-party API. */
export function workspaceOrigin(value) {
    const u = new URL(value || 'http://localhost:4173');
    const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
    if (u.username || u.password || u.search || u.hash || u.pathname !== '/' || !(u.protocol==='https:' || u.protocol==='http:'&&loopback)) throw new Error('Use your workspace origin: HTTPS, or HTTP on localhost. Do not include a path, credentials or query.');
    return u.origin;
}
export function captureURL(origin,selected,source) {
    const target=workspaceOrigin(origin);
    if(typeof selected!=='string'||!selected.trim())throw new Error('Select some text first.');
    if([...selected].length>10000)throw new Error('Select up to 10,000 characters. For longer material, paste directly into Capture.');
    let label='';try {const u=new URL(source);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password){u.search='';u.hash='';label=u.toString();}}catch{}
    const data=new URLSearchParams({text:selected,url:label,title:'Saved browser selection'});
    return target+'/app#capture?'+data.toString();
}
