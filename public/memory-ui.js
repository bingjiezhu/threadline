/* Personal memory workspace. All displayed content comes from owner-scoped APIs. */
const escape = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pretty = value => String(value || '').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const date = value => {
    if (!value) return 'Date unknown';
    const parsed = new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
    return Number.isNaN(parsed.valueOf()) ? String(value) : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(parsed);
};
const sourceHref = id => '#memory/source/' + encodeURIComponent(id);
const glyph = (kind = 'memory') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({ memory: '<path d="M8 4H5v16h14V8l-4-4H8Z"/><path d="M14 4v5h5M8 13h8M8 16h5"/>', spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>', plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>', check: '<path d="m5 12 4 4L19 6"/>', back: '<path d="M20 12H5m6-6-6 6 6 6"/>', people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M19 21v-3a6 6 0 0 0-2-4"/>' })[kind] || ''}</svg>`;
const tag = (text, style = '') => `<span class="mem-tag ${escape(style)}">${escape(text)}</span>`;
const statusTag = status => tag(pretty(status), status);
const button = (action, text, { id = '', extra = '', style = '', disabled = false } = {}) => `<button type="button" class="mem-button ${escape(style)}" data-memory-action="${escape(action)}" ${id ? `data-id="${escape(id)}"` : ''} ${extra} ${disabled ? 'disabled' : ''}>${escape(text)}</button>`;
const sourceForgotten = source => Boolean(source?.forgotten_at || source?.status === 'forgotten');
const sourceTitle = source => source?.title || (sourceForgotten(source) ? 'Forgotten source' : 'Untitled memory');
const list = value => Array.isArray(value) ? value : [];

/** api(path, method, body) is the host's authenticated + CSRF protected API helper. */
export async function mountMemoryUI({ root, api, navigate = path => { location.hash = '#' + path; }, toast = () => {}, route = 'memory', sourceId = null, workspace = null }) {
    if (!root || typeof api !== 'function') throw new Error('A workspace root and API helper are required.');
    let memory = { sources: [], items: [], stats: {}, relationships: {}, conflicts: [] };
    let records = workspace;
    let history = { threads: [], runs: [], messages: [] };
    let threadId = null, captureOpen = false, editorOpen = false, pendingForget = false;
    let search = '', filter = 'sources', entity = '', kind = '', originFilter = '';
    let busy = false, alert = '', question = '', revision = 0, detailSource = null;
    let captureDraft = {}, editDraft = {};
    let vault = null, vaultError = '', syncNotice = '', markdown = null, markdownOpen = false;
    let searchHits = new Map(), searchPending = false, searchError = '', searchTimer = null, searchGeneration = 0;
    const sources = () => list(memory.sources);
    const items = () => list(memory.items);
    const currentSource = () => detailSource?.id === sourceId ? detailSource : sources().find(item => item.id === sourceId);
    const isLive = () => root.isConnected;
    const field = (name, label, value = '', type = 'text', attrs = '') => `<label class="mem-field"><span>${escape(label)}</span><input name="${escape(name)}" type="${escape(type)}" value="${escape(value)}" ${attrs}></label>`;
    const select = (name, label, options, value = '') => `<label class="mem-field"><span>${escape(label)}</span><select name="${escape(name)}">${options.map(([id, text]) => `<option value="${escape(id)}" ${String(value || '') === String(id) ? 'selected' : ''}>${escape(text)}</option>`).join('')}</select></label>`;
    const contacts = () => list(records?.contacts).filter(item => !item.archived);
    const projects = () => list(records?.projects).filter(item => item.status !== 'archived');
    const consent = purpose => `<label class="mem-consent"><input type="checkbox" name="use_ai" ${memory.agent?.configured === false ? 'disabled' : ''}><span><strong>Use Gemini for this ${escape(purpose)}${memory.agent?.configured === false ? ' · not configured' : ''}</strong><small>${purpose === 'answer' ? 'Send this question and retrieved source excerpts to Gemini. Leave off to use local memory retrieval.' : 'Send this selected source to Gemini to suggest memories. Leave off to organize locally.'} Nothing is confirmed or acted on automatically.</small></span></label>`;
    const meta = item => `<div class="mem-meta">${item.occurred_on ? `<span>${escape(date(item.occurred_on))}</span>` : '<span>Date unknown</span>'}${item.contact_name || item.project_contact_name ? `<a href="#person/${encodeURIComponent(item.contact_id || item.project_contact_id)}">${escape(item.contact_name || item.project_contact_name)}</a>` : ''}${item.project_name ? `<a href="#project/${encodeURIComponent(item.project_id)}">${escape(item.project_name)}</a>` : ''}</div>`;
    const smallEmpty = (heading, text) => `<div class="mem-empty">${glyph('memory')}<h3>${escape(heading)}</h3><p>${escape(text)}</p></div>`;
    const errorPanel = () => alert ? `<div class="mem-alert" role="alert">${escape(alert)}</div>` : '';
    const isActiveItem = item => ['confirmed', 'proposed'].includes(item.status);
    const matches = item => {
        const source = sources().find(source => source.id === item.source_id) || item;
        const haystack = [item.text, item.quote, item.topic, item.title, item.body, item.excerpt, source.title, item.contact_name, item.project_name, item.project_contact_name, source.contact_name, source.project_name, source.project_contact_name, ...list(source.imports).flatMap(info => [info.provider, info.path])].join(' ').toLowerCase();
        const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const textMatches = !terms.length || searchHits.has(item.source_id || item.id) || terms.every(term => haystack.includes(term));
        const sourceMatches = !originFilter || (['codex','claude'].includes(originFilter) ? list(source.imports).some(info=>info.provider===originFilter) : source.origin===originFilter);
        return textMatches && sourceMatches && (!entity || entity === 'person:' + (item.contact_id || item.project_contact_id || source.contact_id || source.project_contact_id) || entity === 'project:' + (item.project_id || source.project_id) || entity === 'topic:' + item.topic) && (!kind || item.kind === kind);
    };
    function itemCard(item, { sourceLink = true, full = false } = {}) {
        const canReview = item.status === 'proposed' && !sourceForgotten(sources().find(source => source.id === item.source_id));
        const provenance = typeof item.provenance === 'object' ? [item.provenance?.provider, item.provenance?.model].filter(Boolean).join(' · ') : item.provenance;
        return `<article class="mem-item ${escape(item.status)}" data-memory-item="${escape(item.id)}"><div class="mem-item-top">${tag(pretty(item.kind || 'memory'), 'kind')}${statusTag(item.status)}${item.topic ? tag(item.topic) : ''}</div><h3>${escape(item.text || item.quote || 'Memory')}</h3>${meta(item)}${item.quote ? `<blockquote>${escape(item.quote)}</blockquote>` : ''}${item.stale_reason ? `<p class="mem-caution">${escape(item.stale_reason)}</p>` : ''}${item.status === 'superseded' ? '<p class="mem-caution">A newer confirmed memory replaces this one.</p>' : ''}<footer>${sourceLink ? `<a class="mem-source-link" href="${sourceHref(item.source_id)}">${glyph('memory')}${escape(item.source_title || sources().find(source => source.id === item.source_id)?.title || 'Open original source')}</a>` : `<span class="mem-caption">Source revision ${escape(item.source_version || 1)}${full && provenance ? ' · ' + escape(provenance) : ''}</span>`}${canReview ? `<div class="mem-review-actions">${button('reject-item', 'Dismiss', { id: item.id, disabled: busy })}${button('confirm-item', 'Keep this memory', { id: item.id, style: 'primary', disabled: busy })}</div>` : ''}</footer></article>`;
    }
    function importInfo(source) {
        if (!list(source.imports).length) return '';
        return `<section class="mem-panel mem-import-source"><h2>Imported agent memory</h2>${source.imports.map(info => {
            const parts = sources().flatMap(other => list(other.imports).filter(p => p.provider === info.provider && p.hash === info.hash).map(p => ({...p, source_id:other.id}))).sort((a,b)=>a.part_index-b.part_index);
            const uniqueParts = [...new Map(parts.map(part=>[part.part_index,part])).values()];
            return `<div class="mem-import-source-row"><strong>${escape(info.provider==='codex'?'Codex':'Claude')}</strong> · <span>${escape(info.path)}</span>${info.part_count>1?` · Part ${info.part_index} of ${info.part_count}`:''}<p class="mem-caption">Imported ${escape(date(info.imported_at))}. ${info.edited_since_import?'This source has been edited since import.':'Original file text is preserved.'} The file on your computer is unchanged.</p>${uniqueParts.length>1?`<div class="mem-heading-actions">${uniqueParts.map(part=>`<a class="mem-button" href="${sourceHref(part.source_id)}">Part ${part.part_index}</a>`).join('')}</div>`:''}</div>`;
        }).join('')}</section>`;
    }
    function sourceCard(source) {
        const sourceItems = items().filter(item => item.source_id === source.id);
        const origin = list(source.imports).length ? [...new Set(source.imports.map(info=>info.provider==='codex'?'Codex':'Claude'))].join(' / ') : (source.origin === 'web' ? 'Web note' : 'Saved note');
        const importedFiles = [...new Map(list(source.imports).filter(info => info.path).map(info => [info.provider + ':' + info.path, info])).values()];
        const importPaths = importedFiles.map(info => `<div class="mem-source-import" title="${escape((info.provider === 'codex' ? 'Codex' : 'Claude') + ' · ' + info.path)}"><strong>${escape(info.provider === 'codex' ? 'Codex' : 'Claude')}</strong><span>${escape(info.path)}</span>${info.part_count > 1 ? `<small>Part ${escape(info.part_index)} of ${escape(info.part_count)}</small>` : ''}</div>`).join('');
        const pending = sourceItems.filter(item => item.status === 'proposed').length;
        const confirmed = sourceItems.filter(item => item.status === 'confirmed').length;
        const displayExcerpt = searchHits.get(source.id)?.body_excerpt || source.excerpt || source.body || '';
        return `<a class="mem-source-card" href="${sourceHref(source.id)}"><div class="mem-source-top"><span class="mem-source-icon">${glyph('memory')}</span><span class="mem-caption">${escape(origin)} · ${escape(date(source.occurred_on))}</span></div><h3>${escape(sourceTitle(source))}</h3>${importPaths}<p>${escape(sourceForgotten(source) ? 'The original content was removed.' : displayExcerpt.slice(0, 400))}</p><div class="mem-card-bottom">${pending ? tag(`${pending} to review`, 'proposed') : confirmed ? tag(`${confirmed} kept`, 'confirmed') : tag(sourceForgotten(source) ? 'Forgotten' : 'Ready to organize')}<span>${source.contact_name || source.project_contact_name ? escape(source.contact_name || source.project_contact_name) : source.project_name ? escape(source.project_name) : 'Personal memory'} ${glyph('arrow')}</span></div></a>`;
    }
    function captureForm() {
        if (!captureOpen) return '';
        return `<section class="mem-panel mem-capture" aria-labelledby="memory-capture-title"><div class="mem-section-head"><div><span class="mem-eyebrow">CAPTURE</span><h2 id="memory-capture-title">Give your agent something to remember.</h2></div>${button('close-capture', 'Close')}</div><form data-memory-form="capture"><div class="mem-form-grid">${field('title', 'Title', captureDraft.title || '', 'text', 'required maxlength="200" placeholder="A conversation, an idea, a change of plan…"')}${field('occurred_on', 'When did it happen?', captureDraft.occurred_on || '', 'date')}${select('contact_id', 'Person', [['', 'No person selected'], ...contacts().map(item => [item.id, item.name])], captureDraft.contact_id)}${select('project_id', 'Project', [['', 'Personal / no project'], ...projects().map(item => [item.id, item.name])], captureDraft.project_id)}</div><label class="mem-field"><span>Original note or conversation</span><textarea name="body" required maxlength="20000" rows="6" placeholder="Paste or write what happened. Keep the original wording so every memory can be checked.">${escape(captureDraft.body || '')}</textarea></label>${consent('source')}<div class="mem-form-bottom"><p>Saved to your workspace. Suggested memories wait for your review.</p><button class="mem-button primary" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Saving and organizing…' : 'Save & organize'}</button></div></form></section>`;
    }
    const count = value => Array.isArray(value) ? value.length : Number.isFinite(Number(value)) ? Number(value) : 0;
    const vaultIssues = () => list(vault?.issues);
    const vaultPath = () => vault?.workspace_path || vault?.root || '';
    function markdownPath(source) {
        if (markdown?.source_id === source.id && markdown.path) return markdown.path;
        return source.markdown_path || list(vault?.files).find(file => (file.source_id || file.note_id || file.id) === source.id)?.path || '';
    }
    function storageCard() {
        if (vaultError) return `<section class="mem-vault mem-vault-warning" aria-label="Markdown library status"><div><h2>Local Markdown library</h2><p role="alert">The library status could not be checked. ${escape(vaultError)}</p></div>${button('refresh', 'Check again', { disabled: busy })}</section>`;
        if (!vault) return '';
        if (!vault.enabled) return `<section class="mem-vault" aria-label="Markdown library status"><div><h2>Markdown library is not enabled</h2><p>Your saved sources are available below. Configure a local memory folder to store them as Markdown files.</p></div></section>`;
        const issues = vaultIssues(), pending = count(vault.pending), files = count(vault.file_count ?? vault.files);
        const fileCount = files === 1 ? '1 Markdown file' : `${files} Markdown files`;
        return `<section class="mem-vault ${issues.length ? 'mem-vault-warning' : ''}" aria-label="Markdown library status"><div class="mem-vault-main"><span class="mem-source-icon">${glyph('memory')}</span><div><div class="mem-vault-heading"><h2>Local Markdown library</h2>${tag(fileCount)}</div><p>Readable .md files hold your original notes. Refresh here after editing them in your memory folder.</p>${pending ? `<p class="mem-caution">${pending} file${pending === 1 ? '' : 's'} awaiting synchronization.</p>` : ''}${syncNotice ? `<p class="mem-vault-notice" role="status">${escape(syncNotice)}</p>` : ''}${vaultPath() ? `<details class="mem-vault-folder"><summary>Show memory folder</summary><code>${escape(vaultPath())}</code>${button('copy-vault-path', 'Copy folder path')}</details>` : ''}</div></div>${button('sync-vault', busy ? 'Refreshing files…' : 'Refresh from files', { disabled: busy })}${issues.length ? `<div class="mem-vault-issues" role="alert"><strong>${issues.length} file${issues.length === 1 ? '' : 's'} need attention</strong><p>No conflicting file is overwritten. Check the file in your memory folder, then refresh again.</p><ul>${issues.map(issue => `<li><div><strong>${escape(pretty(issue.code || 'File issue'))}</strong>${issue.path ? `<code>${escape(issue.path)}</code>` : ''}<p>${escape(issue.message || 'Review this file before continuing.')}</p></div>${issue.source_id ? `<a href="${sourceHref(issue.source_id)}">Review saved source</a>` : ''}</li>`).join('')}</ul></div>` : ''}</section>`;
    }
    function markdownCard(source) {
        if (sourceForgotten(source) || !vault?.enabled) return '';
        const path = markdownPath(source), issue = vaultIssues().find(item => item.source_id === source.id);
        return `<section class="mem-source-file" aria-label="Stored Markdown source"><div><strong>Stored as Markdown</strong>${path ? `<code>${escape(path)}</code>` : '<p>Open the file to see its stored path and contents.</p>'}${issue ? `<p class="mem-caution">${escape(issue.message || pretty(issue.code))}</p>` : ''}</div><div class="mem-heading-actions">${button('view-markdown', markdownOpen ? 'Hide Markdown' : 'View Markdown', { disabled: busy })}${button('download-markdown', 'Download .md', { disabled: busy })}</div>${markdownOpen && markdown?.source_id === source.id ? `<div class="mem-markdown-preview"><p class="mem-caption">Contents read from the saved file, including its metadata.</p><pre tabindex="0" aria-label="Stored Markdown file">${escape(markdown.content)}</pre></div>` : ''}</section>`;
    }
    async function readMarkdown() {
        const source = currentSource();
        if (!source || sourceForgotten(source)) throw new Error('This source is no longer available.');
        const result = await api('/api/memory/sources/' + encodeURIComponent(source.id) + '/markdown');
        if (typeof result.content !== 'string' || !result.filename) throw new Error('The stored Markdown file could not be read.');
        markdown = { ...result, source_id: source.id };
        return markdown;
    }
    function memoryPage() {
        const stats = memory.stats || {};
        const liveSources = sources().filter(source => !sourceForgotten(source));
        const pending = items().filter(item => item.status === 'proposed');
        const confirmed = items().filter(item => item.status === 'confirmed');
        const filteredItems = items().filter(item => (filter === 'all' ? isActiveItem(item) : filter === 'sources' ? false : item.status === filter) && matches(item));
        const filteredSources = liveSources.filter(source => matches(source) || items().some(item => item.source_id === source.id && matches(item)));
        const counts = [['Sources', stats.source_count ?? liveSources.length], ['Kept memories', stats.confirmed ?? confirmed.length], ['To review', stats.proposed ?? pending.length]];
        const personGroups = list(records?.contacts).map(contact => [contact, liveSources.filter(source => (source.contact_id || source.project_contact_id) === contact.id).length]).filter(([, n]) => n);
        const projectGroups = list(records?.projects).map(project => [project, liveSources.filter(source => source.project_id === project.id).length]).filter(([, n]) => n);
        const topics = [...new Set(items().filter(isActiveItem).map(item => item.topic).filter(Boolean))];
        return `<header class="mem-page-heading"><div><span class="mem-eyebrow">YOUR PERSONAL MEMORY</span><h1>A place for what you want to remember.</h1><p>Keep notes, conversations and ideas together. Connect them to your people, projects and next steps.</p></div><div class="mem-heading-actions"><a class="mem-button" href="#memory/import">Import local memory</a><a class="mem-button" href="#agent">${glyph('spark')}Ask Threadline</a>${button('open-capture', 'Add a memory', { style: 'primary' })}</div></header>${errorPanel()}<section class="mem-summary" aria-label="Saved memory counts"><strong>${['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? 'Saved locally on this computer' : 'Saved on the machine running Threadline'}</strong><div class="mem-hero-stats">${counts.map(([name, count]) => `<div><strong>${escape(count)}</strong><span>${escape(name)}</span></div>`).join('')}</div></section>${storageCard()}${captureForm()}<div class="mem-layout"><section class="mem-library"><div class="mem-section-head"><div><h2>Your memory</h2><p>Original sources and the memories you choose to keep.</p></div>${button('refresh', 'Refresh', { disabled: busy })}</div><label class="mem-search">${glyph('search')}<input type="search" data-memory-search placeholder="Search people, projects, details…" value="${escape(search)}" aria-label="Search personal memories"></label><div class="mem-library-controls"><div class="mem-tabs" role="group" aria-label="Memory status">${[['all', 'All memories'], ['proposed', `To review${pending.length ? ' · ' + pending.length : ''}`], ['confirmed', 'Kept'], ['sources', 'Sources'], ['stale', 'Needs refresh']].map(([value, text]) => button('filter', text, { id: value, style: filter === value ? 'selected' : '' })).join('')}</div><select data-memory-origin aria-label="Filter source">${[['','All sources'],['web','Web notes'],['codex','Codex'],['claude','Claude']].map(([value,name])=>`<option value="${value}" ${originFilter===value?'selected':''}>${name}</option>`).join('')}</select><select data-memory-kind aria-label="Filter memory type"><option value="">All types</option>${[...new Set(items().map(item => item.kind).filter(Boolean))].map(value => `<option value="${escape(value)}" ${value === kind ? 'selected' : ''}>${escape(pretty(value))}</option>`).join('')}</select></div>${entity ? `<div class="mem-filter-notice">Showing ${escape(entityLabel(entity))} ${button('clear-entity', 'Clear filter')}</div>` : ''}<div data-memory-results>${searchPending ? '<p class="mem-caption" role="status">Searching all source text…</p>' : searchError ? `<p class="mem-alert" role="alert">${escape(searchError)}</p>` : search.trim() ? `<p class="mem-caption" role="status">${filteredSources.length} matching source${filteredSources.length === 1 ? '' : 's'} · full-text matches and saved memories</p>` : ''}${filter === 'sources' ? `<div class="mem-source-grid">${filteredSources.map(sourceCard).join('')}</div>${!filteredSources.length ? smallEmpty('No sources found', liveSources.length ? 'Try a different search or clear your filter.' : 'Add a conversation, meeting note or personal update to start your memory.') : ''}` : filteredItems.map(item => itemCard(item)).join('') || smallEmpty(filter === 'proposed' ? 'All caught up.' : filter === 'stale' ? 'Your reviewed memories are up to date.' : 'Start with something worth remembering.', filter === 'proposed' ? 'New suggestions will appear here for you to review.' : filter === 'stale' ? 'When a source changes, affected memories will appear here for another look.' : 'Add an original note. Your agent will suggest the useful details, with a quotation for each one.')}</div>${filter !== 'sources' && liveSources.length ? `<div class="mem-section-head mem-later"><h2>Recent sources</h2>${button('filter', 'View all sources', { id: 'sources' })}</div><div class="mem-source-grid">${liveSources.slice(0, 4).map(sourceCard).join('')}</div>` : ''}</section><aside class="mem-side"><section class="mem-panel mem-connections"><h2>Follow a thread</h2><p>Explore memories around a person, project or topic.</p>${personGroups.length ? `<h3>${glyph('people')} People</h3>${personGroups.map(([item, n]) => button('entity', item.name, { id: 'person:' + item.id, extra: `aria-label="${escape(item.name)}, ${n} saved sources"`, style: entity === 'person:' + item.id ? 'selected' : '' })).join('')}` : ''}${projectGroups.length ? `<h3>${glyph('memory')} Projects</h3>${projectGroups.map(([item, n]) => button('entity', item.name, { id: 'project:' + item.id, extra: `aria-label="${escape(item.name)}, ${n} saved sources"`, style: entity === 'project:' + item.id ? 'selected' : '' })).join('')}` : ''}${topics.length ? `<h3>Topics</h3><div class="mem-topic-list">${topics.slice(0, 14).map(topic => button('entity', topic, { id: 'topic:' + topic, style: entity === 'topic:' + topic ? 'selected' : '' })).join('')}</div>` : ''}${!personGroups.length && !projectGroups.length && !topics.length ? '<p class="mem-caption">Links appear as you save notes about people and projects.</p>' : ''}</section>${Number(stats.conflict_count) > 0 ? `<section class="mem-panel mem-conflict-callout"><span class="mem-eyebrow">${escape(stats.conflict_count)} POSSIBLE CHANGES</span><h3>Some details may have changed.</h3><p>Compare the dated originals before deciding what is current. Different statements are not always a contradiction.</p>${button('filter', 'Review kept memories', { id: 'confirmed' })}</section>` : ''}<section class="mem-agent-nudge"><span class="mem-agent-mark">${glyph('spark')}</span><h3>Bring the context to your next conversation.</h3><p>“What should I remember before my next conversation?”</p><a href="#agent">Ask Threadline ${glyph('arrow')}</a></section></aside></div>`;
    }
    function entityLabel(value) {
        const [type, ...parts] = value.split(':'); const id = parts.join(':');
        return type === 'person' ? list(records?.contacts).find(item => item.id === id)?.name || 'this person' : type === 'project' ? list(records?.projects).find(item => item.id === id)?.name || 'this project' : id;
    }
    function sourcePage() {
        const source = currentSource();
        if (!source) return `<a class="mem-back" href="#memory">${glyph('back')}All memories</a>${smallEmpty('This source is not available', 'It may have been removed, or belong to another workspace.')}`;
        const sourceItems = items().filter(item => item.source_id === source.id);
        const forgotten = sourceForgotten(source);
        return `<a class="mem-back" href="#memory">${glyph('back')}All memories</a><header class="mem-page-heading"><div><span class="mem-eyebrow">ORIGINAL SOURCE · REVISION ${escape(source.version || 1)}</span><h1>${escape(sourceTitle(source))}</h1>${meta(source)}</div><div class="mem-heading-actions">${!forgotten ? button('edit-source', editorOpen ? 'Cancel edit' : 'Edit source', {disabled:source.markdown_unavailable}) + button('forget-source', 'Forget source', { style: 'danger' }) : statusTag('forgotten')}</div></header>${errorPanel()}${markdownCard(source)}${importInfo(source)}${pendingForget ? `<section class="mem-forget-confirm" role="alert"><h2>Forget this source?</h2><p>The source text and its extracted memories will be removed from recall. Answers and suggestions based on it will become unavailable. Existing tasks remain in your task list; review them separately.</p><div>${button('cancel-forget', 'Keep source')}${button('confirm-forget', 'Forget this source', { style: 'danger', disabled: busy })}</div></section>` : ''}<div class="mem-detail-grid"><section class="mem-panel"><div class="mem-section-head"><h2>${editorOpen ? 'Edit the original' : 'What you saved'}</h2>${tag(forgotten ? 'Forgotten' : 'Original wording')}</div>${editorOpen ? `<form data-memory-form="edit-source"><div class="mem-form-grid">${field('title', 'Title', editDraft.title ?? source.title, 'text', 'required maxlength="200"')}${field('occurred_on', 'When did it happen?', editDraft.occurred_on ?? source.occurred_on ?? '', 'date')}</div><label class="mem-field"><span>Original note</span><textarea name="body" rows="12" required maxlength="100000">${escape(editDraft.body ?? source.body)}</textarea></label><p class="mem-caution">Changing this source invalidates memories and answers based on its previous version. Organize and review the new version before using it.</p><button type="submit" class="mem-button primary" ${busy ? 'disabled' : ''}>Save revision</button></form>` : `<div class="mem-original">${escape(forgotten ? 'This source was forgotten. Its original text is no longer available.' : source.markdown_unavailable ? 'This file is unavailable. Restore or fix it in the Markdown folder, then refresh. Cached content is withheld.' : source.body || '')}</div>`}${!forgotten && !source.markdown_unavailable && !editorOpen ? `<form class="mem-organize" data-memory-form="organize"><h3>Find the useful details</h3><p>Organize this source into suggested facts, preferences, commitments and updates. Review each one before keeping it.</p>${consent('source')}<button type="submit" class="mem-button primary" ${busy ? 'disabled' : ''}>${busy ? 'Organizing…' : sourceItems.length ? 'Organize this revision' : 'Organize source'}</button></form>` : ''}</section><section><div class="mem-section-head"><div><h2>Memories from this source</h2><p>Every memory keeps the original wording within reach.</p></div>${tag(String(sourceItems.filter(item => item.status === 'confirmed').length) + ' kept', 'confirmed')}</div>${sourceItems.map(item => itemCard(item, { sourceLink: false, full: true })).join('') || smallEmpty('No memories extracted yet', forgotten ? 'Forgotten content is excluded from recall.' : 'Organize this source to find the details worth keeping.')}</section></div>`;
    }
    const runId = run => run.id || run.run_id;
    function citationsFor(run) {
        return list(run.citations).map((citation, index) => `<a class="mem-citation" href="${sourceHref(citation.source_id)}"><span>${index + 1}</span><div><strong>${escape(citation.title || sources().find(source => source.id === citation.source_id)?.title || 'Original source')}</strong><blockquote>${escape(citation.quote)}</blockquote><small>Open source · Revision ${escape(citation.source_version || 1)}</small></div>${glyph('arrow')}</a>`).join('');
    }
    function actionCard(run, action, index) {
        const applied = Boolean(action.applied_task_id || action.state === 'applied');
        const unavailable = run.state === 'stale' || run.state === 'failed' || action.state === 'stale' || action.state === 'invalidated';
        const type = action.type || action.kind;
        return `<div class="mem-action-card"><div><span class="mem-eyebrow">${applied ? 'ADDED TO YOUR TASKS' : 'SUGGESTED NEXT STEP'}</span><h3>${escape(action.title || 'Review next step')}</h3>${action.due_on ? `<p>Due ${escape(date(action.due_on))}</p>` : ''}${action.quote ? `<blockquote>${escape(action.quote)}</blockquote>` : ''}</div>${applied ? '<a class="mem-button" href="#tasks">View tasks</a>' : type === 'create_task' && !unavailable ? button('confirm-action', 'Create this task', { id: runId(run), extra: `data-index="${escape(action.index ?? index)}"`, style: 'primary', disabled: busy }) : `<span class="mem-caption">${unavailable ? 'Ask again using current memories.' : 'Review this suggestion yourself.'}</span>`}</div>`;
    }
    function answerCard(run) {
        const stale = run.state === 'stale';
        const failed = run.state === 'failed';
        const isAI = run.provider === 'vertex';
        return `<article class="mem-agent-answer"><div class="mem-answer-label"><span class="mem-agent-mark">${glyph('spark')}</span><strong>Threadline</strong>${tag(stale ? 'Needs refresh' : failed ? 'Could not complete' : isAI ? 'Gemini + your memory' : 'From your memory', stale ? 'stale' : failed ? 'rejected' : '')}</div>${stale ? '<div class="mem-caution">A source used for this answer changed or was forgotten. Ask again for an answer from current memories.</div>' : failed ? `<div class="mem-alert">${escape(typeof run.error === 'object' ? run.error.message || 'The requested analysis could not complete.' : run.error || 'The requested analysis could not complete.')} No substitute answer was generated.</div>` : `<div class="mem-answer-body">${escape(run.answer || '')}</div>`}${!stale && !failed && list(run.citations).length ? `<div class="mem-answer-sources"><h4>From your saved context</h4>${citationsFor(run)}</div>` : ''}${!stale && !failed ? list(run.actions).map((action, index) => actionCard(run, action, index)).join('') : ''}${list(run.trace).length ? `<details class="mem-trace"><summary>How this answer was prepared</summary><ol>${run.trace.map(step => `<li><span>${escape(pretty(step.step || step.action || 'Step'))}</span>${step.status ? tag(pretty(step.status)) : ''}${step.detail ? `<p>${escape(typeof step.detail === 'string' ? step.detail : JSON.stringify(step.detail))}</p>` : ''}</li>`).join('')}</ol>${isAI && run.model ? `<p>Model: ${escape(run.model)}</p>` : ''}</details>` : ''}</article>`;
    }
    function agentPage() {
        const runs = list(history.runs).filter(run => run.kind === 'ask' && (!threadId || run.thread_id === threadId));
        const messages = list(history.messages);
        const ordered = [...runs].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
        const person = contacts().find(contact => sources().some(source => source.contact_id === contact.id || source.project_contact_id === contact.id));
        const project = projects().find(project => sources().some(source => source.project_id === project.id));
        const suggestions = [person ? `What should I remember before meeting ${person.name}?` : 'Find my saved commitments.', project ? `What is the next step for ${project.name}?` : 'Find my saved project updates.', person ? `What have I promised ${person.name}?` : 'Find notes about a promise.', 'Find my saved preferences.'];
        return `<header class="mem-page-heading"><div><span class="mem-eyebrow">ASK THREADLINE</span><h1>Make sense of what you remember.</h1><p>Find a detail, reconnect ideas, prepare for a conversation or pick up a project where you left off.</p></div><a class="mem-button" href="#memory">${glyph('memory')}Manage memory</a></header>${errorPanel()}<div class="mem-agent-layout"><aside class="mem-agent-sidebar"><section class="mem-panel"><div class="mem-section-head"><h2>Conversations</h2>${button('new-thread', 'New')}</div><div class="mem-thread-list">${list(history.threads).map(thread => button('select-thread', thread.title || 'Conversation', { id: thread.id, style: thread.id === threadId ? 'selected' : '' })).join('') || '<p class="mem-caption">Your conversations are saved here as you use your agent.</p>'}</div></section><section class="mem-agent-guard"><h3>Your context, your control.</h3><p>The agent recalls saved sources, proposes memories and prepares useful next steps. Creating a task always needs your confirmation.</p><p>It does not read other apps or contact people for you.</p></section></aside><section class="mem-conversation"><div class="mem-messages" aria-live="polite">${!ordered.length ? `<div class="mem-agent-welcome"><span class="mem-welcome-symbol">${glyph('spark')}</span><h2>What would you like to make sense of?</h2><p>A conversation you need to prepare for. A promise you don't want to lose. A project whose next step is unclear.</p><div class="mem-prompt-grid">${suggestions.map(text => button('example', text, { id: text })).join('')}</div></div>` : ordered.map(run => { const prompt = messages.find(message => message.run_id === runId(run) && message.role === 'user')?.body || run.question || ''; return `${prompt ? `<div class="mem-user-message"><span>You</span><p>${escape(prompt)}</p></div>` : ''}${answerCard(run)}`; }).join('')}</div><form class="mem-agent-composer" data-memory-form="ask"><label class="mem-field"><span class="mem-visually-hidden">Ask Threadline</span><textarea name="question" required rows="3" maxlength="4000" placeholder="Ask about your people, projects or past conversations…">${escape(question)}</textarea></label>${consent('answer')}<div class="mem-form-bottom"><span>Sources stay linked. Actions wait for you.</span><button type="submit" class="mem-button primary" ${busy ? 'disabled' : ''}>${busy ? 'Working with your memory…' : 'Ask Threadline'} ${glyph('arrow')}</button></div></form></section></div>`;
    }
    function render() {
        if (!isLive()) return;
        root.innerHTML = `<div class="mem-workspace ${route === 'agent' ? 'mem-agent-view' : ''}" ${busy ? 'aria-busy="true"' : ''}>${route === 'agent' ? agentPage() : sourceId ? sourcePage() : memoryPage()}</div>`;
        root.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', submit);
            if (form.dataset.memoryForm === 'capture' || form.dataset.memoryForm === 'edit-source') {
                form.addEventListener('input', () => {
                    const draft = Object.fromEntries(new FormData(form));
                    if (form.dataset.memoryForm === 'capture') captureDraft = draft;
                    else editDraft = draft;
                });
            }
        });
        root.querySelectorAll('[data-memory-action]').forEach(control => control.addEventListener('click', click));
        const searchInput = root.querySelector('[data-memory-search]');
        searchInput?.addEventListener('input', event => {
            search = event.target.value; const position = event.target.selectionStart;
            queueSearch();
            render(); const next = root.querySelector('[data-memory-search]'); next?.focus();
            if (next && typeof next.setSelectionRange === 'function') { try { next.setSelectionRange(position, position); } catch {} }
        });
        root.querySelector('[data-memory-origin]')?.addEventListener('change', event => { originFilter = event.target.value; render(); });
        root.querySelector('[data-memory-kind]')?.addEventListener('change', event => { kind = event.target.value; render(); });
        root.querySelector('textarea[name="question"]')?.addEventListener('input', event => { question = event.target.value; });
    }
    function queueSearch() {
        clearTimeout(searchTimer);
        const generation = ++searchGeneration;
        searchHits = new Map(); searchError = ''; searchPending = Boolean(search.trim());
        if (!searchPending) return;
        const query = search.trim(), selectedEntity = entity;
        searchTimer = setTimeout(async () => {
            const params = new URLSearchParams({ q: query });
            if (selectedEntity.startsWith('person:')) params.set('contact_id', selectedEntity.slice(7));
            if (selectedEntity.startsWith('project:')) params.set('project_id', selectedEntity.slice(8));
            try {
                const result = await api('/api/memory/search?' + params.toString());
                if (generation !== searchGeneration || !isLive()) return;
                searchHits = new Map(list(result.hits).map(hit => [hit.source_id, hit]));
            } catch (error) {
                if (generation !== searchGeneration || !isLive()) return;
                searchError = 'Full-text search could not complete. ' + error.message;
            } finally {
                if (generation === searchGeneration && isLive()) {
                    searchPending = false;
                    const input = root.querySelector('[data-memory-search]');
                    const focused = input === document.activeElement, position = input?.selectionStart;
                    render();
                    if (focused) {
                        const next = root.querySelector('[data-memory-search]'); next?.focus();
                        try { next?.setSelectionRange(position, position); } catch {}
                    }
                }
            }
        }, 250);
    }
    async function refresh({ withHistory = route === 'agent' } = {}) {
        const thisRevision = ++revision;
        const calls = [api('/api/memory'), records ? Promise.resolve(records) : api('/api/state'), withHistory ? api('/api/memory/agent/history' + (threadId ? '?thread_id=' + encodeURIComponent(threadId) : '')) : Promise.resolve(history), sourceId ? api('/api/memory/sources/' + encodeURIComponent(sourceId)) : Promise.resolve(null), route === 'agent' ? Promise.resolve({ value: vault }) : api('/api/memory/vault').then(value => ({ value }), error => ({ error: error.message || 'Try refreshing again.' }))];
        const [nextMemory, nextRecords, nextHistory, nextSource, nextVault] = await Promise.all(calls);
        if (!isLive() || thisRevision !== revision) return;
        memory = nextMemory; records = nextRecords; history = nextHistory; detailSource = nextSource?.source || nextSource;
        vault = nextVault.value || null; vaultError = nextVault.error || ''; markdown = null; markdownOpen = false;
        if (route === 'agent' && !threadId && list(history.threads).length) { threadId = history.threads[0].id; history = await api('/api/memory/agent/history?thread_id=' + encodeURIComponent(threadId)); }
    }
    async function work(callback) {
        if (busy) return;
        busy = true; alert = ''; render();
        try { await callback(); }
        catch (error) { alert = error.message || 'This could not be completed. Your saved records are preserved.'; toast(alert, true); }
        finally { busy = false; render(); }
    }
    async function organize(source, useAI) {
        const result = await api('/api/memory/sources/' + encodeURIComponent(source.id) + '/organize', 'POST', { source_version: source.version, use_ai: useAI, consent: useAI });
        if (result.state === 'failed') throw new Error(typeof result.error === 'object' ? result.error.message : result.error || 'Source saved, but organization did not complete. You can retry from the source.');
        return result;
    }
    async function submit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        const type = form.dataset.memoryForm;
        const useAI = data.use_ai === 'on';
        if (type === 'capture') captureDraft = data;
        if (type === 'edit-source') editDraft = data;
        await work(async () => {
            if (type === 'capture') {
                const response = await api('/api/memory/sources', 'POST', { title: data.title.trim(), body: data.body, occurred_on: data.occurred_on || null, contact_id: data.contact_id || null, project_id: data.project_id || null, origin: 'web' });
                const source = response.source || response;
                let failure = '';
                try { await organize(source, useAI); } catch (error) { failure = error.message; }
                await refresh(); captureOpen = false; captureDraft = {};
                toast(failure ? 'Source saved. Open it to retry organization.' : 'Source saved. Review the suggested memories.', Boolean(failure));
                navigate('memory/source/' + encodeURIComponent(source.id));
            } else if (type === 'edit-source') {
                const source = currentSource();
                await api('/api/memory/sources/' + encodeURIComponent(source.id), 'PATCH', { version: source.version, title: data.title.trim(), body: data.body, occurred_on: data.occurred_on || null });
                editorOpen = false; editDraft = {}; await refresh(); toast('Revision saved. Organize it again to refresh its memories.');
            } else if (type === 'organize') {
                try { await organize(currentSource(), useAI); toast('Suggested memories are ready for your review.'); }
                finally { await refresh(); }
            } else if (type === 'ask') {
                const asked = data.question.trim(); if (!asked) return;
                const result = await api('/api/memory/agent/ask', 'POST', { question: asked, ...(threadId ? { thread_id: threadId } : {}), use_ai: useAI, consent: useAI });
                threadId = result.thread_id || result.run?.thread_id || threadId;
                question = ''; await refresh({ withHistory: true });
                if (result.state === 'failed') toast('The answer could not be completed. See the saved attempt for details.', true);
            }
        });
    }
    async function click(event) {
        const control = event.currentTarget;
        const action = control.dataset.memoryAction, id = control.dataset.id;
        if (busy) return;
        if (action === 'open-capture') { captureOpen = true; render(); root.querySelector('.mem-capture')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); root.querySelector('[name="title"]')?.focus(); return; }
        if (action === 'close-capture') { captureOpen = false; render(); return; }
        if (action === 'filter') { filter = id; render(); return; }
        if (action === 'entity') { entity = id; filter = 'sources'; queueSearch(); render(); return; }
        if (action === 'clear-entity') { entity = ''; queueSearch(); render(); return; }
        if (action === 'edit-source') { editorOpen = !editorOpen; if (!editorOpen) editDraft = {}; pendingForget = false; render(); return; }
        if (action === 'forget-source') { pendingForget = true; render(); return; }
        if (action === 'cancel-forget') { pendingForget = false; render(); return; }
        if (action === 'example') { question = id; render(); root.querySelector('[name="question"]')?.focus(); return; }
        if (action === 'new-thread') { threadId = null; history = { ...history, runs: [], messages: [] }; question = ''; alert = ''; render(); return; }
        await work(async () => {
            if (action === 'refresh') { syncNotice = ''; await refresh(); }
            if (action === 'sync-vault') {
                syncNotice = '';
                await api('/api/memory/vault/sync', 'POST', {});
                await refresh();
                if (vaultError) throw new Error('Refresh finished, but its result could not be checked. ' + vaultError);
                if (vaultIssues().length) syncNotice = 'Refresh completed with files needing attention below.';
                else if (count(vault?.pending)) syncNotice = 'Files were checked. Some changes still need synchronization.';
                else syncNotice = 'Files checked. Your memory library reflects the saved Markdown files.';
            }
            if (action === 'copy-vault-path') {
                if (!navigator.clipboard?.writeText) throw new Error('Copy is unavailable in this browser. Select the displayed folder path to copy it.');
                await navigator.clipboard.writeText(vaultPath()); toast('Memory folder path copied.');
            }
            if (action === 'view-markdown') {
                if (markdownOpen) markdownOpen = false;
                else { await readMarkdown(); markdownOpen = true; }
            }
            if (action === 'download-markdown') {
                const file = await readMarkdown();
                const url = URL.createObjectURL(new Blob([file.content], { type: 'text/markdown;charset=utf-8' }));
                const link = document.createElement('a');
                link.href = url; link.download = String(file.filename).split(/[\\/]/).pop();
                document.body.appendChild(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                toast('Markdown download started.');
            }
            if (action === 'select-thread') { threadId = id; await refresh({ withHistory: true }); }
            if (action === 'confirm-item' || action === 'reject-item') {
                const item = items().find(item => item.id === id);
                await api('/api/memory/items/' + encodeURIComponent(id) + '/review', 'POST', { version: item.version, decision: action === 'confirm-item' ? 'confirm' : 'reject' });
                await refresh(); toast(action === 'confirm-item' ? 'Memory kept. Its original source remains linked.' : 'Suggestion dismissed. The original source is unchanged.');
            }
            if (action === 'confirm-forget') {
                const source = currentSource();
                await api('/api/memory/sources/' + encodeURIComponent(source.id) + '/forget', 'POST', { version: source.version });
                pendingForget = false; editorOpen = false; detailSource = null; sourceId = null; await refresh(); toast('Source forgotten and removed from recall.'); navigate('memory');
            }
            if (action === 'confirm-action') {
                const run = list(history.runs).find(run => runId(run) === id);
                const index = Number(control.dataset.index);
                const proposed = list(run?.actions).find((item, itemIndex) => (item.index ?? itemIndex) === index);
                const response = await api('/api/memory/agent/runs/' + encodeURIComponent(id) + '/actions/' + index + '/confirm', 'POST', { ...(proposed?.source_version ? { source_version: proposed.source_version } : {}) });
                await refresh({ withHistory: true }); toast(response.task_deleted ? 'This task was created earlier and later removed. No duplicate was created.' : response.already_applied ? 'This task is already in your list.' : 'Task created in your workspace.');
            }
        });
    }
    root.innerHTML = '<div class="mem-workspace"><div class="mem-empty" role="status"><span class="spinner"></span><p>Opening your memory…</p></div></div>';
    try { await refresh(); render(); }
    catch (error) { alert = error.message; render(); }
    return { refresh: async () => { await refresh(); render(); }, destroy: () => { revision++; searchGeneration++; clearTimeout(searchTimer); root.innerHTML = ''; } };
}
