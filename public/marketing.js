const form = document.querySelector('#pilot-form');
form?.addEventListener('submit', async (e) => { e.preventDefault(); const button = form.querySelector('button[type=submit]'), result = document.querySelector('#pilot-result'); button.disabled = true; result.textContent = 'Saving your request…'; result.className = 'small'; try {
    const fields = Object.fromEntries(new FormData(form));
    fields.consent = form.elements.consent.checked;
    const r = await fetch('/api/pilot-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields) });
    const data = await r.json();
    if (!r.ok)
        throw new Error(data.error?.message || 'The request could not be saved.');
    result.className = 'small success';
    result.textContent = data.message;
    form.reset();
}
catch (e) {
    result.className = 'small error';
    result.textContent = e.message;
}
finally {
    button.disabled = false;
} });
