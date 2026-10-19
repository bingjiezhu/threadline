/* User-selected local files only. Imported text is displayed literally, never executed. */
const escape = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_FILES = 50;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const bytesLabel = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const sourceHref = id => '#memory/source/' + encodeURIComponent(id);
const statusLabel = status => ({ ready: 'Ready to preview', new: 'New memory', changed: 'Changed file', duplicate: 'Already saved', blocked: 'Skipped', imported: 'Imported', existing: 'Already saved' })[status] || status;
const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/></svg>';

/** api(path, method, body) is the host's authenticated + CSRF-protected API helper. */
export async function mountMemoryImportUI({ root, api, navigate = path => { location.hash = '#' + path; }, toast = () => {} }) {
    if (!root || typeof api !== 'function') throw new Error('A workspace root and API helper are required.');
    const localWorkspace = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    const storageDestination = localWorkspace ? 'this computer' : 'the machine running Threadline';
    let provider = 'codex', files = [], preview = null, result = null, busy = false, alert = '', notice = '';
    let selected = new Set(), expanded = new Set(), generation = 0;
    const view = document.createElement('div');
    view.className = 'mem-workspace mem-import';
    root.replaceChildren(view);
    const live = () => root.contains(view) && view.isConnected;
    const eligible = () => files.filter(file => file.status === 'ready');
    const payload = () => eligible().map(({ path, content }) => ({ path, content }));
    const previewFiles = () => Array.isArray(preview?.files) ? preview.files : [];
    const selectable = () => previewFiles().filter(file => ['new', 'changed', 'duplicate'].includes(file.status));
    const selectedFiles = () => selectable().filter(file => selected.has(file.path));
    const providerName = () => provider === 'codex' ? 'Codex' : 'Claude';
    const actionButton = (action, text, primary = false, disabled = false) => `<button type="button" class="mem-button${primary ? ' primary' : ''}" data-import-action="${action}" ${disabled ? 'disabled' : ''}>${escape(text)}</button>`;

    function row(file, index, fromPreview = false) {
        const original = files.find(item => item.path === file.path);
        const content = original?.content;
        const allowed = fromPreview && ['new', 'changed', 'duplicate'].includes(file.status);
        const key = (fromPreview ? 'preview:' : 'local:') + file.path;
        const description = file.reason || (file.status === 'changed' ? 'A new snapshot will be saved. The earlier source stays available.' : file.status === 'duplicate' ? 'This exact content is already in your workspace.' : '');
        return `<article class="mem-import-file ${escape(file.status)}"><div class="mem-import-file-head">${fromPreview ? `<label class="mem-import-check"><input type="checkbox" data-import-select="${index}" ${selected.has(file.path) ? 'checked' : ''} ${!allowed || busy ? 'disabled' : ''}><span class="mem-visually-hidden">Select ${escape(file.path)}</span></label>` : `<span class="mem-import-file-icon" aria-hidden="true">${icon}</span>`}<div class="mem-import-file-name"><strong>${escape(file.title || file.path.split('/').pop() || file.path)}</strong><span>${escape(file.path)}</span></div><span class="mem-import-status ${escape(file.status)}">${escape(statusLabel(file.status))}</span></div><div class="mem-import-file-info"><span>${escape(bytesLabel(file.bytes ?? original?.bytes ?? 0))}${file.characters !== undefined ? ` · ${Number(file.characters).toLocaleString('en-US')} characters` : ''}${Number(file.parts) > 1 ? ` · ${Number(file.parts)} linked parts` : ''}</span>${file.source_id ? `<a href="${sourceHref(file.source_id)}">Open saved source</a>` : ''}</div>${description ? `<p class="mem-import-reason">${escape(description)}</p>` : ''}${typeof content === 'string' ? `<details data-import-details="${escape(key)}" ${expanded.has(key) ? 'open' : ''}><summary>Read original text</summary><pre>${escape(content)}</pre></details>` : ''}</article>`;
    }

    function fileSelection() {
        const ready = eligible();
        const skipped = files.filter(file => file.status === 'blocked');
        return `<section class="mem-panel mem-import-selection"><div class="mem-section-head"><div><span class="mem-eyebrow">1 · CHOOSE A SOURCE</span><h2>Bring your agent memory with you.</h2></div></div><fieldset class="mem-import-providers"><legend class="mem-visually-hidden">Memory provider</legend>${[['codex', 'Codex', 'Memory summaries and topic files'], ['claude', 'Claude', 'Auto memory and project reference files']].map(([value, label, description]) => `<label class="mem-import-provider ${provider === value ? 'selected' : ''}"><input type="radio" name="memory-import-provider" value="${value}" ${provider === value ? 'checked' : ''} ${busy ? 'disabled' : ''}><span><strong>${label}</strong><small>${description}</small></span></label>`).join('')}</fieldset><div class="mem-import-tip"><strong>Where to look</strong>${provider === 'codex' ? '<p>Choose <code>memory_summary.md</code>, <code>MEMORY.md</code>, or individual Markdown topic files, usually in <code>~/.codex/memories/</code>.</p>' : '<p>Choose <code>MEMORY.md</code> and topic files, usually in <code>~/.claude/projects/&lt;project&gt;/memory/</code>. You can also include your project’s <code>CLAUDE.md</code> as reference content.</p>'}<p>Original text is saved as Markdown you can browse, edit and search. Large files become linked parts without cutting any content. Instructions inside a file remain reference text.</p></div><div class="mem-import-picker"><span class="mem-import-picker-mark">${icon}</span><h3>Choose the memories to bring in.</h3><p>Markdown or UTF-8 text · up to 50 files · 4 MB per batch</p><div class="mem-import-picker-actions">${actionButton('choose-files', 'Choose files', true, busy)}${actionButton('choose-folder', 'Choose a folder', false, busy)}</div><input class="mem-visually-hidden" type="file" data-import-picker="files" accept=".md,.txt,text/markdown,text/plain" multiple tabindex="-1" aria-label="Choose local memory files"><input class="mem-visually-hidden" type="file" data-import-picker="folder" webkitdirectory directory multiple tabindex="-1" aria-label="Choose a local memory folder"><small>Only files you choose are read. Their content stays in this browser until you click Preview import.</small></div>${files.length ? `<div class="mem-import-selection-head"><div><strong>${files.length} file${files.length === 1 ? '' : 's'} selected</strong><span>${ready.length} ready · ${skipped.length} skipped · ${escape(bytesLabel(ready.reduce((sum, file) => sum + file.bytes, 0)))}</span></div>${actionButton('clear', 'Clear selection', false, busy)}</div><div class="mem-import-files">${files.map((file, index) => row(file, index)).join('')}</div><div class="mem-import-bottom"><p>Preview checks your workspace for duplicates. Nothing is saved yet.</p>${actionButton('preview', busy ? 'Preparing preview…' : 'Preview import', true, busy || !ready.length)}</div>` : ''}</section>`;
    }

    function previewPanel() {
        const rows = previewFiles();
        const skipped = files.filter(file => file.status === 'blocked');
        const counts = ['new', 'changed', 'duplicate', 'blocked'].map(status => [status, rows.filter(file => file.status === status).length + (status === 'blocked' ? skipped.length : 0)]);
        const checked = selectedFiles();
        return `<section class="mem-panel mem-import-preview"><div class="mem-section-head"><div><span class="mem-eyebrow">2 · REVIEW & IMPORT</span><h2>See exactly what will be saved.</h2><p>From ${providerName()} · full original text, with its filename and import source.</p></div>${actionButton('back', 'Change files', false, busy)}</div><div class="mem-import-counts">${counts.map(([status, count]) => `<div><strong>${count}</strong><span>${escape(statusLabel(status))}</span></div>`).join('')}</div><div class="mem-import-bulk"><span>${checked.length} selected</span><div>${actionButton('select-new', 'Select new & changed', false, busy)}${actionButton('select-none', 'Clear checks', false, busy)}</div></div><div class="mem-import-files">${rows.map((file, index) => row(file, index, true)).join('')}${skipped.map((file, index) => row(file, index)).join('')}</div><div class="mem-import-bottom"><p>Selected files are stored on ${storageDestination}. No AI processing happens during import.</p>${actionButton('commit', busy ? 'Importing…' : `Import selected${checked.length ? ' (' + checked.length + ')' : ''}`, true, busy || !checked.length)}</div></section>`;
    }

    function completedPanel() {
        const rows = Array.isArray(result.files) ? result.files : [...(result.imported || []), ...(result.skipped || [])];
        const imported = result.totals?.imported ?? rows.filter(file => file.status === 'imported').length;
        const existing = result.totals?.existing ?? rows.filter(file => ['existing', 'duplicate'].includes(file.status)).length;
        return `<section class="mem-panel mem-import-complete"><span class="mem-import-complete-mark" aria-hidden="true">✓</span><span class="mem-eyebrow">SAVED IN THREADLINE</span><h2>${imported ? `${imported} memor${imported === 1 ? 'y source' : 'y sources'} imported.` : 'Your selected memories are already saved.'}</h2><p>${existing ? `${existing} existing source${existing === 1 ? ' was' : 's were'} reused. ` : ''}Open a source to read its full content, or find it in your memory library.</p><div class="mem-import-results">${rows.map(file => `<div class="mem-import-result"><div><strong>${escape(file.title || file.path)}</strong><small>${escape(file.path || '')}${Number(file.part_count) > 1 ? ` · Part ${Number(file.part_index)} of ${Number(file.part_count)}` : ''}</small></div>${file.source_id ? `<a class="mem-button" href="${sourceHref(file.source_id)}">Open source</a>` : `<span class="mem-import-status blocked">${escape(file.reason || 'Skipped')}</span>`}</div>`).join('')}</div><div class="mem-import-complete-actions">${actionButton('memory', 'Back to memory', true)}${actionButton('restart', 'Import more files')}</div></section>`;
    }

    function render() {
        if (!live()) return;
        view.innerHTML = `<a class="mem-back" href="#memory">← Back to memory</a><header class="mem-page-heading"><div><span class="mem-eyebrow">LOCAL MEMORY IMPORT</span><h1>Bring your existing context with you.</h1><p>Copy selected Codex or Claude memories into your local Markdown library.</p></div></header>${`<div class="mem-import-tip"><strong>${localWorkspace ? 'Local import · local storage' : 'Import to your Threadline workspace'}</strong><p>Selected files are saved as Markdown in the Threadline memory folder on ${storageDestination}. Your original files stay unchanged. Import uses no AI service and does not sync your files to a cloud memory service.</p></div>`}${alert ? `<div class="mem-alert" role="alert">${escape(alert)}</div>` : ''}${notice ? `<p class="mem-import-notice" role="status">${escape(notice)}</p>` : ''}${busy ? '<p class="mem-import-progress" role="status">Working… Your selection will stay here.</p>' : ''}${result ? completedPanel() : preview ? previewPanel() : fileSelection()}`;
        view.querySelectorAll('[data-import-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.importAction)));
        view.querySelectorAll('[data-import-picker]').forEach(input => input.addEventListener('change', () => chooseFiles(Array.from(input.files || []))));
        view.querySelectorAll('[name="memory-import-provider"]').forEach(input => input.addEventListener('change', () => {
            if (busy || !input.checked || provider === input.value) return;
            provider = input.value; preview = null; result = null; selected.clear(); alert = '';
            notice = files.length ? `Your files are still selected. They will be labeled as ${providerName()} memory.` : '';
            render();
        }));
        view.querySelectorAll('[data-import-select]').forEach(input => input.addEventListener('change', () => {
            const file = previewFiles()[Number(input.dataset.importSelect)];
            if (busy || !file || !['new', 'changed', 'duplicate'].includes(file.status)) return;
            if (input.checked) selected.add(file.path); else selected.delete(file.path);
            render();
        }));
        view.querySelectorAll('[data-import-details]').forEach(details => details.addEventListener('toggle', () => {
            if (details.open) expanded.add(details.dataset.importDetails); else expanded.delete(details.dataset.importDetails);
        }));
    }

    async function chooseFiles(chosen) {
        if (busy || !chosen.length) return;
        const revision = ++generation;
        busy = true; alert = ''; notice = ''; preview = null; result = null; selected.clear(); expanded.clear();
        render();
        let accepted = 0, totalBytes = 0;
        const next = [];
        const paths = new Set();
        for (const file of chosen) {
            if (revision !== generation || !live()) return;
            const path = file.webkitRelativePath || file.name;
            const record = { path, bytes: file.size, status: 'blocked', reason: '', file };
            if (!/\.(md|txt)$/i.test(path)) record.reason = 'Only Markdown (.md) and UTF-8 text (.txt) files can be imported.';
            else if (paths.has(path)) record.reason = 'This filename is selected more than once. Choose files from a folder to preserve distinct paths.';
            else if (file.size > MAX_FILE_BYTES) record.reason = 'This file exceeds the 1 MB limit. Choose a smaller memory file.';
            else if (accepted >= MAX_FILES) record.reason = 'This batch already contains 50 files. Import this file in a separate batch.';
            else if (totalBytes + file.size > MAX_TOTAL_BYTES) record.reason = 'This file would exceed the 4 MB batch limit. Import it in a separate batch.';
            else {
                try {
                    const buffer = await file.arrayBuffer();
                    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
                    record.characters = Array.from(content).length;
                    if (!content.trim()) record.reason = 'This file is empty.';
                    else {
                        record.content = content; record.status = 'ready'; accepted++; totalBytes += file.size;
                    }
                } catch (error) {
                    record.reason = error instanceof TypeError ? 'This file is not valid UTF-8 text.' : 'The browser could not read this file. Choose it again.';
                }
            }
            paths.add(path); next.push(record);
        }
        if (revision !== generation || !live()) return;
        files = next; busy = false;
        notice = `${accepted} file${accepted === 1 ? '' : 's'} ready for preview. ${next.length - accepted ? `${next.length - accepted} skipped; see the reason beside each file.` : 'Nothing has been sent or saved yet.'}`;
        render();
    }

    async function action(name) {
        if (busy) return;
        if (name === 'choose-files' || name === 'choose-folder') { view.querySelector(`[data-import-picker="${name === 'choose-files' ? 'files' : 'folder'}"]`)?.click(); return; }
        if (name === 'memory') { navigate('memory'); return; }
        if (name === 'clear' || name === 'restart') { generation++; files = []; preview = null; result = null; selected.clear(); expanded.clear(); alert = ''; notice = ''; render(); return; }
        if (name === 'back') { preview = null; selected.clear(); alert = ''; notice = ''; render(); return; }
        if (name === 'select-new') { selected = new Set(previewFiles().filter(file => ['new', 'changed'].includes(file.status)).map(file => file.path)); render(); return; }
        if (name === 'select-none') { selected.clear(); render(); return; }
        const revision = ++generation;
        busy = true; alert = ''; notice = ''; render();
        try {
            if (name === 'preview') {
                const response = await api('/api/memory/imports/preview', 'POST', { provider, files: payload() });
                if (revision !== generation || !live()) return;
                if (!Array.isArray(response.files) || !response.preview_hash) throw new Error('The preview could not be verified. Try Preview import again.');
                preview = response; selected = new Set(previewFiles().filter(file => ['new', 'changed'].includes(file.status)).map(file => file.path));
                expanded.clear();
            } else if (name === 'commit') {
                const choices = selectedFiles().map(({ path, hash }) => ({ path, hash }));
                if (!preview?.preview_hash || !choices.length) throw new Error('Preview your files and select at least one memory to import.');
                const response = await api('/api/memory/imports/commit', 'POST', { provider, files: payload(), preview_hash: preview.preview_hash, selected: choices, confirm: true });
                if (revision !== generation || !live()) return;
                result = response;
                toast('Your selected agent memories are saved in Threadline.');
            }
        } catch (error) {
            if (revision === generation && live()) alert = error.message || 'The import could not be completed. Your selected files are still available.';
        } finally {
            if (revision === generation && live()) { busy = false; render(); }
        }
    }
    render();
    return { destroy() { generation++; if (root.contains(view)) view.remove(); files = []; preview = null; result = null; selected.clear(); expanded.clear(); } };
}
