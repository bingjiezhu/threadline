/* English Warm Start UI. Every record and mutation uses the authenticated backend. */
window.createWarmUI = function ({ state, api, reload, go, esc, btn, field, area, select, icon, avatar, badge, fmtDate, localDay, formModal, toast, openModal }) {
    const $ = s => document.querySelector(s);
    let data = null, goal = null, connections = null;
    const header = (eyebrow, title, sub, actions = '') => `<div class="warm-page-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${title}</h1><p class="muted">${esc(sub)}</p></div><div class="head-actions">${actions}</div></div>`;
    const cap = s => s.replaceAll('-', ' ').replace(/^./, x => x.toUpperCase());
    function routeCard(r) { return `<article class="warm-route ${r.usable ? '' : 'route-muted'}"><div class="flex">${avatar(r.person_name)}<div class="grow"><strong>${esc(r.person_name)}</strong><small>${esc(cap(r.topic) || 'Withdrawn context')} · ${esc(r.route_role)}</small></div>${badge(r.usable ? 'approved' : r.status === 'active' ? 'pending' : r.status, r.usable ? 'Confirmed route' : r.status === 'active' ? 'Needs review' : cap(r.status))}</div>${r.quote ? `<blockquote>${esc(r.quote)}</blockquote>` : '<p class="micro">The source was withdrawn. Derived text is no longer shown.</p>'}<div class="source-top"><span>Effective ${esc(fmtDate(r.effective_on, true))}${r.expires_on ? ' · review by ' + esc(fmtDate(r.expires_on, true)) : ''}</span><a href="#note/${r.note_id}">Source ${icon('arrow')}</a></div>${r.status === 'active' ? `<button class="btn ghost mt" data-action="warm-revoke" data-id="${r.id}">Withdraw this route</button>` : ''}</article>`; }
    async function home() { data = await api('/api/warm'); const goals = data.goals.filter(g => g.status !== 'archived'), done = goals.filter(g => g.status === 'done').length, rs = data.routes.filter(r => r.usable); return header('WARM START · YOUR FIRST WEEK', 'A new team.<br><em>A clear next step.</em>', 'Find the context, the person and the path behind your first task.', btn('warm-new-goal', 'Set a first goal', 'plus', 'primary')) + `<section class="warm-hero"><div><div class="pill"><span class="live-dot"></span> Confidence comes from context</div><h2>You do not need<br>to know everything.<br><em>Just where to begin.</em></h2><p>Turn a question into a source-backed plan.<br>See who can help. Keep what is unknown visible.</p><div class="head-actions">${btn('warm-new-goal', 'Plan my first task', 'arrow', 'primary')}<button class="btn" data-action="warm-route">Add trusted context</button></div><p class="micro">Your private workspace · You approve every next step</p></div><div class="warm-map" aria-label="Source, colleague and approved next step"><div class="map-orbit"></div><div class="warm-map-node map-source"><span class="map-icon">${icon('file')}</span><div><small>01 · THE SOURCE</small><strong>What does the record say?</strong></div></div><div class="warm-map-line"></div><div class="warm-map-node map-person"><span class="map-icon">${icon('users')}</span><div><small>02 · THE PERSON</small><strong>Who owns the next step?</strong></div></div><div class="warm-map-line"></div><div class="warm-map-node map-next"><span class="map-icon">${icon('check')}</span><div><small>03 · YOUR DECISION</small><strong>A plan you can act on.</strong></div></div><p class="map-caption">No guessed approvals. No automatic outreach.</p></div></section>${state.data.demo ? '<div class="warm-practice">Fictional practice workspace · Real records and task execution · No live model or chat-platform call in this practice</div>' : ''}<section class="warm-stats"><div><strong>${goals.filter(g => g.status === 'open').length}</strong><span>first-week goals open</span></div><div><strong>${rs.length}</strong><span>confirmed knowledge routes</span></div><div><strong>${done}</strong><span>outcomes you marked complete</span></div></section><div class="warm-two"><section><div class="section-heading"><h2>What would make this week a win?</h2></div>${goals.map(g => `<a class="warm-goal-card" href="#warm-goal/${g.id}"><span class="goal-mark">${icon(g.status === 'done' ? 'check' : 'arrow')}</span><div class="grow"><span class="eyebrow">${esc(g.role)}</span><h3>${esc(g.title)}</h3><p>${esc(g.success)}</p><small>${esc(cap(g.topic))}${g.due_on ? ' · ' + esc(fmtDate(g.due_on, true)) : ''}</small></div>${badge(g.status)}</a>`).join('') || `<div class="card focus-empty"><h3>Begin with one real task.</h3><p>Get sandbox access. Ship a first change. Find a mentor.<br>You choose the goal; your sources supply the context.</p>${btn('warm-new-goal', 'Create your first goal', 'plus', 'primary')}</div>`}</section><aside class="quiet-card warm-aside"><span class="eyebrow">A USEFUL KIND OF AGENT</span><h2>Knows when to help.<br>And when to ask.</h2><p>Old documents can point to the wrong person. Conflicting sources can look equally convincing.</p><div class="mini-step"><span>1</span><p>Check the source and its date.</p></div><div class="mini-step"><span>2</span><p>Confirm the right colleague.</p></div><div class="mini-step"><span>3</span><p>Approve steps before tasks appear.</p></div><a href="#workmap" class="btn">Review your knowledge map ${icon('arrow')}</a></aside></div>`; }
    async function map() { data = await api('/api/warm'); return header('TRUSTED CONTEXT', 'People, backed by a source.', 'Explicitly confirm responsibilities from material you are authorized to keep.', btn('warm-route', 'Add a knowledge route', 'plus', 'primary')) + `<div class="notice">A profile or a job title is not proof of ownership. Use dated, exact wording and confirm the person yourself. This is your private map, not a company-wide employee directory.</div><div class="warm-route-grid">${data.routes.map(routeCard).join('') || '<section class="card focus-empty"><h3>No knowledge routes yet.</h3><p>Save an onboarding note, add a colleague, then connect them with one exact quotation.</p><a href="#capture" class="btn">Save source material</a></section>'}</div><p class="micro mt">Replacing a route requires a later source date and your explicit choice. If two current owners conflict, planning pauses.</p>`; }
    async function goalPage(id) { goal = await api('/api/warm/goals/' + id); const p = goal.plans[0], b = p?.body || {}, ready = p && p.status === 'proposed' && b.resolution === 'ready', approved = p?.status === 'approved'; const tasks = p?.tasks || []; return header('FIRST-WEEK GOAL', esc(goal.title), goal.role + ' · ' + cap(goal.topic), `<a href="#first-task/${esc(id)}" class="btn primary">Focus on this task ${icon('arrow')}</a><a href="#warmstart" class="btn">${icon('back')} All goals</a>${btn('warm-edit-goal', 'Edit goal', 'edit', '', id)}${goal.status === 'open' ? btn('warm-plan', 'Prepare a plan', 'spark', 'primary', id) : btn('warm-reopen', 'Reopen goal', 'refresh', '', id)}`) + `<div class="warm-goal-intent"><span class="eyebrow">WHAT DONE LOOKS LIKE</span><strong>${esc(goal.success)}</strong><span>${goal.due_on ? esc(fmtDate(goal.due_on)) : 'No deadline set'} · ${esc(cap(goal.status))}</span></div>${!p ? `<div class="warm-launch"><div class="warm-launch-icon">${icon('spark')}</div><h2>A first step, not another answer to read.</h2><p>Check current ownership and exact sources.<br>Then review a plan before creating any tasks.</p>${btn('warm-plan', 'Prepare my plan', 'arrow', 'primary', id)}<a href="#workmap">Add or inspect source context</a></div>` : p.status === 'stale' ? `<div class="card warm-stale"><span class="eyebrow">CONTEXT CHANGED</span><h2>This plan needs a fresh look.</h2><p>Its source, permissions or workspace context changed. Old derived text is hidden and open generated tasks are cancelled.</p>${btn('warm-plan', 'Recheck the sources', 'refresh', 'primary', id)}</div>` : `<div class="warm-plan-top"><span class="warm-resolution ${b.resolution === 'ready' ? '' : 'needs-review'}">${icon(b.resolution === 'ready' ? 'shield' : 'search')}${b.resolution === 'ready' ? 'Evidence checked' : b.resolution === 'needs_clarification' ? 'Ownership needs clarification' : 'More context needed'}</span><span class="micro">${p.mode === 'openai' ? (b.provider === 'vertex' ? 'Gemini on Vertex AI · ' + b.model : 'AI-assisted plan') : 'Local source-backed plan'} · ${esc(cap(p.status))}</span></div><h2 class="plan-summary">${esc(b.summary)}</h2><div class="warm-trace">${(b.trace || []).map((t, i) => `<span><b>${i + 1}</b>${esc(t)}</span>`).join('')}</div><div class="warm-two plan-layout"><section><div class="section-heading"><h2>${approved ? 'Your approved next steps' : 'Your proposed next steps'}</h2><span class="micro">${approved ? tasks.filter(t => t.status === 'done').length + ' / ' + tasks.length + ' complete' : 'Nothing executed yet'}</span></div><form id="warm-approval">${(b.steps || []).map((s, i) => { const t = tasks.find(t => t.step_id === s.id); return `<article class="warm-step ${t?.status === 'done' ? 'is-done' : ''}"><div class="warm-step-head"><span class="step-tag">0${i + 1}</span><div class="grow"><span class="eyebrow">${esc(s.kind === 'ask' ? 'CONNECT' : s.kind === 'read' ? 'LEARN' : 'VERIFY')}</span><h3>${esc(s.title)}</h3></div>${ready ? `<input type="checkbox" name="step_ids" value="${esc(s.id)}" checked aria-label="Include ${esc(s.title)}">` : t ? btn('warm-complete', t.status === 'done' ? 'Reopen' : 'Mark done', 'check', t.status === 'done' ? 'ghost' : '', t.id) : '<span class="micro">Not selected</span>'}</div><p>${esc(s.instruction)}</p>${s.draft ? `<details class="warm-draft"><summary>Review an introduction draft <span>No message is sent</span></summary><label class="sr-only" for="draft-${s.id}">Editable introduction draft</label><textarea id="draft-${s.id}">${esc(s.draft)}</textarea><button type="button" class="btn" data-action="warm-copy" data-id="${esc(s.id)}">${icon('file')} Copy draft</button> <button type="button" class="btn ghost" data-action="warm-save-draft" data-id="${esc(s.id)}">Save edits</button></details>` : ''}</article>`; }).join('') || '<div class="card"><p>No tasks will be generated from unsupported or conflicting context.</p><a href="#workmap" class="btn">Review knowledge routes</a></div>'}${ready ? `<div class="warm-approve"><label class="check-line"><input name="confirm" type="checkbox" required>I reviewed the sources and want these selected tasks in my workspace.</label><button class="btn primary" type="submit">Approve selected steps ${icon('arrow')}</button><p class="micro">Creates real tasks. Does not grant access, contact a colleague or certify completion.</p><p class="form-error" id="warm-error" role="alert"></p></div>` : ''}</form>${approved && goal.status === 'open' ? `<div class="warm-finish">${btn('warm-finish', 'Confirm goal outcome', 'check', '', id)}<span class="micro">Only mark complete after you verify the real result.</span></div>` : ''}</section><aside><div class="card warm-evidence"><div class="eyebrow">WHY THIS PERSON · WHY NOW</div><h2>The original context</h2>${(b.evidence || []).map(r => `<div class="warm-evidence-person"><div class="flex">${avatar(r.person_name)}<div><strong>${esc(r.person_name)}</strong><small>${esc(cap(r.route_role))} · ${esc(fmtDate(r.effective_on, true))}</small></div></div><blockquote>${esc(r.quote)}</blockquote><a href="#note/${r.note_id}">Open original source ${icon('arrow')}</a></div>`).join('') || '<p>No supported source yet.</p>'}${b.history?.length ? `<div class="warm-history"><strong>What changed</strong>${b.history.map(h => `<p>${esc(h.person_name)} · ${esc(cap(h.status))}<small>${esc(fmtDate(h.effective_on, true))}</small></p>`).join('')}</div>` : ''}</div><section class="warm-unknowns"><span class="eyebrow">STILL UNKNOWN</span><h3>Keep these questions open.</h3><ul>${(b.unknowns || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></section><p class="micro mt">${esc(b.disclosure || '')}</p></aside></div>`}`; }
    async function connect() { connections = await api('/api/connections'); const providers = connections.providers; return header('CHAT IS THE ENTRY POINT', 'Keep the conversation.<br><em>Bring the context.</em>', 'Save a message where you work. Review it privately before it becomes memory.') + `<div class="warm-connect-steps"><span><b>1</b> Link your own account</span>${icon('arrow')}<span><b>2</b> Choose one message</span>${icon('arrow')}<span><b>3</b> Confirm the context</span></div><div class="integration-grid">${['slack', 'discord'].map(p => `<section class="card warm-provider"><div class="provider-symbol ${p}">${p === 'slack' ? '#' : 'D'}</div><span class="integration-status">${providers[p].configured ? 'Server configured · link your account' : 'Operator setup required'}</span><h2>${cap(p)}</h2><p>${p === 'slack' ? 'Save a selected message or use /threadline. Private responses; no channel history crawler.' : 'Install to your user account. Remember one selected message or privately search your saved context.'}</p>${providers[p].configured ? btn('chat-code', 'Link my ' + cap(p) + ' account', 'link', 'primary', p) : `<a class="btn" href="/guide-warm.html#${p}" target="_blank" rel="noopener">Setup instructions ${icon('arrow')}</a>`}<p class="micro">Signed interactions implemented. Your operator must verify installation and delivery on the actual platform.</p></section>`).join('')}<section class="card warm-provider"><div class="provider-symbol manual">+</div><span class="integration-status">Available without a connector</span><h2>WeChat & browser</h2><p>Paste the messages you select. Or use the included selection-only browser extension.</p><a class="btn" href="#capture">Save a conversation ${icon('arrow')}</a><p class="micro">No login sharing or full-account access. No native iMessage bridge in this release. Calendar reminders remain file exports.</p></section></div>${connections.connections.length ? `<section class="card mt"><h2>Your linked accounts</h2>${connections.connections.map(c => `<div class="warm-binding"><div class="grow"><strong>${cap(c.platform)}</strong><small>${esc(c.actor_id)} · ${esc(c.scope_id)}</small></div>${btn('chat-unlink', 'Disconnect', 'exit', '', c.id)}</div>`).join('')}</section>` : ''}<div class="section-heading"><h2>Review inbox <span class="count">${connections.inbox.length}</span></h2><button class="btn ghost" data-nav="connect">Refresh</button></div><p class="micro">${esc(connections.boundary)}</p><div class="warm-inbox">${connections.inbox.map(m => `<article class="card"><div class="source-top"><strong>${esc(cap(m.platform))} · Selected message</strong><span>${esc(fmtDate(m.occurred_on, true))}</span></div><blockquote>${esc(m.body)}</blockquote><p class="micro">Original platform author: ${esc(m.author_id || 'Unknown')}. This is not automatically your Threadline contact.</p><div class="head-actions">${btn('chat-confirm', 'Confirm and save', 'check', 'primary', m.id)}${btn('chat-dismiss', 'Discard', 'trash', 'ghost', m.id)}</div></article>`).join('') || '<section class="warm-inbox-empty"><span>' + icon('file') + '</span><h3>Your selected messages will land here.</h3><p>Nothing is imported in the background. You choose what to keep.</p></section>'}</div>`; }

    // Focus is a presentation of the same authenticated goals, plans and tasks.
    // No alternate planner, fixture branch, automatic approval or persistent schema is introduced.
    const goalPath = id => (state.view === 'first-task' ? 'first-task/' : 'warm-goal/') + id;
    // This focused view renders the same authenticated records as the full workspace.
    // Plain-language labels never change the saved quotation or the approval rules.
    async function firstTaskPage(id) {
        if (!id) {
            data = await api('/api/warm');
            const current = data.goals.find(g => g.status === 'open') || data.goals.find(g => g.status === 'done');
            if (current) id = current.id;
        }
        if (!id) {
            goal = null;
            return `<div class="firstwin"><div class="firstwin-empty"><p class="eyebrow">THREADLINE / WARM START</p><h1>New at work?<br><em>Know who to ask.</em></h1><p>Find a colleague, read the original note,<br>and choose your next step.</p>${btn('warm-new-goal', 'Set my first task', 'plus', 'primary')}<a href="#capture" class="btn">Save a team note</a><div class="firstwin-empty-note">Start with one task and a note you have permission to use.<br>Your account starts empty. No inbox scanning.</div></div></div>`;
        }
        goal = await api('/api/warm/goals/' + id);
        const p = goal.plans[0], b = p?.body || {}, stale = p?.status === 'stale';
        const ready = p?.status === 'proposed' && b.resolution === 'ready';
        const approved = p?.status === 'approved', tasks = p?.tasks || [];
        const ask = (b.steps || []).find(x => x.kind === 'ask');
        const sourceReviewAction = state.data.ai.configured && !goal.routes.some(route => route.usable) ? btn('warm-source-review', 'Read a team note with AI', 'search', 'primary', id) : '';
        const owner = (b.evidence || []).find(x => x.id === ask?.route_id);
        const completed = tasks.filter(t => t.status === 'done').length;
        const previous = (b.history || []).filter(x => x.status === 'superseded' && x.id === owner?.supersedes_id);
        const mode = p?.mode === 'openai' ? (b.provider === 'vertex' ? 'Gemini on Vertex AI · ' + b.model : 'AI-assisted wording') : 'Plan: saved notes · AI wording off';
        const roleLabel = {approver:'Can approve this request, according to your note.',guide:'Can help with this topic, according to your note.',mentor:'Can guide your learning, according to your note.'};
        // Render the planner's existing evidence without choosing a winner or
        // rebuilding responsibility rules in the view. Stale plan bodies stay hidden.
        const pausedEvidence = (b.evidence || []).filter(r => r.topic === goal.topic || !r.topic);
        const pausedSources = pausedEvidence.length ? `<section class="firstwin-paused-sources" aria-labelledby="paused-sources-title" data-testid="blocked-evidence">
            <div class="firstwin-paused-heading"><p class="eyebrow">THE SOURCES BEHIND THIS PAUSE</p><h3 id="paused-sources-title">${pausedEvidence.length === 2 ? 'Read both records before deciding.' : 'Review these records before deciding.'}</h3><p>A later note does not choose someone for you. Check the original words and confirm the current responsibility with your team.</p></div>
            <div class="firstwin-evidence-grid">${pausedEvidence.map(r => {
                const conflicts = pausedEvidence.some(other => other.id !== r.id && other.route_role === r.route_role && other.contact_id !== r.contact_id);
                const replaced = (goal.routes || []).filter(previousRoute => previousRoute.id === r.supersedes_id && previousRoute.status === 'superseded');
                return `<article class="firstwin-evidence-record"><div class="firstwin-evidence-record-head"><span class="firstwin-evidence-role">${esc(cap(r.route_role))}</span><span class="firstwin-evidence-status">${conflicts ? 'Different people · same role' : 'Confirmed by you'}</span></div><h4>${esc(r.person_name)}</h4><p class="firstwin-evidence-role-help">${esc(roleLabel[r.route_role] || 'Named in your saved note.')}</p><blockquote>${esc(r.quote)}</blockquote><div class="firstwin-evidence-origin"><strong>${esc(r.source_title)}</strong><span>Original note date: <time datetime="${esc(r.effective_on)}">${esc(fmtDate(r.effective_on, true))}</time></span><a href="#note/${esc(r.note_id)}">Read original ${icon('arrow')}</a></div>${replaced.map(previousRoute => `<p class="firstwin-evidence-history">You replaced the earlier ${esc(previousRoute.route_role)} record for ${esc(previousRoute.person_name)} · ${esc(fmtDate(previousRoute.effective_on, true))}. It is superseded.</p>`).join('')}</article>`;
            }).join('')}</div><p class="firstwin-evidence-boundary">A guide helps you understand the task. A guide is not an access approver. This page grants no access and sends no messages.</p>
            <div class="firstwin-evidence-next"><div><strong>Clarify first. Then check again.</strong><p>Use the people &amp; notes map to review or withdraw a responsibility record. Nothing is changed until you choose.</p></div><a class="btn" href="#workmap">Clarify people &amp; notes ${icon('arrow')}</a></div>
        </section>` : '';
        const steps = (b.steps || []).map((step, index) => {
            const t = tasks.find(x => x.step_id === step.id);
            return `<article class="firstwin-step ${t?.status === 'done' ? 'step-complete' : ''}">
                <div class="firstwin-step-top"><span class="firstwin-step-num">${String(index + 1).padStart(2, '0')}</span><div class="grow"><h3>${esc(step.title)}</h3></div>
                ${ready ? `<input type="checkbox" name="step_ids" value="${esc(step.id)}" checked aria-label="Include ${esc(step.title)}">` : t ? btn('warm-complete', t.status === 'done' ? 'Reopen' : 'Mark done', 'check', 'sm', t.id) : '<span class="micro">Not selected</span>'}</div>
                <p>${esc(step.instruction)}</p>
                ${step.draft ? `<details class="warm-draft firstwin-draft"><summary>Message draft <span>You send it yourself</span></summary><label class="sr-only" for="draft-${esc(step.id)}">Editable introduction</label><textarea id="draft-${esc(step.id)}">${esc(step.draft)}</textarea><button type="button" class="btn sm" data-action="warm-save-draft" data-id="${esc(step.id)}">Save edits</button> <button type="button" class="btn sm ghost" data-action="warm-copy" data-id="${esc(step.id)}">Copy</button><p class="micro">Nothing is sent automatically.</p></details>` : ''}
            </article>`;
        }).join('');
        let content;
        if (!p || stale) {
            content = `<section class="firstwin-pause ${stale ? 'has-change' : ''}" data-focus-state="${stale ? 'stale' : 'unplanned'}"><span class="firstwin-pause-icon">${icon(stale ? 'refresh' : 'search')}</span><p class="eyebrow">${stale ? 'SOMETHING CHANGED' : 'YOUR FIRST STEP'}</p><h2>${stale ? 'This plan is out of date.' : 'Find who can help.'}</h2><p>${stale ? 'The context behind this plan changed or needs review. Old instructions are hidden and unfinished steps are cancelled.<br>Check current notes, dates and permissions before making a fresh plan. Saving steps does not complete your first task.' : 'Use a team note and a colleague you have confirmed.<br>You decide which steps to save.'}</p>${goal.status === 'open' ? btn('warm-plan', stale ? 'Check again' : 'Find my next steps', 'arrow', 'primary', id) : btn('warm-reopen', 'Reopen this goal', 'refresh', '', id)}${sourceReviewAction}<a class="btn ghost" href="#workmap">Review people &amp; notes</a></section>`;
        } else if (!owner || b.resolution !== 'ready') {
            content = `<section class="firstwin-pause has-change ${pausedSources ? 'has-evidence' : ''}" data-focus-state="blocked"><span class="firstwin-pause-icon">${icon('shield')}</span><p class="eyebrow">CHECK BEFORE YOU ASK</p><h2>${esc(b.resolution === 'needs_clarification' ? 'The notes name different people.' : 'Who can help is not confirmed yet.')}</h2><p>${esc(b.resolution === 'needs_clarification' ? 'Two confirmed records name different people for the same role. We paused instead of choosing one.' : 'Add a dated team note and confirm the person it names.')}</p>${sourceReviewAction}${pausedSources || `<a class="btn ghost" href="#workmap">Review people &amp; notes ${icon('arrow')}</a>`}<p class="micro">No guessed person. No tasks created.${sourceReviewAction ? ' AI may suggest an annotation; you confirm the source and person first.' : ''}</p></section>`;
        } else {
            content = `<div class="firstwin-grid" data-focus-state="${approved ? 'approved' : 'proposed'}"><section class="firstwin-context"><div class="firstwin-person"><p class="eyebrow">WHO TO ASK</p><div class="firstwin-person-line">${avatar(owner.person_name)}<div><h2 data-testid="current-owner">${esc(owner.person_name)}</h2><p>${esc(roleLabel[owner.route_role] || 'Named in your saved note.')}</p></div></div><div class="firstwin-source-state">${icon('check')} Checked by you against the note</div></div>
            <div class="firstwin-source"><p class="eyebrow">WHY THIS PERSON</p><blockquote>${esc(owner.quote)}</blockquote><div class="firstwin-source-meta"><span>${esc(owner.source_title)}<small>Note date: ${esc(fmtDate(owner.effective_on, true))}</small></span><a class="text-link" href="#note/${esc(owner.note_id)}">Read original ${icon('arrow')}</a></div>${previous.length ? `<div class="firstwin-change"><span>YOU CONFIRMED THE CHANGE</span>${previous.map(x => `<p><span class="previous-person">${esc(x.person_name)}</span> ${icon('arrow')} <strong>${esc(owner.person_name)}</strong></p>`).join('')}<small>The old record is kept in the history.</small></div>` : ''}</div>
            <div class="firstwin-open"><p class="eyebrow">BEFORE YOU START</p><ul>${(b.unknowns || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></section>
            <section class="firstwin-actions"><div class="firstwin-actions-head"><div><p class="eyebrow">WHAT TO DO NEXT</p><h2>${approved ? 'Your task list' : 'Choose your steps'}</h2></div><span class="firstwin-count">${approved ? completed + ' / ' + tasks.length + ' done' : 'Not saved yet'}</span></div><form id="warm-approval">${steps}${ready ? `<div class="firstwin-approval"><label class="check-line"><input name="confirm" type="checkbox" required>I checked the note and want these steps.</label><button class="btn primary" type="submit">Add to my tasks ${icon('arrow')}</button><span class="micro">Only selected steps are saved. No messages are sent.</span><p class="form-error" id="warm-error" role="alert"></p></div>` : ''}</form>${approved && goal.status === 'open' ? `<div class="firstwin-outcome"><span>Your first task stays open until you record its result.</span>${btn('warm-finish', 'Record the result', 'check', 'sm ghost', id)}</div>` : ''}</section></div>`;
        }
        const topicHelp = /sandbox|test[ -]site/i.test(goal.title + ' ' + goal.topic) ? '<span class="firstwin-definition">Test site (sandbox): a safe place to practice without changing the live app.</span>' : '';
        return `<div class="firstwin"><header class="firstwin-head"><div><p class="eyebrow">MY FIRST TASK</p><h1>${esc(goal.title)}</h1><p class="firstwin-role">${esc(goal.role)}${goal.due_on ? ' · By ' + esc(fmtDate(goal.due_on, true)) : ''}</p></div><div class="firstwin-head-actions">${p && !stale && owner && goal.status === 'open' ? btn('warm-update-owner', 'Update who to ask', 'refresh', 'ghost', id) : ''}${btn('warm-edit-goal', 'Edit task', 'edit', 'ghost', id)}</div></header>${topicHelp}<section class="firstwin-done"><span>DONE WHEN</span><strong>${esc(goal.success)}</strong>${goal.status === 'done' ? badge('done', 'Reported complete by you') : '<span class="firstwin-goal-open">In progress</span>'}</section>${content}<footer class="firstwin-footer"><span>${icon('shield')} ${esc(mode)}</span>${state.data.demo ? '<span>Fictional practice data · Real app</span>' : '<span>Private to your account · You control every action</span>'}</footer><details class="firstwin-checks"><summary>How it works &amp; limits</summary><p>Each person is linked to an exact quotation and a date. You confirm who handles the task. When a note or permission changes, old plans stop until you check again.</p>${b.trace?.length ? `<ol>${b.trace.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}<p>${esc(b.disclosure || 'No live model call is required for the saved-note workflow.')} The app creates task records. It does not grant access, contact colleagues, or certify completed work.</p></details><a class="firstwin-details" href="#warm-goal/${esc(goal.id)}">All task details ${icon('arrow')}</a></div>`;
    }
    async function reviewOwnerUpdate() {
        if (!goal) return;
        const gid = goal.id, returnPath = goalPath(gid);
        data = await api('/api/warm');
        const sameTopic = data.routes.filter(r => r.topic === goal.topic && r.usable);
        const prior = sameTopic.find(r => r.route_role === 'approver') || sameTopic[0];
        if (!prior) return routeForm();
        const notes = state.data.notes.filter(n => n.occurred_on && n.id !== prior.note_id);
        const contacts = state.data.contacts.filter(c => !c.archived && c.contact_policy === 'allowed');
        if (!notes.length) {
            openModal('Save the new source first', '<p>Save the authorized update with its original event date, then return to this task. A newer upload alone is not a change in responsibility.</p><a href="#capture" class="btn primary" data-action="close-modal">Save the update</a>');
            return;
        }
        formModal('Who handles this now?', `<div class="firstwin-update-before"><span class="eyebrow">CURRENT RECORD</span><strong>${esc(prior.person_name)} · ${esc(cap(prior.route_role))}</strong><p>${esc(cap(goal.topic))} · event date ${esc(fmtDate(prior.effective_on, true))}</p></div><p>Choose a later message. Check who it names before updating the plan.</p><div class="form-grid">${select('note_id','Saved message', [['','Choose the new message'],...notes.map(n=>[n.id,n.title])])}${select('contact_id','Who it names', [['','Choose a colleague'],...contacts.map(c=>[c.id,c.name])])}</div><p class="micro" id="firstwin-update-date">No source selected.</p>${area('quote','Original words','','Check the name and what this person handles.') }<label class="check-line"><input type="checkbox" name="confirm" required>I can use this note. I checked the date and confirm this person replaces ${esc(prior.person_name)} for this task.</label>`, 'Confirm the change', async f => {
            await api('/api/warm/routes','POST',{topic:prior.topic,route_role:prior.route_role,contact_id:f.contact_id,note_id:f.note_id,quote:f.quote,supersedes_id:prior.id,confirm:f.confirm==='on'});
            await reload();go(returnPath);toast('Contact updated. Check the plan again.');
        }, {large:true});
        const form = $('#modal form'), node = form?.querySelector('[name=note_id]');
        if (node) node.addEventListener('change',async()=>{
            const requested = node.value;
            form.elements.quote.value = '';
            if (!requested) { $('#firstwin-update-date').textContent='No source selected.';return; }
            try {
                const n=await api('/api/notes/'+requested);
                if (!$('#modal').open || !form.isConnected || node.value!==requested) return;
                form.elements.quote.value=[...n.body].length<=4000?n.body:'';
                $('#firstwin-update-date').textContent='Written '+n.occurred_on+' · Check when the change happened, not when you uploaded it.';
            } catch(e) { if(form.isConnected) $('#firstwin-update-date').textContent=e.message; }
        });
    }
    async function routeForm() {
        data = await api('/api/warm');
        const contacts = state.data.contacts.filter(c => !c.archived && c.contact_policy === 'allowed'), notes = state.data.notes.filter(n => n.occurred_on);
        if (!contacts.length || !notes.length) {
            openModal('Start with a source and a person', '<p>Save an authorized, dated note and add the colleague it identifies. Then return here to confirm the responsibility.</p><a class="btn primary" href="#capture" data-action="close-modal">Save context first</a>');
            return;
        }
        formModal('Add a confirmed knowledge route', `<p class="muted">A source-backed responsibility, not an inferred biography.</p><div class="form-grid">${field('topic', 'Topic', 'text', goal?.topic || '', 'Use the same topic on your goal.', 'required placeholder="sandbox-access" maxlength="80"')}${select('route_role', 'Responsibility', [['guide', 'Guide'], ['approver', 'Approver'], ['mentor', 'Mentor']], 'guide')}${select('contact_id', 'Colleague', contacts.map(c => [c.id, c.name]))}${select('note_id', 'Dated source', notes.map(n => [n.id, n.title]))}</div>${area('quote', 'Exact source quotation', '', 'Paste the words that support this person and responsibility.')}<div class="form-grid">${select('supersedes_id', 'Replace an earlier route?', [['', 'No replacement'], ...data.routes.filter(r => r.status === 'active').map(r => [r.id, r.person_name + ' · ' + r.topic + ' · ' + r.route_role])])}${field('expires_on', 'Review by (optional)', 'date', '', 'Expired sources cannot support a new plan.')}</div><label class="check-line"><input type="checkbox" name="confirm" required>I have permission to keep this source and confirmed the person, responsibility and date.</label>`, 'Confirm route', async (f) => { await api('/api/warm/routes', 'POST', { ...f, confirm: f.confirm === 'on', supersedes_id: f.supersedes_id || null }); await reload(); go('workmap'); toast('Knowledge route confirmed. Older plans will be rechecked.'); }, { large: true });
        const form = $('#modal form'), selectNode = form?.querySelector('[name=note_id]');
        if (selectNode) {
            const fill = async () => { const requested = selectNode.value; const n = await api('/api/notes/' + requested); if ($('#modal').open && form.isConnected && selectNode.value === requested)
                form.elements.quote.value = [...n.body].length <= 4000 ? n.body : ''; };
            selectNode.addEventListener('change', fill);
            await fill();
        }
    }
    async function readSourceForGoal(gid) {
        const notes = state.data.notes.filter(note => note.occurred_on && note.characters <= 12000);
        if (!notes.length) {
            openModal('Start with one dated team note', '<p>Save a note you may use and add the colleagues it names. A profile title alone is not evidence.</p><a class="btn" href="#capture" data-action="close-modal">Save a team note</a>');
            return;
        }
        formModal('Read a team note with AI', `<p>The model receives this task, one selected note, and the names of saved colleagues mentioned in it. It proposes an unconfirmed annotation; it cannot establish responsibility, create tasks or send a message.</p>${select('note_id', 'Selected original note', [['', 'Choose one note'], ...notes.map(note => [note.id, note.title])])}<blockquote id="source-input-quote" class="source-review-quote">Choose a note to read its original words.</blockquote><p id="source-input-date" class="micro"></p><label class="check-line"><input type="checkbox" name="consent" required>I may share this task, the selected note and its named saved colleagues with ${esc(state.data.ai.providerLabel || 'the configured AI provider')}.</label>`, 'Read selected note', async (fields, form) => {
            if (!fields.note_id) throw new Error('Choose one dated note.');
            const userId = state.data.user.id;
            const started = await api('/api/warm/goals/' + gid + '/source-review', 'POST', { note_id: fields.note_id, consent: fields.consent === 'on' });
            toast('AI is reading the selected source. No person or task has been confirmed.');
            const review = await watchSourceReview(started.job_id, userId);
            if (review && form.isConnected && $('#modal').open && state.data?.user.id === userId)
                setTimeout(() => showSourceReview(review, started.job_id), 0);
        }, { large: true });
        const form = $('#edit-form'), selectNode = form.elements.note_id;
        selectNode.addEventListener('change', async () => {
            const requested = selectNode.value;
            form.elements.consent.checked = false;
            $('#source-input-quote').textContent = 'Loading original note…';
            $('#source-input-date').textContent = '';
            if (!requested) { $('#source-input-quote').textContent = 'Choose a note to read its original words.'; return; }
            try {
                const note = await api('/api/notes/' + requested);
                if (!form.isConnected || selectNode.value !== requested) return;
                $('#source-input-quote').textContent = note.body;
                $('#source-input-date').textContent = 'Original note date: ' + note.occurred_on;
            } catch (error) { if (form.isConnected) $('#source-input-quote').textContent = error.message; }
        });
    }
    async function watchSourceReview(jobId, userId) {
        let review;
        for (let attempt = 0; attempt < 60; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (state.data?.user.id !== userId) return;
            review = await api('/api/warm/source-reviews/' + jobId);
            if (review.state !== 'running') break;
        }
        if (review?.state !== 'succeeded') throw new Error(review?.error || 'This source review is not ready. Check Activity.');
        return review;
    }
    function showSourceReview(review, jobId) {
        if (review.status === 'needs_clarification') {
            openModal('This note needs clarification', `<section data-source-review="unclear"><p>${esc(review.explanation)}</p><ul>${review.questions.map(question => '<li>' + esc(question) + '</li>').join('')}</ul><p class="notice">No person was confirmed. No route or task was created.</p><p class="micro">${esc(review.model)} · Selected source only</p></section>`);
            return;
        }
        const candidate = review.candidate;
        formModal('Review the suggested person', `<section id="source-review-details" data-source-review="candidate"><p class="eyebrow">UNCONFIRMED SOURCE ANNOTATION</p><h3 data-testid="source-candidate">${esc(candidate.name)}</h3><p>${esc(review.explanation)}</p><blockquote class="source-review-quote">${esc(candidate.quote)}</blockquote><p class="micro">${esc(review.source.title)} · Original date ${esc(review.source.date)}</p><p class="micro">${esc(review.model)} · ${esc(review.disclosure)}</p></section><label class="check-line"><input id="source-review-confirm" type="checkbox" name="confirm" required>I may use this note. I checked the original words and date, and I confirm this saved colleague is the person to ask for this task.</label><p class="micro">Confirms a guide from this source. It grants no access and creates no tasks. Planning and task approval come next.</p>`, 'Confirm this person', async fields => {
            try {
                const confirmed = await api('/api/warm/source-reviews/' + jobId + '/confirm', 'POST', { confirm: fields.confirm === 'on' });
                await reload(); go(goalPath(confirmed.goal_id)); toast('You confirmed the source and person. Choose your next steps.');
            } catch (error) {
                $('#source-review-details')?.remove();
                const confirm = $('#source-review-confirm'); if (confirm) confirm.disabled = true;
                throw error;
            }
        }, { large: true });
    }
    async function handle(action, id) {
        if (!action.startsWith('warm-') && !action.startsWith('chat-'))
            return false;
        if (action === 'warm-update-owner') await reviewOwnerUpdate();
        if (action === 'warm-source-review') await readSourceForGoal(id);
        if (action === 'warm-new-goal') {
            formModal('What is your first task?', `<div class="form-grid">${field('title', 'First task', 'text', '', 'One thing you want to get done.', 'required maxlength="200" placeholder="Try the company test site"')}${field('role', 'Your new role', 'text', '', '', 'required maxlength="160" placeholder="New engineer"')}${field('topic', 'Topic', 'text', '', 'Use the same topic as your team note.', 'required maxlength="80" placeholder="sandbox-access"')}${field('due_on', 'Target date (optional)', 'date')}</div>${area('success', 'Done when', '', 'How will you know you finished? For example: show one test result to my teammate.')}`, 'Create goal', async (f) => { const g = await api('/api/warm/goals', 'POST', f); await reload(); go(goalPath(g.id)); toast('Your goal is saved.'); });
        }
        if (action === 'warm-revoke') {
            const r = data?.routes.find(r => r.id === id);
            if (r)
                formModal('Withdraw this knowledge route?', '<p>Its derived plans will be invalidated. The original note remains in your records.</p>', 'Withdraw route', async () => { await api('/api/warm/routes/' + id, 'DELETE', { version: r.version }); await reload(); toast('Knowledge route withdrawn.'); });
        }
        if (action === 'warm-save-draft') {
            const p = goal.plans[0];
            await api('/api/warm/plans/' + p.id + '/draft', 'PATCH', { version: p.version, step_id: id, draft: $('#draft-' + id).value });
            await reload();
            toast('Draft edits saved. Nothing sent.');
        }
        if (action === 'warm-edit-goal') {
            formModal('Edit your goal', `<div class="form-grid">${field('title', 'First task', 'text', goal.title, '', 'required maxlength="200"')}${field('role', 'Your role', 'text', goal.role, '', 'required maxlength="160"')}${field('topic', 'Topic', 'text', goal.topic, '', 'required maxlength="80"')}${field('due_on', 'Target date', 'date', goal.due_on || '')}</div>${area('success', 'Done when', goal.success)}<p class="micro">Changing the goal invalidates old plans. Recheck the context before continuing.</p>`, 'Save goal', async (f) => { await api('/api/warm/goals/' + id, 'PATCH', { ...f, version: goal.version }); await reload(); toast('Goal updated. Prepare a new plan.'); });
        }
        if (action === 'warm-route')
            await routeForm();
        if (action === 'warm-plan') {
            const enabled = state.data.ai.configured;
            formModal('Find my next steps', `<p>Check your saved notes and the person you confirmed.</p><p><strong>Nothing is added to your tasks until you approve.</strong></p>${enabled ? '<label class="check-line"><input name="use_ai" type="checkbox">Use the configured AI for plan wording. I may send this goal and its selected quotations to that provider.</label>' : '<div class="notice">Use saved notes only. AI is off; no notes are sent to a model.</div>'}`, 'Prepare plan', async (f) => { const user = state.data?.user.id; const r = await api('/api/warm/goals/' + id + '/plan', 'POST', { use_ai: !!f.use_ai, consent: !!f.use_ai }); if (r.job_id) {
                toast('AI is preparing a proposal. No tasks have been created.');
                let j;
                for (let i = 0; i < 50; i++) {
                    await new Promise(r => setTimeout(r, 1100));
                    if (state.data?.user.id !== user)
                        return;
                    j = await api('/api/jobs/' + r.job_id);
                    if (j.state !== 'running')
                        break;
                }
                if (j?.state !== 'succeeded')
                    throw new Error(j?.error || 'Check this job in Activity.');
            } await reload(); go(goalPath(id)); toast('Check the person and note, then choose your steps.'); });
        }
        if (action === 'warm-complete') {
            const t = state.data.tasks.find(t => t.id === id);
            if (t) {
                await api('/api/tasks/' + id, 'PATCH', { version: t.version, status: t.status === 'done' ? 'open' : 'done' });
                await reload();
                toast('Step updated. Record the overall result separately.');
            }
        }
        if (action === 'warm-finish')
            formModal('Confirm the real outcome', `<p>Mark this goal complete only after you verified:</p><div class="notice">${esc(goal.success)}</div><label class="check-line"><input name="confirm" type="checkbox" required>I checked the actual result. This is my completion report.</label>`, 'Mark goal complete', async () => { await api('/api/warm/goals/' + id, 'PATCH', { version: goal.version, status: 'done' }); await reload(); toast('Outcome recorded by you.'); });
        if (action === 'warm-reopen') {
            await api('/api/warm/goals/' + id, 'PATCH', { version: goal.version, status: 'open' });
            await reload();
        }
        if (action === 'warm-copy') {
            const t = $('#draft-' + id);
            try {
                await navigator.clipboard.writeText(t.value);
                toast('Draft copied. It has not been sent.');
            }
            catch {
                t.focus();
                t.select();
                toast('Press Ctrl/Cmd+C to copy. Nothing has been sent.');
            }
        }
        if (action === 'chat-code') {
            const c = await api('/api/connections/code', 'POST', { platform: id });
            openModal('Link your own ' + cap(id) + ' account', `<div class="notice">This one-time code grants your chat account access to your private Threadline records. Keep it secret.</div><p>In ${cap(id)}, run:</p><pre class="chat-command">${esc(c.command)}</pre><p>Expires in 10 minutes. After linking, close this dialog and refresh Connections.</p><p class="micro">The code disappears when you close this dialog. The database stores only its hash.</p>`);
        }
        if (action === 'chat-unlink')
            formModal('Disconnect this chat account?', '<p>This removes its pending inbox and stops private queries. Already confirmed notes remain in your workspace until you delete them.</p>', 'Disconnect', async () => { await api('/api/connections/' + id, 'DELETE', {}); await reload(); toast('Chat account disconnected.'); });
        if (action === 'chat-dismiss') {
            const x = connections.inbox.find(x => x.id === id);
            await api('/api/inbox/' + id + '/dismiss', 'POST', { version: x.version });
            await reload();
            toast('Temporary message discarded.');
        }
        if (action === 'chat-confirm') {
            const x = connections.inbox.find(x => x.id === id);
            formModal('Confirm the original context', `<blockquote class="warm-inbox-quote">${esc(x.body)}</blockquote><p class="micro">Platform author ${esc(x.author_id || 'unknown')} is not necessarily the person who submitted this message.</p><div class="form-grid">${field('title', 'Note title', 'text', 'Selected ' + cap(x.platform) + ' message', '', 'maxlength="200"')}${field('occurred_on', 'Original event date', 'date', x.occurred_on || '', 'Clear this date if it does not describe the original event.', 'max="' + localDay() + '"')}${select('contact_id', 'Who is this about?', [['', 'No person confirmed'], ...state.data.contacts.filter(c => !c.archived).map(c => [c.id, c.name])])}${field('reminder_title', 'Optional reminder', 'text', '', '', 'maxlength="300"')}</div><label class="check-line"><input name="confirm" type="checkbox" required>I may keep this text and have checked its speaker and date.</label>`, 'Save to my memory', async (f) => { await api('/api/inbox/' + id + '/confirm', 'POST', { version: x.version, confirm: f.confirm === 'on', title: f.title, occurred_on: f.occurred_on || null, contact_id: f.contact_id || null, reminder: f.reminder_title ? { title: f.reminder_title } : undefined }); await reload(); toast('Selected context saved.'); }, { large: true });
        }
        return true;
    }
    function bind(route) { if (['warm-goal', 'first-task'].includes(route) && $('#warm-approval'))
        $('#warm-approval').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.currentTarget, b = f.querySelector('[type=submit]'); if (!b)
            return; b.disabled = true; try {
            const p = goal.plans[0], fd = new FormData(f);
            await api('/api/warm/plans/' + p.id + '/approve', 'POST', { version: p.version, confirm: fd.has('confirm'), step_ids: fd.getAll('step_ids') });
            await reload();
            toast('Approved steps are now real tasks in your workspace.');
        }
        catch (err) {
            if ($('#warm-error'))
                $('#warm-error').textContent = err.message;
            b.disabled = false;
        } }); }
    return { home, map, goalPage, firstTaskPage, connect, handle, bind, clear() { data = null; goal = null; connections = null; } };
};
