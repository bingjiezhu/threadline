// Optional, explicitly billable, synthetic provider check. Never reads the user's database.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { responsesJson, extractionSchema } from '../src/ai.js';
import { quoteSpan, ensure } from '../src/util.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(root, '.env')))
    process.loadEnvFile(resolve(root, '.env'));
try {
    ensure(process.argv.includes('--confirm-cost'), 'This calls the real API with synthetic text and may incur a charge. Run npm run ai-smoke -- --confirm-cost to continue.');
    const source = 'We completed private deployment for a fictional test project on 2026-09-10.';
    const r = await responsesJson({ key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', prompt: 'Extract one capability from this synthetic note. Use only the exact original sentence as its quote. Topic private-deployment; certainty confirmed. Return the required schema. Do not call tools.', payload: { body: source }, schema: extractionSchema, name: 'threadline_smoke' });
    ensure(Array.isArray(r.value.claims) && r.value.claims.length === 1, 'The provider did not return one evidence item.');
    const c = r.value.claims[0];
    quoteSpan(source, c.quote);
    ensure(c.kind === 'capability' && c.certainty === 'confirmed', 'The interpretation did not match this synthetic example.');
    console.log(JSON.stringify({ passed: true, check: 'synthetic-provider-smoke', model: r.model, input_tokens: r.usage.input_tokens, output_tokens: r.usage.output_tokens, statement: c.statement, limitations: 'One synthetic request checks connectivity/contract, not product accuracy or safety on real data.' }, null, 2));
}
catch (e) {
    console.error(e.message);
    process.exitCode = 1;
}
