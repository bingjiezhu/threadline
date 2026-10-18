import { mountMemoryImportUI } from './memory-import-ui.js';
import { mountMemoryUI } from './memory-ui.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const state = { data: null, auth: null, view: 'memory', filter: 'all', search: '', renderId: 0 };
const paths = { memory: ['Memory', 'book'], agent: ['Personal agent', 'spark'], overview: ['Overview', 'grid'], contacts: ['Contacts', 'users'], projects: ['Projects', 'folder'], notes: ['Notes & evidence', 'file'], reviews: ['Follow-ups', 'spark'], tasks: ['Tasks', 'check'], capture: ['Capture', 'plus'], discover: ['Find people', 'search'], week: ['This week', 'clock'], activity: ['Activity', 'clock'], settings: ['Settings', 'settings'], guide: ['Getting started', 'book'], connect: ['Chat & capture', 'link'], 'first-task':['Optional first task','arrow'], warmstart:['All first-week goals','spark'], workmap:['Knowledge map','book'] };
const svg = { calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z"/>', users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M19 21v-3a6 6 0 0 0-2-4"/>', file: '<path d="M14 3H5v18h14V8Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>', spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>', check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>', book: '<path d="M12 5v16M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>', back: '<path d="M20 12H5m6-6-6 6 6 6"/>', refresh: '<path d="M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 3M4 16l2 3a8 8 0 0 0 13-2"/>', shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>', exit: '<path d="M9 4H4v16h5M9 12h12m-5-5 5 5-5 5"/>', edit: '<path d="m15 4 5 5M4 20l4-1L21 6l-4-4L4 15Z"/>', trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>', link: '<path d="m10 7 3-3a5 5 0 0 1 7 7l-3 3M14 17l-3 3a5 5 0 0 1-7-7l3-3m1 8 8-8"/>', chevron: '<path d="m9 5 7 7-7 7"/>', money: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>' };
const icon = (name = 'file') => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg[name] || svg.file}</svg>`;
const esc = (v = '') => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = v => String(v || 'unknown').replaceAll('_', ' ').replaceAll('-', ' ').replace(/^./, c => c.toUpperCase());
const badge = (v, name) => `<span class="badge ${esc(v)}">${esc(name || label(v))}</span>`;
const initials = s => String(s || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const avatar = (s, extra = '') => `<span class="avatar ${extra}">${esc(initials(s))}</span>`;
const btn = (action, title, ic = '', cls = '', id = '') => `<button type="button" class="btn ${cls}" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''}>${ic ? icon(ic) : ''}${esc(title)}</button>`;
const fmtDate = (v, short = false) => !v ? 'Not dated' : new Intl.DateTimeFormat('en-US', { year: short ? undefined : 'numeric', month: 'short', day: 'numeric', ...(v.length > 10 ? { timeZone: state.data?.workspace.timezone || 'UTC' } : { timeZone: 'UTC' }) }).format(new Date(v.length === 10 ? v + 'T12:00:00Z' : v));
const when = v => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: state.data?.workspace.timezone || 'UTC' }).format(new Date(v));
const localDay = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: state.data?.workspace.timezone || 'UTC' }).format(new Date());
const money = p => new Intl.NumberFormat('en-US', { style: 'currency', currency: p.currency, maximumFractionDigits: 0 }).format(p.value / 100);
const contact = id => state.data?.contacts.find(x => x.id === id);
const project = id => state.data?.projects.find(x => x.id === id);
const note = id => state.data?.notes.find(x => x.id === id);
const record = (table, id) => state.data?.[table]?.find(x => x.id === id);
const empty = (title, desc, action = '', buttonTitle = '', ic = 'file') => `<div class="empty"><div class="empty-icon">${icon(ic)}</div><h3>${esc(title)}</h3><p>${esc(desc)}</p>${action ? btn(action, buttonTitle, 'plus', 'primary') : ''}</div>`;
const field = (name, title, type = 'text', value = '', help = '', attrs = '') => `<div class="field"><label for="f-${name}">${esc(title)}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${attrs}>${help ? `<small>${esc(help)}</small>` : ''}</div>`;
const area = (name, title, value = '', help = '', cls = '') => `<div class="field full"><label for="f-${name}">${esc(title)}</label><textarea id="f-${name}" name="${name}" class="${cls}">${esc(value)}</textarea>${help ? `<small>${esc(help)}</small>` : ''}</div>`;
const select = (name, title, items, value = '', help = '') => `<div class="field"><label for="f-${name}">${esc(title)}</label><select id="f-${name}" name="${name}">${items.map(x => { const [v, l] = Array.isArray(x) ? x : [x, label(x)]; return `<option value="${esc(v)}" ${String(value ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>${help ? `<small>${esc(help)}</small>` : ''}</div>`;
const contactOptions = () => [['', 'No primary contact'], ...state.data.contacts.filter(x => !x.archived).map(x => [x.id, x.name + ' · ' + (x.company || 'Independent')])];
const projectOptions = () => [['', 'Workspace-wide'], ...state.data.projects.filter(x => x.status !== 'archived').map(x => [x.id, x.name])];
function toast(message, error = false) { const el = document.createElement('div'); el.className = 'toast' + (error ? ' error' : ''); el.textContent = message; $('#toast-root').append(el); while ($('#toast-root').children.length > 1)
    $('#toast-root').firstElementChild.remove(); setTimeout(() => el.remove(), 4500); }
async function api(path, method = 'GET', data, requestKey) { const init = { method, credentials: 'same-origin', headers: {} }; if (method !== 'GET') {
    init.headers = { 'content-type': 'application/json', 'x-csrf-token': state.auth?.csrf || '', 'idempotency-key': requestKey || crypto.randomUUID() };
    init.body = JSON.stringify(data ?? {});
} let res; try {
    res = await fetch(path, init);
}
catch {
    throw new Error('Cannot reach the server. Keep this page open and check that Threadline is running. Your saved records are not replaced.');
} const out = await res.json().catch(() => ({})); if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth')) {
        state.auth = null; state.data = null; state.renderId++; focus.clear(); warm.clear();
        if ($('#modal').open) $('#modal').close(); $('#modal').innerHTML='';
        showAuth(false);
    }
    throw new Error(out.error?.message || `Request failed (${res.status}).`);
} return out; }
function go(path) { location.hash = '#' + path; }
function openModal(title, content, large = false) { const modal = $('#modal'); if (modal.open)
    modal.close(); modal.className = large ? 'large' : ''; modal.innerHTML = `<header class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="btn ghost icon-only" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></header><div class="modal-body">${content}</div>`; modal.showModal(); }
function closeModal() { $('#modal').close(); }
function formModal(title, fields, save, onSubmit, { large = false, foot = '', submitClass = 'primary' } = {}) { openModal(title, `<form id="edit-form"><div id="form-error" class="field-error" role="alert"></div>${fields}<div class="modal-footer">${foot}${btn('close-modal', 'Cancel', '', 'ghost')}<button class="btn ${submitClass}" type="submit">${esc(save)}</button></div></form>`, large); $('#edit-form').addEventListener('submit', async (e) => { e.preventDefault(); const form = e.currentTarget, button = form.querySelector('[type=submit]'); button.disabled = true; $('#form-error').textContent = ''; try {
    await onSubmit(Object.fromEntries(new FormData(form)), form);
    closeModal();
}
catch (err) {
    if ($('#form-error')) $('#form-error').textContent = err.message;
}
finally {
    button.disabled = false;
} }); }
async function confirmDelete(title, description, work) { formModal(title, `<div class="notice red">${esc(description)}</div>`, 'Delete permanently', async () => { await work(); await reload(); toast('The record was deleted.'); }, { submitClass: 'danger' }); }
async function reload() { state.data = await api('/api/state'); await render(); }
function shell() {
    const route = location.hash.slice(1).split('/')[0] || 'memory';
    const navKey = route === 'project' ? 'projects' : route === 'note' ? 'notes' : route === 'search' ? 'overview' : route === 'warm-goal' ? 'warmstart' : route === 'person' ? 'contacts' : route === 'saved' ? 'capture' : route;
    const openTasks = state.data.tasks.filter(x => x.status === 'open').length, pending = state.data.reviews.filter(x => x.state === 'suggested').length;
    $('#app').innerHTML = `<div class="shell"><div class="mobile-nav-shade" data-action="menu"></div><aside class="sidebar" id="workspace-navigation"><button class="sidebar-close btn icon-only" aria-label="Close navigation" data-action="menu">${icon('close')}</button><a class="brand" href="#memory"><img src="/logo.svg" alt="">Threadline</a><div class="nav-label">YOUR WORKSPACE</div><nav class="nav" aria-label="Main navigation">${Object.entries(paths).map(([key, [name, ic]]) => `${key === 'activity' ? '<div class="nav-label">WORKSPACE TOOLS</div>' : key === 'first-task' ? '<div class="nav-label">OPTIONAL ONBOARDING TOOLS</div>' : ''}<button class="${navKey === key ? 'active' : ''}" data-nav="${key}">${icon(ic)}${name}${key === 'reviews' && pending ? `<span class="count">${pending}</span>` : key === 'tasks' && openTasks ? `<span class="count">${openTasks}</span>` : ''}</button>`).join('')}</nav><div class="side-bottom"><div class="privacy-label"><strong>${icon('shield')} Private by default</strong>Your records stay on this server. AI calls are optional.</div><div class="user-chip">${avatar(state.data.user.name)}<div class="grow"><div class="name">${esc(state.data.user.name)}</div><small>Workspace owner</small></div><button class="logout" data-action="logout" aria-label="Sign out">${icon('exit')}</button></div></div></aside><div class="workspace"><header class="topbar"><button class="btn ghost menu-button icon-only" aria-label="Toggle navigation" aria-controls="workspace-navigation" aria-expanded="false" data-action="menu">${icon('menu')}</button><a class="firstwin-brand" href="#first-task"><img src="/logo.svg" alt="">Threadline<span>Warm Start</span></a><div class="breadcrumb">Workspace <span class="muted"> / </span> <strong>${paths[navKey]?.[0] || 'Search'}</strong></div><form id="global-search" class="top-search">${icon('search')}<input name="q" placeholder="Search your memory…" aria-label="Search your memory" autocomplete="off"><kbd>⌘ K</kbd></form><a class="btn ghost firstwin-exit" href="#warmstart">All goals</a><span class="connection"><span class="dot"></span>Saved on your server</span>${btn('new-note', 'Add note', 'file', 'ghost legacy-note')}${btn('quick-capture', 'Capture', 'plus', 'primary')}</header><main id="main" class="content" tabindex="-1"></main></div></div>`;
    setMenu(false, false);
    $('#global-search').addEventListener('submit', e => { e.preventDefault(); const q = new FormData(e.currentTarget).get('q').trim(); if (q)
        go('search/' + encodeURIComponent(q)); });
}
function setMenu(open, moveFocus = true) {
    const shell=$('.shell'),side=$('.sidebar'),body=$('.workspace'),mobile=window.matchMedia('(max-width:850px)').matches;
    if(!shell||!side||!body)return;const active=Boolean(open&&mobile);shell.classList.toggle('nav-open',active);side.inert=mobile&&!active;body.inert=active;$('.menu-button')?.setAttribute('aria-expanded',String(active));
    if(moveFocus)(active?$('.sidebar-close'):$('.menu-button'))?.focus();
}
function pageHead(title, description, actions = '') { return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="head-actions">${actions}</div></div>`; }
function previewReview(r) { const p = project(r.project_id), c = contact(r.contact_id); return `<div class="review-preview"><div class="flex space-between">${badge(r.state)}<span class="small muted">${esc(p?.company || 'Project update')}</span></div><h3>${esc(p?.name || 'Project')}</h3><p>${esc(r.reason)}</p><div class="mini-path"><span>Earlier requirement</span>${icon('arrow')}<span>New capability</span></div><div class="flex space-between"><span class="flex small">${avatar(c?.name || '?')}${esc(c?.name || 'Assign a contact')}</span>${btn('open-review', 'Review', 'arrow', 'sm', r.id)}</div></div>`; }
function taskRow(t) { return `<div class="list-row"><button class="task-toggle ${t.status === 'done' ? 'done' : ''}" data-action="toggle-task" data-id="${t.id}" aria-label="${t.status === 'done' ? 'Reopen' : 'Complete'} ${esc(t.title)}">${t.status === 'done' ? '✓' : ''}</button><div class="grow"><h3><button class="text-button ${t.status === 'done' ? 'done-text' : ''}" data-action="edit-task" data-id="${t.id}">${esc(t.title)}</button></h3><p>${esc(project(t.project_id)?.name || contact(t.contact_id)?.name || 'Personal follow-up')}</p></div><span class="${t.due_on && t.due_on < localDay() && t.status === 'open' ? 'overdue' : 'small muted'}">${t.due_on ? esc(fmtDate(t.due_on, true)) : 'No due date'}</span>${t.status === 'open' && t.due_on ? `<button class="btn sm ghost" data-action="calendar-task" data-id="${t.id}" aria-label="Export calendar reminder for ${esc(t.title)}">${icon('calendar')} Calendar</button>` : ''}</div>`; }
function overview() {
    const d = state.data, open = d.projects.filter(p => ['active', 'waiting'].includes(p.status)), tasks = d.tasks.filter(t => t.status === 'open').sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999')), reviews = d.reviews.filter(r => r.state === 'suggested'), approved = d.claims.filter(c => c.status === 'approved'), waiting = d.claims.filter(c => c.status === 'proposed');
    return pageHead(`Your next right move.`, `${d.workspace.name} · Relationships, context, and follow-through in one place.`, btn('refresh-reviews', 'Refresh opportunities', 'refresh')) + `<section class="hero"><div><div class="overline">RELATIONSHIP MEMORY, WITH A PURPOSE</div><h2>Keep the context.<br>Find the right moment.</h2><p>Connect what a client needed then with what you can do now. Stay thoughtful about what you still don’t know.</p><div class="head-actions">${btn('new-note', 'Capture a conversation', 'plus', 'light')}<a href="#guide" class="btn light">How it works ${icon('arrow')}</a></div></div><div class="hero-lines" aria-hidden="true"><div class="hero-node"><span>A conversation worth remembering</span><span>Capture</span></div><div class="hero-node"><span>Evidence you have reviewed</span><span>Understand</span></div><div class="hero-node"><span>A reason to reconnect</span><span>Follow through</span></div></div></section><div class="metrics">${[[open.length, 'Active & waiting projects', 'folder'], [d.contacts.filter(c => !c.archived).length, 'People in your network', 'users'], [approved.length, 'Approved evidence items', 'shield'], [tasks.length, 'Open commitments', 'check']].map(([v, l, ic]) => `<div class="metric">${icon(ic)}<div class="value">${v}</div><div class="label">${l}</div></div>`).join('')}</div>${!d.notes.length ? `<div class="steps">${[['1', 'Add a person', 'Someone you work with.', 'new-contact'], ['2', 'Create a project', 'The outcome you want.', 'new-project'], ['3', 'Save a conversation', 'Use notes you already have.', 'new-note'], ['4', 'Review the evidence', 'Approve what the note supports.', 'help']].map(([n, t, p, a]) => `<div class="step"><div class="step-num">${n}</div><h3>${t}</h3><p>${p}</p>${btn(a, 'Get started', 'arrow', 'sm ghost')}</div>`).join('')}</div>` : ''}<div class="grid-2"><section class="card"><div class="card-head"><h2>Worth a second look</h2><a href="#reviews" class="small">All follow-ups ${icon('arrow')}</a></div>${reviews.length ? reviews.slice(0, 3).map(previewReview).join('') : empty('No new matches yet', 'Approve a project requirement and a later confirmed capability with the same topic. Threadline will connect them.', '', '', 'spark')}</section><div class="stack"><section class="card"><div class="card-head"><h2>Keep your promises</h2>${btn('new-task', 'Add task', 'plus', 'sm ghost')}</div>${tasks.length ? tasks.slice(0, 5).map(taskRow).join('') : empty('A clear runway', 'Add the commitments you want to keep.', 'new-task', 'Create a task', 'check')}</section><section class="card flat"><div class="card-head"><h2>Evidence inbox</h2>${badge(waiting.length ? 'proposed' : 'approved', waiting.length + ' to review')}</div><p class="muted small">Candidates stay separate from approved facts. You decide what belongs in your working memory.</p>${waiting.slice(0, 3).map(c => `<div class="list-row"><div class="activity-dot">${icon('file')}</div><div class="grow"><h3><a href="#note/${c.note_id}">${esc(note(c.note_id)?.title || 'Note')}</a></h3><p>${esc(c.topic.replaceAll('-', ' '))}</p></div>${btn('review-claim', 'Review', '', 'sm', c.id)}</div>`).join('')}${!waiting.length ? '<span class="small muted">You’re all caught up.</span>' : ''}</section></div></div>`;
}
function filters(items) { return `<div class="toolbar"><div class="filters" role="group" aria-label="Filter records">${items.map(([v, l]) => `<button type="button" data-filter="${v}" class="${state.filter === v ? 'active' : ''}">${l}</button>`).join('')}</div><input id="list-search" class="filter-input" type="search" placeholder="Filter this list…" aria-label="Filter this list" value="${esc(state.search)}"></div>`; }
function contactsPage() { let cs = state.data.contacts.filter(c => state.filter === 'archived' ? c.archived : state.filter === 'blocked' ? c.contact_policy === 'blocked' && !c.archived : !c.archived).filter(c => (c.name + ' ' + c.company + ' ' + c.email + ' ' + c.tags).toLowerCase().includes(state.search.toLowerCase())); return pageHead('A network you can remember.', 'Keep people, conversations, and shared work connected.', btn('import-contacts', 'Import CSV', 'upload') + btn('new-contact', 'New contact', 'plus', 'primary')) + filters([['all', 'Active contacts'], ['blocked', 'Do not contact'], ['archived', 'Archived']]) + (cs.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Person</th><th>Company & role</th><th>Email</th><th>Tags</th><th>Contact policy</th><th></th></tr></thead><tbody>${cs.map(c => `<tr><td><div class="person-cell">${avatar(c.name)}<div><button class="text-button" data-action="open-contact" data-id="${c.id}">${esc(c.name)}</button><small>${state.data.projects.filter(p => p.contact_id === c.id).length} linked projects</small></div></div></td><td><strong>${esc(c.company || '—')}</strong><br><span class="muted small">${esc(c.role || 'Not specified')}</span></td><td>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '<span class="muted">No email</span>'}</td><td><div class="badges">${c.tags.split(',').filter(Boolean).slice(0, 2).map(t => badge('local', t.trim())).join('')}</div></td><td>${badge(c.contact_policy, c.contact_policy === 'allowed' ? 'Contact allowed' : 'Do not contact')}</td><td>${btn('edit-contact', 'Edit', 'edit', 'sm ghost', c.id)}</td></tr>`).join('')}</tbody></table></div><p class="small muted mt">${cs.length} ${cs.length === 1 ? 'contact' : 'contacts'} · Each account has its own private workspace.</p>` : empty('No contacts in this view', 'Add your first contact or import your existing contact list.', 'new-contact', 'Add a contact', 'users')); }
function projectsPage() { let ps = state.data.projects.filter(p => state.filter === 'all' ? p.status !== 'archived' : p.status === state.filter).filter(p => (p.name + ' ' + p.company + ' ' + p.goal).toLowerCase().includes(state.search.toLowerCase())); return pageHead('Projects, with the whole story.', 'Remember the goal, the blockers, and the people who move things forward.', btn('new-project', 'New project', 'plus', 'primary')) + filters([['all', 'All projects'], ['active', 'Active'], ['waiting', 'Waiting'], ['won', 'Won'], ['archived', 'Archived']]) + (ps.length ? `<div class="grid-3">${ps.map((p, i) => `<article class="card project-card"><div class="flex space-between">${avatar(p.company || p.name, i % 2 ? 'alt' : 'blue')}${badge(p.status)}</div><h2><a href="#project/${p.id}">${esc(p.name)}</a></h2><p>${esc(p.goal || 'Add a goal to guide your next conversation.')}</p><div class="project-bottom"><span class="small muted">${esc(p.company || 'Independent project')}</span><span class="amount">${p.value ? esc(money(p)) : 'Value not set'}</span></div><div class="project-meta"><span>${esc(contact(p.contact_id)?.name || 'No primary contact')}</span><span>${state.data.notes.filter(n => n.project_id === p.id).length} notes</span></div></article>`).join('')}</div>` : empty('Make your first project', 'Give an important conversation an outcome to work toward.', 'new-project', 'Create a project', 'folder')); }
function notesPage() { let ns = state.data.notes.filter(n => state.filter === 'all' || n.kind === state.filter).filter(n => (n.title + ' ' + n.excerpt + ' ' + (project(n.project_id)?.name || '')).toLowerCase().includes(state.search.toLowerCase())); return pageHead('Conversations become context.', 'Save original notes. Annotate what matters. Keep every claim attached to its source.', btn('new-note', 'Add note', 'plus', 'primary')) + filters([['all', 'All notes'], ['meeting', 'Meetings'], ['delivery', 'Delivery'], ['email', 'Email'], ['conversation', 'Conversations']]) + (ns.length ? `<div class="grid-3">${ns.map(n => `<article class="card note-card"><div class="flex space-between">${badge(n.kind)}<span class="small muted">${esc(fmtDate(n.occurred_on, true))}</span></div><h3><a href="#note/${n.id}">${esc(n.title)}</a></h3><p class="excerpt">${esc(n.excerpt)}</p><div class="badges">${n.project_id ? badge('local', project(n.project_id)?.name || 'Project') : badge('local', 'Workspace-wide')}</div><footer><span>${state.data.claims.filter(c => c.note_id === n.id).length} evidence items</span><span>${n.characters.toLocaleString()} characters</span></footer></article>`).join('')}</div>` : empty('Start with a real conversation', 'Paste a meeting note, a client email, or a delivery update.', 'new-note', 'Capture a note', 'file')); }
function claimCard(c, showSource = false) { return `<article class="evidence"><div class="evidence-head"><div class="badges">${badge(c.kind)}${badge(c.status)}</div>${badge(c.certainty)}</div><div class="topic">${esc(c.topic.replaceAll('-', ' '))}</div><blockquote>${esc(c.quote)}</blockquote>${showSource ? `<a class="source-link" href="#note/${c.note_id}">${icon('link')} ${esc(note(c.note_id)?.title || 'Open original note')}</a>` : ''}<div class="row-actions"><span class="muted small grow">${['openai', 'vertex'].includes(c.origin) ? 'AI candidate' : c.origin === 'local-scan' ? 'Text-scan candidate' : 'User annotation'}</span>${btn('review-claim', c.status === 'approved' ? 'Revise' : 'Review', '', 'sm', c.id)}</div></article>`; }
async function notePage(id) { const n = await api('/api/notes/' + id); return `<a class="back" href="#notes">${icon('back')} All notes</a>` + pageHead(n.title, `${label(n.kind)} · Event: ${fmtDate(n.occurred_on)} · Saved: ${fmtDate(n.created_at)}`, btn('edit-note', 'Edit note', 'edit', '', id) + btn('delete-note', 'Delete', 'trash', 'ghost', id)) + `<div class="detail-grid"><section><div class="card section"><div class="card-head"><h2>Original conversation</h2>${badge('local', n.characters || [...n.body].length + ' characters')}</div><div class="badges mb">${n.project_id ? badge('purple', project(n.project_id)?.name) : badge('local', 'Workspace-wide')}${n.contact_id ? badge('local', contact(n.contact_id)?.name) : ''}</div><div class="note-body" id="note-body">${esc(n.body)}</div><p class="small muted mt no-margin">Select a passage, then add evidence. Quotations are checked against the original text.</p></div><div class="notice green">Your original note is the source of truth. Editing it withdraws its existing evidence and invalidates dependent follow-ups.</div></section><section><div class="card-head"><h2>Evidence, not guesses</h2>${btn('annotate', 'Add evidence', 'plus', 'primary sm', id)}</div><div class="head-actions mb">${btn('scan-note', 'Find candidate sentences', 'spark', 'sm', id)}<button class="btn sm" data-action="ai-extract" data-id="${id}" ${state.data.ai.configured ? '' : 'disabled'} title="${state.data.ai.configured ? 'Send this note to the configured AI provider with your consent' : 'Set OPENAI_API_KEY on the server to enable AI extraction'}">${icon('spark')} Extract with AI</button></div><p class="small muted">Candidates never become approved facts automatically. Confirm the type, topic, and certainty.</p>${n.claims.length ? n.claims.map(c => claimCard(c)).join('') : empty('Mark what matters', 'A requirement, capability, blocker, or promise becomes useful when you connect it to an exact quotation.', '', '', 'shield')}</section></div>`; }
async function projectPage(id) { const p = await api('/api/projects/' + id), c = contact(p.contact_id), ns = state.data.notes.filter(n => n.project_id === id), claims = state.data.claims.filter(c => c.project_id === id && c.status === 'approved'), reviews = state.data.reviews.filter(r => r.project_id === id && r.state === 'suggested'); return `<a class="back" href="#projects">${icon('back')} All projects</a>` + pageHead(p.name, p.company || 'Project workspace', btn('new-note-for-project', 'Add note', 'plus', 'primary', id) + btn('edit-project', 'Edit project', 'edit', '', id)) + `<div class="detail-grid"><div><section class="card section"><div class="card-head"><h2>Current working context</h2>${badge(p.status)}</div><p>${esc(p.goal || 'No goal added yet.')}</p><dl class="meta-grid"><div><dt>Primary contact</dt><dd>${c ? `<button class="text-button" data-action="open-contact" data-id="${c.id}">${esc(c.name)}</button>` : 'Not assigned'}</dd></div><div><dt>Estimated value</dt><dd>${p.value ? esc(money(p)) : 'Not set'}</dd></div><div><dt>Next review</dt><dd>${p.next_review ? fmtDate(p.next_review) : 'Not scheduled'}</dd></div><div><dt>Version</dt><dd>v${p.version} · User-controlled</dd></div></dl>${p.unknowns ? `<div class="section-title">Still to verify</div><div class="unknowns">${esc(p.unknowns)}</div>` : '<p class="small muted mt">No unknowns recorded. This does not mean all conditions are satisfied.</p>'}${p.summary ? `<div class="section-title">Accepted evidence review</div><div class="notice green">${esc(p.summary)}</div>` : ''}</section><section class="card"><div class="card-head"><h2>Conversation timeline</h2><span class="muted small">${ns.length} notes</span></div>${ns.length ? ns.map(n => `<div class="list-row"><div class="activity-dot">${icon('file')}</div><div class="grow"><h3><a href="#note/${n.id}">${esc(n.title)}</a></h3><p>${label(n.kind)} · ${fmtDate(n.occurred_on)}</p></div><a href="#note/${n.id}" aria-label="Open ${esc(n.title)}">${icon('chevron')}</a></div>`).join('') : empty('The story starts here', 'Capture what was discussed and why this project matters.', '', '', 'file')}</section><section class="card mt"><h2>Version history</h2><div class="history">${p.history.slice(0, 8).map(v => `<div class="history-item"><small>${fmtDate(v.created_at)} · Version ${v.version}</small>${Object.keys(v.snapshot).length ? `<strong>${esc(label(v.snapshot.status))}</strong><p class="small muted no-margin">${esc(v.snapshot.summary || v.snapshot.goal || 'Project created.')}</p>` : '<span class="muted">Content removed because its evidence was withdrawn.</span>'}</div>`).join('')}</div></section></div><div>${reviews.map(previewReview).join('')}<div class="card-head"><h2>Approved evidence</h2><span class="small muted">${claims.length} items</span></div>${claims.length ? claims.map(c => claimCard(c, true)).join('') : empty('No approved evidence yet', 'Open a note, add an exact quotation, and review its meaning.', '', '', 'shield')}<section class="card mt"><div class="card-head"><h2>Related tasks</h2>${btn('new-task-for-project', 'Add', 'plus', 'sm ghost', id)}</div>${state.data.tasks.filter(t => t.project_id === id).map(taskRow).join('') || '<p class="small muted no-margin">No tasks for this project.</p>'}</section></div></div>`; }
function reviewsPage() { const active = ['suggested', 'accepted', 'snoozed']; let rs = state.data.reviews.filter(r => state.filter === 'all' ? active.includes(r.state) : state.filter === 'history' ? ['closed', 'dismissed', 'stale'].includes(r.state) : state.filter === 'contacted' ? ['contacted', 'replied', 'meeting'].includes(r.state) : r.state === state.filter).filter(r => (r.title + ' ' + r.reason + ' ' + (project(r.project_id)?.name || '') + ' ' + (contact(r.contact_id)?.name || '')).toLowerCase().includes(state.search.toLowerCase())); return pageHead('Follow up for a reason.', 'Match approved requirements with later confirmed capabilities. Verify before you act.', btn('refresh-reviews', 'Refresh opportunities', 'refresh', 'primary')) + filters([['all', 'To consider'], ['suggested', 'New matches'], ['contacted', 'In conversation'], ['snoozed', 'Later'], ['history', 'History']]) + `<div class="notice">Matching uses the topics and certainty you approve. It does not infer trust, available budget, or a buyer’s current intent.</div>` + (rs.length ? `<div class="grid-3">${rs.map(previewReview).join('')}</div>` : empty('Nothing to push. Something to learn.', 'A match needs a project requirement and a later capability on the same topic. Both must be confirmed and approved.', '', '', 'spark')); }
function tasksPage() { let ts = state.data.tasks.filter(t => state.filter === 'all' ? t.status === 'open' : state.filter === 'overdue' ? t.status === 'open' && t.due_on && t.due_on < localDay() : t.status === state.filter).filter(t => (t.title + ' ' + t.notes).toLowerCase().includes(state.search.toLowerCase())).sort((a, b) => (a.due_on || '9999').localeCompare(b.due_on || '9999')); return pageHead('Promises, kept.', 'Manage real commitments without confusing reminders with completed work.', btn('new-task', 'New task', 'plus', 'primary')) + filters([['all', 'Open tasks'], ['overdue', 'Overdue'], ['done', 'Completed'], ['cancelled', 'Cancelled']]) + (ts.length ? `<section class="card">${ts.map(taskRow).join('')}</section>` : empty('A clear list', 'Add a commitment, a due date, and the person or project it belongs to.', 'new-task', 'Add task', 'check')); }
function activityPage() { return pageHead('A clear record of your work.', 'Changes and real-world outcomes are recorded separately. No automatic messages are sent.') + `<section class="card">${state.data.events.length ? state.data.events.map(e => `<div class="list-row"><div class="activity-dot">${icon(e.subject_type === 'task' ? 'check' : e.subject_type === 'note' ? 'file' : e.subject_type === 'contact' ? 'users' : 'clock')}</div><div class="grow activity-text"><strong>${esc(label(e.type.replaceAll('.', ' ')))}</strong><small>${esc(label(e.subject_type))}${e.data.evidence_level ? ' · Recorded by you' : ''}${e.data.outcome ? ' · ' + esc(label(e.data.outcome)) : ''}</small></div><span class="small muted">${esc(when(e.occurred_at))}</span>${['contacted', 'replied', 'meeting', 'outcome'].includes(e.type) ? (state.data.events.some(x => x.type === 'event.corrected' && x.data.target_id === e.id) ? badge('local', 'Corrected') : btn('correct-event', 'Correct', '', 'sm ghost', e.id)) : ''}</div>`).join('') : empty('Your history will appear here', 'Creating a contact, saving a note, and recording an actual reply all leave a clear trail.', '', '', 'clock')}</section><p class="small muted mt">Showing up to 150 recent events. The complete archive is included in workspace export.</p>`; }
function settingsPage() { const d = state.data; return pageHead('Your workspace. Your control.', 'Manage your account, data, and optional AI connection.') + `<div class="settings-grid"><div><section class="card settings-section"><h2>Workspace</h2><form id="settings-form"><div class="field-error" id="settings-error" role="alert"></div>${field('name', 'Workspace name', 'text', d.workspace.name, '', 'required maxlength="100"')}${field('timezone', 'Timezone', 'text', d.workspace.timezone, 'Use an IANA timezone such as America/Los_Angeles or Europe/London.', 'required')}<button type="submit" class="btn primary">Save workspace</button></form></section><section class="card settings-section"><div class="card-head"><h2>Data portability</h2>${icon('shield')}</div><p class="small muted">Export your contacts, projects, notes, evidence, tasks, and history. Restore core working records into an empty workspace. Your export also retains historical events and drafts as an archive.</p><div class="head-actions">${btn('export', 'Export workspace', 'download')}${btn('restore', 'Restore from export', 'upload')}</div><div class="notice amber mt no-margin">Exports contain private conversations in plain text. Store them securely. Downloaded copies and operator backups must be removed separately.</div></section><section class="card settings-section"><h2>Account security</h2><p class="small muted">Signed in as <strong>${esc(d.user.email)}</strong>. This is a self-hosted account; the email address is not externally verified.</p>${btn('change-password', 'Change password', 'shield')}<p class="small muted mt no-margin">Forgotten password? The server operator can run <code>npm run recover</code> locally. There is no public password-reset endpoint.</p></section><section class="card"><h2>Delete account & workspace</h2><p class="small muted">Permanently remove this account and its working records from the active database. Existing exports and operator backups are not deleted automatically.</p>${btn('delete-account', 'Delete account', 'trash', 'danger')}</section></div><div><section class="card settings-section"><div class="card-head"><h2>AI connection</h2>${badge(d.ai.configured ? 'approved' : 'local', d.ai.configured ? 'Configured' : 'Not connected')}</div><p class="small muted">The application works without an AI subscription. Manual annotations, exact-topic matching, search, templates, and task management run on this server.</p>${d.ai.configured ? `<dl class="meta-grid"><div><dt>Provider</dt><dd>${esc(d.ai.providerLabel || 'OpenAI Responses')}</dd></div><div><dt>Model</dt><dd class="break">${esc(d.ai.model)}</dd></div></dl>` : '<pre>OPENAI_API_KEY=your-key\nOPENAI_MODEL=gpt-4.1-mini</pre><p class="small muted">Set these in the server’s <code>.env</code> file, then restart. Keys never go to the browser.</p>'}<div class="section-title">Daily request allowance</div><p><strong>${d.ai.requestsToday}</strong><span class="muted"> / ${d.ai.dailyLimit} requests used</span></p><p class="small muted no-margin">Each AI call needs your consent. Limits include failed attempts. Provider charges are separate. This app does not claim zero provider retention.</p></section><section class="card settings-section"><h2>This release</h2><p><strong>Threadline 1.4.0</strong><br><span class="muted small">Self-hosted · Private account workspaces</span></p><p class="small muted">No automatic outreach, no shared team inbox, and no background access to your social accounts.</p><a class="btn wide" href="/guide" target="_blank" rel="noopener">Read the user guide ${icon('arrow')}</a></section><section class="card"><h2>About pricing</h2><p class="small muted">This package has no subscription enforcement or payment collection. A guided hosted pilot at $49 per owner per month is a commercial hypothesis, not an active billing plan.</p><a class="small" href="/welcome" target="_blank" rel="noopener">Product & pilot information ${icon('arrow')}</a></section></div></div>`; }
function guidePage() { return pageHead('One conversation. A useful next step.', 'Start with something you already know. No project or AI key required.') + `<div class="guide-layout"><section class="card"><div class="overline muted">YOUR FIRST THREE MINUTES</div>${[['1','Save one conversation','Open Capture. Paste the words you want to keep, link an existing person or add a new one, and confirm when the conversation happened. Only link someone who actually participated. A project is optional.'],['2','Keep a promise','Add a reminder in the same capture. Give it your own wording and an optional due date. You can complete it from Today, Tasks or a person brief. A calendar export is a file, not automatic synchronization.'],['3','Find the person when it matters','Open Find people and search for a topic in your notes. Inspect the original quotation and its date. Results use local lexical matching, not a claim about somebody’s current willingness or availability.'],['4','Bring context from where you work','WeChat: copy the messages you choose, then paste and confirm. Browser: install the included selection-only extension, configure your own workspace URL, select text, then choose Save in Threadline. Nothing is saved until you confirm.'],['5','Use projects when the work needs them','For a commercial project, record the goal and remaining unknowns. In Capture, optionally annotate an exact requirement or confirmed delivery using the same precise topic. You approve the meaning. A plan is not a delivered capability.'],['6','Make a considered follow-up','Open Follow-ups, refresh, compare the earlier requirement with a later confirmed capability, and check every unknown. Accept a context update only after review. Draft using evidence you explicitly allow, edit it, then decide whether to contact the person yourself.'],['7','Stay in control','Export your data from Settings. Back up the database before upgrading. Withdraw a source to invalidate derived material. Your app does not send messages or make project-stage decisions for you.']].map(([n,t,p]) => `<div class="guide-step"><div class="step-num">${n}</div><div><h3>${t}</h3><p>${p}</p></div></div>`).join('')}<div class="head-actions"><a class="btn primary" href="#capture">Save a conversation ${icon('arrow')}</a><a class="btn" href="/guide.html" target="_blank" rel="noopener">Full user guide ${icon('arrow')}</a></div></section><div class="stack"><section class="card flat"><h2>Your private workspace</h2><p>Contacts, source notes, tasks and decisions persist in your local database. Sample records are opt-in. The separate practice command uses a temporary database.</p></section><section class="card flat"><h2>What this does not do</h2><p>No automatic WeChat import, background message reading, message sending or native calendar sync. Optional external AI requires server configuration, consent and live evaluation.</p></section><section class="card flat"><h2>A weekly habit</h2><p>Save the conversations worth remembering. Review This week. Complete a promise or choose one useful next step. Keep only the context you have permission to store.</p></section></div></div>`; }
async function searchPage(q) { const r = await api('/api/search?q=' + encodeURIComponent(q)); return pageHead(`Results for “${q}”`, 'Full-text search across your saved notes, contacts, and project context.') + `<div class="search-group"><h2>Notes · ${r.notes.length}</h2>${r.notes.map(n => `<a class="search-hit" href="#note/${n.id}"><strong>${esc(n.title)}</strong><p>${esc(n.snippet)}</p><span class="small muted">${fmtDate(n.occurred_on)}</span></a>`).join('') || '<p class="muted small">No matching notes.</p>'}</div><div class="grid-2"><section><h2>People · ${r.contacts.length}</h2>${r.contacts.map(c => `<div class="search-hit flex">${avatar(c.name)}<button class="text-button" data-action="open-contact" data-id="${c.id}">${esc(c.name)}<small class="muted"> · ${esc(c.company)}</small></button></div>`).join('')}</section><section><h2>Projects · ${r.projects.length}</h2>${r.projects.map(p => `<a class="search-hit" href="#project/${p.id}"><strong>${esc(p.name)}</strong><p>${esc(p.goal)}</p></a>`).join('')}</section></div>`; }
async function render() {
    const rid = ++state.renderId;
    const [route = 'memory', ...params] = (location.hash.slice(1) || 'memory').split('/');
    state.view = route;
    shell();
    $('#app').classList.toggle('first-task-shell',route === 'first-task');
    $('#toast-root').classList.toggle('focus-toasts',route === 'first-task');
    $('#main').innerHTML = '<div class="empty"><span class="spinner"></span><p>Loading your records…</p></div>';
    let html;
    try {
        if (route === 'memory' || route === 'agent') {
            const mount = $('#main');
            if (route === 'memory' && params[0] === 'import') await mountMemoryImportUI({root:mount,api,navigate:go,toast});
            else await mountMemoryUI({ root: mount, api, navigate: go, toast, route, sourceId: route === 'memory' && params[0] === 'source' ? params[1] : null, workspace: state.data });
            if (rid === state.renderId) mount.focus({preventScroll:true});
            return;
        }
        switch (route) {
            case 'overview':
                html = overview();
                break;
            case 'first-task': html=await warm.firstTaskPage(params[0]);break;
            case 'warmstart': html=await warm.home();break;
            case 'workmap':html=await warm.map();break;
            case 'warm-goal':html=await warm.goalPage(params[0]);break;
            case 'capture':
                html = focus.capturePage(); break;
            case 'discover':
                html = await focus.discoverPage(decodeURIComponent(params.join('/'))); break;
            case 'person':
                html = await focus.personPage(params[0]); break;
            case 'saved':
                html = await focus.savedPage(params[0]); break;
            case 'week':
                html = await focus.weekPage(); break;
            case 'connect':
                html = await warm.connect(); break;
            case 'contacts':
                html = contactsPage();
                break;
            case 'projects':
                html = projectsPage();
                break;
            case 'project':
                html = await projectPage(params[0]);
                break;
            case 'notes':
                html = notesPage();
                break;
            case 'note':
                html = await notePage(params[0]);
                break;
            case 'reviews':
                html = reviewsPage();
                break;
            case 'tasks':
                html = tasksPage();
                break;
            case 'activity':
                html = activityPage();
                break;
            case 'settings':
                html = settingsPage();
                break;
            case 'guide':
                html = guidePage();
                break;
            case 'search':
                html = await searchPage(decodeURIComponent(params.join('/')));
                break;
            default: html = empty('Page not found', 'Use the navigation to return to your workspace.');
        }
        if (rid !== state.renderId)
            return;
        $('#main').innerHTML = html;
        focus.bind(route);
        warm.bind(route);
        document.title = (route === 'project' ? 'Project' : route === 'note' ? 'Note' : paths[route]?.[0] || 'Search') + ' · Threadline';
        if ($('#settings-form'))
            $('#settings-form').addEventListener('submit', async (e) => { e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true; try {
                await api('/api/settings', 'PATCH', { ...Object.fromEntries(new FormData(e.currentTarget)), version: state.data.workspace.version });
                await reload();
                toast('Workspace settings saved.');
            }
            catch (err) {
                $('#settings-error').textContent = err.message;
                button.disabled = false;
            } });
    }
    catch (e) {
        if (rid === state.renderId && $('#main'))
            $('#main').innerHTML = empty('We could not open this record', e.message, 'reload', 'Try again', 'refresh');
    }
}
function contactForm(id) { const c = id ? record('contacts', id) : {}; formModal(id ? 'Edit contact' : 'New contact', `<div class="form-grid">${field('name', 'Full name', 'text', c.name, '', 'required maxlength="120"')}${field('email', 'Email', 'email', c.email)}${field('company', 'Company', 'text', c.company)}${field('role', 'Role', 'text', c.role)}${field('phone', 'Phone', 'tel', c.phone)}${field('tags', 'Tags', 'text', c.tags, 'Separate tags with commas.')}${select('contact_policy', 'Contact preference', [['allowed', 'Contact allowed'], ['blocked', 'Do not contact']], c.contact_policy || 'allowed')}${select('archived', 'Visibility', [['0', 'Active'], ['1', 'Archived']], c.archived || 0)}${area('notes', 'Context you want to remember', c.notes)}</div>`, id ? 'Save changes' : 'Create contact', async (f) => { f.archived = f.archived === '1'; await api('/api/contacts' + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', { ...f, ...(id ? { version: c.version } : {}) }); await reload(); toast(id ? 'Contact updated.' : 'Contact created.'); }, { foot: id ? btn('delete-contact', 'Delete', 'trash', 'danger', id) : '' }); }
function projectForm(id) { const p = id ? record('projects', id) : {}; formModal(id ? 'Edit project' : 'New project', `<div class="form-grid">${field('name', 'Project name', 'text', p.name, '', 'required maxlength="160"')}${field('company', 'Company', 'text', p.company)}${select('status', 'Stage', ['active', 'waiting', 'won', 'lost', 'archived'], p.status || 'active')}${select('contact_id', 'Primary contact', contactOptions(), p.contact_id)}${field('value', 'Estimated value', 'number', p.value ? p.value / 100 : '', 'Optional. This is a user estimate, not recognized revenue.', 'min="0" max="1000000000" step="0.01"')}${select('currency', 'Currency', ['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(x => [x, x]), p.currency || 'USD')}${field('next_review', 'Next review date', 'date', p.next_review)}${area('goal', 'What are you trying to achieve?', p.goal)}${area('unknowns', 'What still needs to be verified?', p.unknowns, 'Examples: budget approval, current owner, security review, timing.')}</div>`, id ? 'Save project' : 'Create project', async (f) => { f.value = Math.round(Number(f.value || 0) * 100); f.contact_id = f.contact_id || null; const r = await api('/api/projects' + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', { ...f, ...(id ? { version: p.version } : {}) }); await reload(); if (!id)
    go('project/' + r.id); toast(id ? 'Project updated. Existing suggestions may need refresh.' : 'Project created.'); }, { large: true, foot: id ? btn('delete-project', 'Delete', 'trash', 'danger', id) : '' }); }
async function noteForm(id, pid = null, cid = null) { const n = id ? await api('/api/notes/' + id) : {}; formModal(id ? 'Edit original note' : 'Capture a conversation', `${id ? '<div class="notice amber">Editing any part of this note withdraws its evidence. Review new annotations before using them again.</div>' : ''}<div class="form-grid">${field('title', 'Title', 'text', n.title, '', 'required maxlength="200"')}${select('kind', 'Note type', ['meeting', 'note', 'conversation', 'email', 'delivery'], n.kind || 'meeting')}${select('project_id', 'Project', projectOptions(), n.project_id || pid)}${select('contact_id', 'Person', contactOptions(), n.contact_id || cid)}${field('occurred_on', 'When did this happen?', 'date', n.occurred_on, 'Leave empty when the event date is unknown.')}</div><div class="file-zone"><label class="small" for="note-file">Import text from a file, or paste below</label><br><input id="note-file" type="file" accept=".txt,.md,text/plain,text/markdown"><p>UTF-8 .txt or .md · Maximum 100,000 characters. PDFs and recordings are not supported.</p></div>${area('body', 'Original conversation or note', n.body, 'Keep the original wording. You can annotate exact quotations after saving.', 'tall')}`, id ? 'Save revision' : 'Save note', async (f) => { f.project_id = f.project_id || null; f.contact_id = f.contact_id || null; const r = await api('/api/notes' + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', { ...f, ...(id ? { version: n.version } : {}) }); await reload(); go('note/' + r.id); toast(id ? 'Note revised. Review its evidence again.' : 'Note saved. Add the evidence that matters.'); }, { large: true }); $('#note-file').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f)
    return; try {
    if (!/\.(txt|md)$/i.test(f.name) || f.size > 500000)
        throw new Error('Choose a UTF-8 .txt or .md file under 500 KB.');
    const v = new TextDecoder('utf-8', { fatal: true }).decode(await f.arrayBuffer());
    if ([...v].length > 100000)
        throw new Error('This file exceeds 100,000 characters.');
    $('#f-body').value = v;
    if (!$('#f-title').value)
        $('#f-title').value = f.name.replace(/\.(txt|md)$/i, '');
}
catch (err) {
    if ($('#form-error')) $('#form-error').textContent = err.message;
} }); }
async function annotate(nid) { const selected = window.getSelection()?.toString() || ''; const n = await api('/api/notes/' + nid); formModal('Add source-backed evidence', `<div class="notice">Use a unique, exact quotation from the original note. Add a consistent topic to connect requirements with later capabilities.</div>${area('quote', 'Exact quotation', selected)}${area('statement', 'Working summary (optional)', '', 'A short English interpretation. The original quotation remains visible.')}<div class="form-grid">${select('kind', 'Evidence type', ['requirement', 'capability', 'blocker', 'commitment', 'context', 'contact_change', 'opinion'], 'context')}${field('topic', 'Topic', 'text', '', 'Use the same topic for a related requirement and capability.', 'required placeholder="e.g. private-deployment" list="topics"')}${select('certainty', 'What does the source establish?', [['uncertain', 'Uncertain — needs checking'], ['confirmed', 'Confirmed in the source'], ['planned', 'Planned or conditional'], ['reported', 'Reported by someone else']], 'uncertain')}${field('valid_until', 'Review after / expiry', 'date', '', 'Optional. Expired evidence is excluded from matching.')}</div><datalist id="topics">${[...new Set(state.data.claims.map(c => c.topic))].map(t => `<option value="${esc(t)}">`).join('')}</datalist>`, 'Save candidate', async (f) => { await api('/api/claims', 'POST', { ...f, note_id: nid, project_id: n.project_id }); await reload(); toast('Evidence candidate saved. Review it before approval.'); }, { large: true }); }
function reviewClaim(id) { const c = record('claims', id); formModal('Review this evidence', `<div class="evidence"><div class="badges">${badge(c.status)}${badge('local', note(c.note_id)?.title || 'Original note')}</div><blockquote>${esc(c.quote)}</blockquote></div><div class="form-grid">${select('kind', 'Evidence type', ['requirement', 'capability', 'blocker', 'commitment', 'context', 'contact_change', 'opinion'], c.kind)}${field('topic', 'Matching topic', 'text', c.topic, '', 'required')}${select('certainty', 'Certainty', [['uncertain', 'Uncertain'], ['confirmed', 'Confirmed in the source'], ['planned', 'Planned / conditional'], ['reported', 'Reported / hearsay']], c.certainty)}${field('valid_until', 'Evidence expiry', 'date', c.valid_until)}${select('decision', 'Decision', [['approve', 'Approve this interpretation'], ['reject', 'Reject candidate'], ['withdraw', 'Withdraw from working memory']], 'approve')}</div><label class="check-line"><input type="checkbox" required>I checked the quotation, event date, and meaning. Approval records my judgement, not an independent verification.</label>`, 'Save decision', async (f) => { await api('/api/claims/' + id + '/decision', 'POST', { ...f, version: c.version }); await reload(); toast('Evidence decision saved. Refresh opportunities to recompute matches.'); }); }
function taskForm(id, pid = null) { const t = id ? record('tasks', id) : {}; formModal(id ? 'Edit commitment' : 'New commitment', `${field('title', 'What needs to happen?', 'text', t.title, '', 'required maxlength="300"')}<div class="form-grid">${field('due_on', 'Due date', 'date', t.due_on)}${select('status', 'Status', ['open', 'done', 'cancelled'], t.status || 'open')}${select('project_id', 'Related project', projectOptions(), t.project_id || pid)}${select('contact_id', 'Related person', contactOptions(), t.contact_id)}</div>${area('notes', 'Details', t.notes)}`, id ? 'Save task' : 'Create task', async (f) => { f.project_id = f.project_id || null; f.contact_id = f.contact_id || null; await api('/api/tasks' + (id ? '/' + id : ''), id ? 'PATCH' : 'POST', { ...f, ...(id ? { version: t.version } : {}) }); await reload(); toast('Task saved.'); }, { foot: id ? btn('delete-task', 'Delete', 'trash', 'danger', id) : '' }); }
async function openContact(id) { const c = record('contacts', id); openModal(c.name, `<div class="flex mb">${avatar(c.name, 'lg')}<div><h3 class="no-margin">${esc(c.role || 'Role not specified')}</h3><p class="muted small no-margin">${esc(c.company || 'Company not specified')}</p></div>${badge(c.contact_policy)}</div><dl class="meta-grid"><div><dt>Email</dt><dd class="break">${esc(c.email || 'Not set')}</dd></div><div><dt>Phone</dt><dd>${esc(c.phone || 'Not set')}</dd></div></dl>${c.notes ? `<div class="section-title">Relationship context</div><p class="small break">${esc(c.notes)}</p>` : ''}<div class="section-title">Shared projects</div>${state.data.projects.filter(p => p.contact_id === id).map(p => `<div class="list-row"><a href="#project/${p.id}" data-action="close-modal" class="grow">${esc(p.name)}</a>${badge(p.status)}</div>`).join('') || '<p class="small muted">No linked projects.</p>'}<div class="section-title">Recent conversations</div>${state.data.notes.filter(n => n.contact_id === id).slice(0, 5).map(n => `<div class="list-row"><a href="#note/${n.id}" data-action="close-modal" class="grow">${esc(n.title)}</a><span class="small muted">${fmtDate(n.occurred_on, true)}</span></div>`).join('') || '<p class="small muted">No linked notes.</p>'}<div class="modal-footer"><a class="btn" href="#person/${id}" data-action="close-modal">Open relationship brief</a>${btn('new-note-for-contact', 'Add conversation', 'plus', '', id)}${btn('edit-contact', 'Edit contact', 'edit', 'primary', id)}</div>`); }
async function openReview(id) {
    const r = await api('/api/reviews/' + id);
    const live = r.state !== 'stale', evidence = r.evidence || [], p = r.project || {}, contactName = r.contact?.name || 'No primary contact';
    openModal(r.title, `<div class="flex space-between mb"><span>${badge(r.state)} ${badge('local', p.name || 'Project')}</span><span class="small muted">Version ${r.version}</span></div><p>${esc(r.reason)}</p>${!live ? '<div class="notice amber">This item was invalidated. Refresh opportunities after reviewing the underlying evidence.</div>' : ''}<div class="form-grid">${evidence.map((c, i) => `<div class="evidence"><div class="overline muted">${i === 0 ? 'THEN · REQUIREMENT' : 'NOW · CAPABILITY'}</div><blockquote>${esc(c.quote)}</blockquote><a class="source-link" href="#note/${c.note_id}" data-action="close-modal">${icon('link')} ${esc(c.note_title)}</a><div class="small muted">${fmtDate(c.occurred_on)}</div></div>`).join('')}</div><div class="unknowns"><strong>Still to verify</strong><br>${esc(p.unknowns || 'Budget, current ownership, timing, and present-day relevance have not been established by this match.')}</div><div class="flex mb">${avatar(contactName)}<div><strong>${esc(contactName)}</strong><div class="small muted">Suggested next step: verify, don’t assume.</div></div></div><div class="head-actions mb">${r.state === 'suggested' ? btn('accept-review', 'Accept context update', 'check', 'primary', id) : ''}${live && ['suggested', 'accepted', 'snoozed'].includes(r.state) ? btn('snooze-review', 'Remind me later', 'clock', '', id) + btn('dismiss-review', 'Dismiss', '', 'ghost', id) : ''}${live && r.contact_id ? btn('record-event', 'Record an actual event', 'plus', '', id) : ''}</div>${live ? `<section class="card flat"><h3>Prepare a thoughtful message</h3><p class="small muted">Choose the exact evidence you permit in this draft. Nothing is sent automatically.</p><form id="draft-form"><div class="field-error" id="draft-error" role="alert"></div>${evidence.map(c => `<label class="check-line"><input type="checkbox" name="evidence" value="${c.id}">Permit the ${esc(c.kind)} quotation above for this draft.</label>`).join('')}<label class="check-line"><input type="checkbox" name="use_ai" ${state.data.ai.configured ? '' : 'disabled'}>Use optional AI writing ${state.data.ai.configured ? '(selected text is sent to the configured provider)' : '(not configured)'}</label><button class="btn primary" type="submit">${icon('edit')} ${r.draft ? 'Regenerate draft' : 'Create draft'}</button></form>${r.draft ? `<form id="save-draft-form" class="mt">${area('draft', 'Your editable draft', r.draft, 'This draft is saved on your server. Review every sentence before use.', 'draft-text')}<div class="head-actions"><button type="submit" class="btn">Save changes</button>${btn('copy-draft', 'Save & copy draft', 'file', '', id)}</div></form>` : ''}</section>` : ''}`, true);
    if ($('#draft-form'))
        $('#draft-form').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.currentTarget, b = f.querySelector('button'); b.disabled = true; try {
            const ids = [...f.querySelectorAll('[name=evidence]:checked')].map(x => x.value), use_ai = f.querySelector('[name=use_ai]').checked;
            const out = await api('/api/reviews/' + id + '/draft', 'POST', { version: r.version, evidence_ids: ids, use_ai });
            if (out.job_id) {
                closeModal();
                toast('AI is preparing your draft. Your selected evidence is being processed.');
                await poll(out.job_id);
                await reload();
                await openReview(id);
            }
            else {
                await reload();
                await openReview(id);
                toast('Draft saved. Nothing has been sent.');
            }
        }
        catch (err) {
            if ($('#draft-error'))
                $('#draft-error').textContent = err.message;
            else
                toast(err.message, true);
        }
        finally {
            b.disabled = false;
        } });
    if ($('#save-draft-form'))
        $('#save-draft-form').addEventListener('submit', async (e) => { e.preventDefault(); const b = e.currentTarget.querySelector('button'); b.disabled = true; try {
            const current = record('reviews', id) || r;
            await api('/api/reviews/' + id + '/draft', 'PATCH', { version: current.version, draft: new FormData(e.currentTarget).get('draft') });
            await reload();
            await openReview(id);
            toast('Draft changes saved.');
        }
        catch (err) {
            toast(err.message, true);
            b.disabled = false;
        } });
}
async function poll(id) { for (let n = 0; n < 70; n++) {
    await new Promise(r => setTimeout(r, 1000));
    const job = await api('/api/jobs/' + id);
    if (job.state === 'succeeded')
        return job;
    if (job.state === 'failed' || job.state === 'cancelled')
        throw new Error(job.error || 'Request was cancelled.');
} throw new Error('The request is still running. Check Activity or refresh the note shortly.'); }
function recordEventForm(id) { const r = record('reviews', id), options = []; if (['accepted', 'suggested', 'snoozed'].includes(r.state))
    options.push(['contacted', 'I contacted this person']); if (r.state === 'contacted')
    options.push(['replied', 'They replied']); if (['contacted', 'replied'].includes(r.state))
    options.push(['meeting', 'We had a meeting']); if (['contacted', 'replied', 'meeting', 'closed'].includes(r.state))
    options.push(['outcome', 'Record a business outcome']); if (!options.length)
    return toast('This follow-up does not support another event yet.', true); const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16); formModal('Record what actually happened', `<div class="notice">Only record completed, real-world events. This does not send a message or change the project’s commercial stage.</div>${select('type', 'Event', options, options[0][0])}${field('occurred_at', 'When did it happen?', 'datetime-local', local, 'Shown in your browser’s local timezone.', 'required')}${select('outcome', 'Business outcome (only used for outcome events)', ['progressed', 'won', 'lost', 'not_relevant'], 'progressed')}`, 'Record event', async (f) => { const payload = { version: r.version, type: f.type, occurred_at: new Date(f.occurred_at).toISOString() }; if (f.type === 'outcome')
    payload.outcome = f.outcome; await api('/api/reviews/' + id + '/events', 'POST', payload); await reload(); toast('Actual event recorded.'); }); }
function importContacts() { formModal('Import contacts', `<p class="small muted">Use columns <code>name,email,company,role,phone,tags,notes</code>. Only name is required. Duplicate emails are skipped and reported. Up to 1,000 rows, imported atomically.</p><a class="small" href="/contacts-template.csv" download>Download CSV template</a><div class="file-zone"><input type="file" id="csv-file" accept=".csv,text/csv" required aria-label="Contact CSV"></div><div class="notice" id="import-preview">Choose a CSV file.</div>`, 'Import contacts', async (_, form) => { const f = $('#csv-file').files[0]; if (!f)
    throw new Error('Choose a CSV file.'); if (f.size > 2 * 1024 * 1024)
    throw new Error('CSV exceeds 2 MB.'); const csv = new TextDecoder('utf-8', { fatal: true }).decode(await f.arrayBuffer()); const r = await api('/api/contacts/import', 'POST', { csv }); await reload(); toast(`${r.created} contacts imported; ${r.skipped.length} duplicate emails skipped.`); }); $('#csv-file').addEventListener('change', e => { $('#import-preview').textContent = e.target.files[0]?.name || 'Choose a CSV file.'; }); }
function downloadJSON(value, name) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
function exportForm() { formModal('Export your workspace', `<div class="notice amber">This archive contains private conversations in plain text. Keep it encrypted or in a secure location. Your password is checked, never exported.</div>${field('password', 'Current password', 'password', '', '', 'required autocomplete="current-password"')}`, 'Export JSON', async (f) => { const out = await api('/api/export', 'POST', f); downloadJSON(out, 'threadline-export-' + localDay() + '.json'); toast('Export prepared. Check your browser’s downloads and keep the file private.'); }); }
function restoreForm() { formModal('Restore into an empty workspace', `<div class="notice">Restore contacts, projects, notes, approved evidence, and tasks. The workspace must be empty. Historical events and drafts stay in the export archive rather than being replayed as new activity.</div><div class="file-zone"><input type="file" id="restore-file" accept=".json,application/json" aria-label="Workspace export" required></div><div id="restore-preview" class="notice green">Choose a Threadline export to preview it.</div>${field('password', 'Current password', 'password', '', '', 'required autocomplete="current-password"')}<label class="check-line"><input type="checkbox" required>I have the right to use this archive and understand that generated follow-ups will be recomputed.</label>`, 'Restore working records', async (f) => { const file = $('#restore-file').files[0]; if (!file)
    throw new Error('Choose an export first.'); if (file.size > 11 * 1024 * 1024)
    throw new Error('Archive exceeds the 11 MB restore limit.'); const archive = JSON.parse(await file.text()); const result = await api('/api/restore', 'POST', { password: f.password, archive }); await api('/api/reviews/refresh', 'POST', {}); await reload(); toast(`${result.contacts} contacts, ${result.projects} projects, and ${result.notes} notes restored.`); }); $('#restore-file').addEventListener('change', async (e) => { try {
    const file = e.target.files[0];
    if (file.size > 11 * 1024 * 1024)
        throw new Error('Archive exceeds 11 MB.');
    const a = JSON.parse(await file.text());
    if (a.format !== 'threadline-export' || a.version !== 1)
        throw new Error('Unsupported file format.');
    $('#restore-preview').textContent = `${a.tables.contacts.length} contacts · ${a.tables.projects.length} projects · ${a.tables.notes.length} notes. No records have been imported yet.`;
}
catch (e) {
    $('#restore-preview').textContent = e.message;
} }); }
function showAuth(register) {
    const setup = state.auth?.setupRequired || register && state.auth?.setupRequired;
    const isRegister = register || setup;
    $('#app').innerHTML = `<main class="auth-screen"><section class="auth-brand"><a class="brand" href="/welcome"><img src="/logo.svg" alt="">Threadline</a><div class="auth-story"><div class="overline">RELATIONSHIPS, REMEMBERED.</div><h1>The right context.<br>The right moment.</h1><p>Your conversations hold possibilities.<br>Give them a place to become your next thoughtful move.</p><div class="auth-trail"><div class="hero-node"><span>Remember what mattered.</span><span>01</span></div><div class="hero-node"><span>Notice what changed.</span><span>02</span></div><div class="hero-node"><span>Follow through with care.</span><span>03</span></div></div></div><footer>Private workspaces · Evidence-backed context · Human decisions</footer></section><section class="auth-form-wrap"><div class="auth-form"><a class="brand" href="/welcome"><img src="/logo.svg" alt="">Threadline</a><h2>${isRegister ? 'Make room for context.' : 'Welcome back.'}</h2><p>${isRegister ? 'Create your account. Your workspace starts empty, ready for your own relationships.' : 'Sign in to your relationship workspace.'}</p><form id="auth-form"><div class="field-error" role="alert" id="auth-error"></div>${isRegister ? field('name', 'Your name', 'text', '', '', 'required autocomplete="name"') + field('workspace', 'Workspace name', 'text', '', 'Optional. You can change this later.') : ''}${field('email', 'Email address', 'email', '', '', 'required autocomplete="email"')}${field('password', 'Password', 'password', '', isRegister ? 'At least 12 characters. A longer passphrase works well.' : '', 'required minlength="12" maxlength="256" autocomplete="' + (isRegister ? 'new-password' : 'current-password') + '"')}${isRegister && state.auth?.invitationRequired ? field('inviteCode', 'Operator invitation code', 'password', '', '', 'required') : ''}<button class="btn primary wide" type="submit">${isRegister ? 'Create private workspace' : 'Sign in'} ${icon('arrow')}</button></form><div class="auth-switch">${isRegister ? 'Already have an account? <button data-action="auth-login">Sign in</button>' : state.auth?.registrationOpen ? 'Have an invitation? <button data-action="auth-register">Create an account</button>' : 'Registration is closed. Ask the server operator for access.'}</div><div class="auth-foot">${icon('shield')} This server stores your account and workspace.<br><a href="/guide">Read the user guide</a> · <a href="/welcome">About Threadline</a></div></div></section></main>`;
    $('#auth-form').addEventListener('submit', async (e) => { e.preventDefault(); const form = e.currentTarget, b = form.querySelector('button[type=submit]'); b.disabled = true; $('#auth-error').textContent = ''; try {
        const f = Object.fromEntries(new FormData(form));
        state.auth = { ...state.auth, ...await api('/api/auth/' + (isRegister ? 'register' : 'login'), 'POST', f), authenticated: true };
        go(focus.hasImported() ? 'capture' : 'overview');
        await reload();
    }
    catch (err) {
        $('#auth-error').textContent = err.message;
        b.disabled = false;
    } });
}
async function handle(action, id, el) { if (await warm.handle(action,id,el)) return; if (await focus.handle(action,id,el)) return; switch (action) {
    case 'menu':
        setMenu(!$('.shell')?.classList.contains('nav-open'));
        break;
    case 'close-modal':
        closeModal();
        break;
    case 'auth-login':
        showAuth(false);
        break;
    case 'auth-register':
        showAuth(true);
        break;
    case 'logout':
        await api('/api/auth/logout', 'POST', {});
        state.data = null; focus.clear(); warm.clear();
        state.auth = await api('/api/auth/status');
        showAuth(false);
        break;
    case 'reload':
        await reload();
        break;
    case 'help':
        go('guide');
        break;
    case 'new-contact':
        contactForm();
        break;
    case 'edit-contact':
        contactForm(id);
        break;
    case 'open-contact':
        await openContact(id);
        break;
    case 'import-contacts':
        importContacts();
        break;
    case 'new-project':
        projectForm();
        break;
    case 'edit-project':
        projectForm(id);
        break;
    case 'new-note':
        await noteForm();
        break;
    case 'new-note-for-project':
        await noteForm(null, id);
        break;
    case 'new-note-for-contact':
        await noteForm(null, null, id);
        break;
    case 'edit-note':
        await noteForm(id);
        break;
    case 'new-task':
        taskForm();
        break;
    case 'new-task-for-project':
        taskForm(null, id);
        break;
    case 'edit-task':
        taskForm(id);
        break;
    case 'annotate':
        await annotate(id);
        break;
    case 'review-claim':
        reviewClaim(id);
        break;
    case 'scan-note': {
        const r = await api('/api/notes/' + id + '/scan', 'POST', {});
        await reload();
        toast(`${r.ids.length} text-scan candidates. Review their type and certainty.`);
        break;
    }
    case 'ai-extract':
        formModal('Extract with optional AI', `<div class="notice">The full text of this note will be sent to the configured AI provider using server-held credentials. Only proceed if you may use this information with that provider.</div><label class="check-line"><input type="checkbox" required>I permit this note to be processed by the configured AI provider.</label>`, 'Extract candidates', async () => { const j = await api('/api/notes/' + id + '/extract', 'POST', { consent: true }); closeModal(); toast('Extraction started. Your original note is saved.'); poll(j.job_id).then(async () => { await reload(); toast('AI candidates are ready for review.'); }).catch(e => toast(e.message, true)); });
        break;
    case 'refresh-reviews': {
        const r = await api('/api/reviews/refresh', 'POST', {});
        await reload();
        toast(`${r.created_or_updated} opportunities created or updated. No project stages were changed.`);
        break;
    }
    case 'open-review':
        await openReview(id);
        break;
    case 'accept-review': {
        const r = record('reviews', id), p = project(r.project_id);
        await api('/api/reviews/' + id + '/accept', 'POST', { version: r.version, project_version: p.version });
        await reload();
        await openReview(id);
        toast('Context accepted. Budget, ownership, and stage remain yours to verify.');
        break;
    }
    case 'dismiss-review': {
        const r = record('reviews', id);
        await api('/api/reviews/' + id + '/events', 'POST', { version: r.version, type: 'dismiss' });
        closeModal();
        await reload();
        toast('Follow-up dismissed.');
        break;
    }
    case 'snooze-review': {
        const r = record('reviews', id), date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        formModal('Choose a better moment', field('until', 'Review again on', 'date', date, 'This is a reminder, not scheduled outreach.', 'required'), 'Snooze', async (f) => { await api('/api/reviews/' + id + '/events', 'POST', { version: r.version, type: 'snooze', until: f.until }); await reload(); toast('Follow-up snoozed. Refresh opportunities when it becomes due.'); });
        break;
    }
    case 'record-event':
        recordEventForm(id);
        break;
    case 'correct-event': {
        const e = record('events', id), r = record('reviews', e.subject_id);
        formModal('Correct a recorded event', `<div class="notice amber">This marks the recorded ${esc(label(e.type))} event as a mistake. The audit history is preserved. Correct later events first, then this one.</div>`, 'Mark as incorrect', async () => { await api('/api/events/' + id + '/correct', 'POST', { version: r.version }); await reload(); toast('Event corrected and working status rebuilt.'); });
        break;
    }
    case 'copy-draft': {
        const r = record('reviews', id);
        const draft = $('#f-draft')?.value || r.draft;
        const saved = await api('/api/reviews/' + id + '/draft', 'PATCH', { version: r.version, draft });
        try {
            await navigator.clipboard.writeText(draft);
        }
        catch {
            await reload();
            await openReview(id);
            toast('Draft saved. Clipboard access is blocked; select the text and copy it manually.', true);
            break;
        }
        await api('/api/reviews/' + id + '/events', 'POST', { version: saved.version, type: 'copied' });
        await reload();
        await openReview(id);
        toast('Draft copied. No contact or send event was recorded.');
        break;
    }
    case 'toggle-task': {
        const t = record('tasks', id);
        await api('/api/tasks/' + id, 'PATCH', { version: t.version, status: t.status === 'done' ? 'open' : 'done' });
        await reload();
        toast(t.status === 'done' ? 'Task reopened.' : 'Task completed.');
        break;
    }
    case 'delete-contact': {
        const c = record('contacts', id);
        await confirmDelete('Delete contact card?', `Remove ${c.name} and unlink this card from projects and tasks. Original notes may still mention this person. Delete those notes separately when needed.`, () => api('/api/contacts/' + id, 'DELETE', { version: c.version }));
        break;
    }
    case 'delete-project': {
        const p = record('projects', id);
        await confirmDelete('Delete this project?', 'Remove the project and its generated follow-ups. Original notes and tasks are kept, without this project link.', async () => { await api('/api/projects/' + id, 'DELETE', { version: p.version }); go('projects'); });
        break;
    }
    case 'delete-note': {
        const n = record('notes', id);
        await confirmDelete('Delete original note?', 'Remove the note text and its quotations from the active workspace. Dependent follow-ups, draft text, and derived context will be withdrawn. Existing backups are separate.', async () => { await api('/api/notes/' + id, 'DELETE', { version: n.version }); go('notes'); });
        break;
    }
    case 'delete-task': {
        const t = record('tasks', id);
        await confirmDelete('Delete task?', 'Remove this task. Its audit event remains without the task text.', () => api('/api/tasks/' + id, 'DELETE', { version: t.version }));
        break;
    }
    case 'export':
        exportForm();
        break;
    case 'restore':
        restoreForm();
        break;
    case 'change-password':
        formModal('Change password', field('currentPassword', 'Current password', 'password', '', '', 'required autocomplete="current-password"') + field('newPassword', 'New password', 'password', '', 'At least 12 characters. All other sessions will be signed out.', 'required minlength="12" autocomplete="new-password"'), 'Update password', async (f) => { state.auth = { ...state.auth, ...await api('/api/auth/password', 'POST', f) }; toast('Password changed. Other sessions have been signed out.'); });
        break;
    case 'delete-account':
        formModal('Permanently delete your account', `<div class="notice red">This removes your account and all its working records. Export anything you need first. Operator backups and downloaded files need separate deletion.</div>${field('password', 'Current password', 'password', '', '', 'required autocomplete="current-password"')}${field('confirm', 'Type DELETE to confirm', 'text', '', '', 'required pattern="DELETE"')}`, 'Delete my account', async (f) => { await api('/api/account', 'DELETE', f); state.data = null; state.auth = await api('/api/auth/status'); showAuth(false); toast('Account and active workspace removed.'); }, { submitClass: 'danger' });
        break;
} }
document.addEventListener('click', async (e) => { const nav = e.target.closest('[data-nav]'); if (nav) {
    state.filter = 'all';
    state.search = '';
    setMenu(false, false);
    go(nav.dataset.nav);
    return;
} const filter = e.target.closest('[data-filter]'); if (filter) {
    state.filter = filter.dataset.filter;
    await render();
    return;
} const el = e.target.closest('[data-action]'); if (!el || el.disabled)
    return; const action = el.dataset.action; const block = ['refresh-reviews', 'toggle-task', 'accept-review', 'scan-note', 'copy-draft'].includes(action); if (block)
    el.disabled = true; try {
    await handle(action, el.dataset.id, el);
}
catch (err) {
    toast(err.message, true);
}
finally {
    if (block)
        el.disabled = false;
} });
$('#modal').addEventListener('click', e => { if (e.target === $('#modal')) {
    const r = e.target.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        closeModal();
} });
window.addEventListener('hashchange', () => { if (state.data) {
    state.filter = 'all';
    state.search = '';
    render();
} });
window.addEventListener('resize',()=>setMenu(false,false));
document.addEventListener('keydown', e => {
    if($('.shell.nav-open')){
        if(e.key==='Escape'){e.preventDefault();setMenu(false);return;}
        if(e.key==='Tab'){const nodes=$$('.sidebar a,.sidebar button').filter(n=>n.getClientRects().length&&!n.disabled),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('#global-search input')?.focus();
} });
async function start() { try {
    state.auth = await api('/api/auth/status');
    if (state.auth.authenticated)
        await reload();
    else
        showAuth(state.auth.setupRequired);
}
catch (e) {
    $('#app').innerHTML = `<div class="boot"><img src="/logo.svg" alt=""><h1>Start the Threadline server</h1><p>${esc(e.message)}</p><pre>npm start</pre><p>Then open http://localhost:4173 in your browser.</p><button class="btn primary" data-action="retry-start">Try again</button></div>`;
    document.querySelector('[data-action=retry-start]')?.addEventListener('click', start);
} }
let filterTimer;
document.addEventListener('input', e => { if (e.target.id !== 'list-search')
    return; state.search = e.target.value; clearTimeout(filterTimer); filterTimer = setTimeout(async () => { await render(); $('#list-search')?.focus(); }, 170); });
const warm = window.createWarmUI({state,api,reload,go,esc,btn,field,area,select,icon,avatar,badge,fmtDate,localDay,formModal,toast,openModal});
const focus = window.createThreadlineFocus({state,api,reload,go,esc,btn,field,area,select,icon,avatar,badge,fmtDate,localDay,contact,project,formModal,toast,openModal});
focus.consumeFragment();
start();
