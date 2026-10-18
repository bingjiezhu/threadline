import { randomUUID, createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCb);
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export const today = () => now().slice(0, 10);
export const hash = s => createHash('sha256').update(s).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export class AppError extends Error {
    constructor(message, status = 400, code = 'invalid_input') { super(message); this.status = status; this.code = code; }
}
export function ensure(value, message, status = 400, code = 'invalid_input') { if (!value)
    throw new AppError(message, status, code); }
export function text(value, name, max = 500, required = true) {
    ensure(typeof value === 'string' || (!required && value == null), `${name} must be text.`);
    const s = (value ?? '').trim();
    ensure((!required || s.length > 0) && [...s].length <= max, `${name} ${required ? 'is required and ' : ''}must be at most ${max} characters.`);
    ensure(!s.includes('\u0000'), `${name} contains an unsupported character.`);
    return s;
}
export function oneOf(value, values, name) { ensure(values.includes(value), `Choose a valid ${name}.`); return value; }
export function date(value, name = 'Date') {
    if (value == null || value === '')
        return null;
    ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `${name} must use YYYY-MM-DD.`);
    const d = new Date(value + 'T12:00:00Z');
    ensure(!isNaN(d) && d.toISOString().slice(0, 10) === value, `${name} is not a real calendar date.`);
    return value;
}
export function instant(value) {
    ensure(typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !isNaN(Date.parse(value)), 'A timestamp with a timezone is required.');
    ensure(Date.parse(value) <= Date.now() + 60000, 'Record an event after it has happened.');
    return new Date(value).toISOString();
}
export function email(value) { const s = text(value, 'Email', 254).toLowerCase(); ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), 'Enter a valid email address.'); return s; }
export function topic(value) { return text(value, 'Topic', 80).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''); }
export function version(row, expected) { ensure(Number.isInteger(expected) && expected === row.version, 'This record changed. Refresh it before saving.', 412, 'stale_version'); }
export function only(input, keys) { ensure(input && typeof input === 'object' && !Array.isArray(input), 'Expected a JSON object.'); for (const k of Object.keys(input))
    ensure(keys.includes(k), `Unsupported field: ${k}`); }
export function quoteSpan(source, quote) {
    ensure(typeof quote === 'string' && quote.length > 0 && [...quote].length <= 4000, 'Select a quotation of 1–4,000 characters.');
    const start = source.indexOf(quote);
    ensure(start !== -1, 'The quotation must match the original note exactly.', 422, 'invalid_quote');
    ensure(source.indexOf(quote, start + 1) === -1, 'This quotation occurs more than once. Select a longer, unique passage.', 422, 'ambiguous_quote');
    const cp = [...source.slice(0, start)].length;
    return { start: cp, end: cp + [...quote].length };
}
export async function passwordHash(password) {
    ensure(typeof password === 'string' && password.length >= 12 && password.length <= 256, 'Use a password of 12–256 characters.');
    const salt = randomBytes(16).toString('hex');
    const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function passwordVerify(password, encoded) {
    if (typeof password !== 'string' || password.length > 256)
        return false;
    const [, salt, key] = String(encoded).split(':');
    if (!salt || !key)
        return false;
    const candidate = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return candidate.length === Buffer.from(key, 'hex').length && timingSafeEqual(candidate, Buffer.from(key, 'hex'));
}
export const safeEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function parseCsv(raw) {
    ensure(typeof raw === 'string' && raw.length <= 2 * 1024 * 1024, 'CSV exceeds 2 MB.');
    raw = raw.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (c === '"') {
            if (quoted && raw[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else if (quoted)
                quoted = false;
            else {
                ensure(!cell, 'Invalid CSV quoting.');
                quoted = true;
            }
        }
        else if (c === ',' && !quoted) {
            row.push(cell);
            cell = '';
        }
        else if ((c === '\n' || c === '\r') && !quoted) {
            if (c === '\r' && raw[i + 1] === '\n')
                i++;
            row.push(cell);
            if (row.some(x => x !== ''))
                rows.push(row);
            row = [];
            cell = '';
        }
        else
            cell += c;
    }
    ensure(!quoted, 'CSV has an unclosed quotation mark.');
    row.push(cell);
    if (row.some(x => x !== ''))
        rows.push(row);
    ensure(rows.length > 1 && rows.length <= 1001, 'Include a header and 1–1,000 contacts.');
    const headers = rows.shift().map(x => x.trim().toLowerCase());
    ensure(headers.includes('name') && new Set(headers).size === headers.length, 'CSV must contain one unique name column.');
    ensure(headers.every(h => ['name', 'email', 'company', 'role', 'phone', 'tags', 'notes'].includes(h)), 'Supported CSV columns: name,email,company,role,phone,tags,notes.');
    return rows.map((r, i) => { ensure(r.length === headers.length, `CSV row ${i + 2} has the wrong number of columns.`); return Object.fromEntries(headers.map((h, j) => [h, r[j]])); });
}
