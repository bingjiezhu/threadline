/** Real, opt-in paid API check against synthetic data only. No network call without --run. */
import { openStore } from '../src/store.js';
import { createDomain } from '../src/domain.js';
import { createAuth } from '../src/auth.js';
import { createWarmStart } from '../src/warm-start.js';
import { createAI } from '../src/ai.js';
if (!process.argv.includes('--run')) {
    console.log('Preview only. Configure OPENAI_API_KEY and OPENAI_MODEL, then run npm run ai:warm-smoke -- --run. This sends a synthetic onboarding goal and approved quotation to the provider and may incur charges. It never sends real user records or messages.');
    process.exit(0);
}
if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is missing; no model call was made.');
    process.exit(1);
}
const store = openStore(':memory:');
try {
    const domain = createDomain(store), auth = createAuth(store), warm = createWarmStart(store, domain);
    const { user } = await auth.register({ name: 'Synthetic QA', email: 'model-check@example.invalid', password: 'Synthetic-only-no-real-account!' });
    const w = user.workspace_id;
    const person = domain.createContact(w, { name: 'Jordan Lee' });
    const note = domain.createNote(w, { title: 'Synthetic sandbox guidance', occurred_on: new Date().toISOString().slice(0, 10), body: 'Jordan Lee handles sandbox access. Complete security training first. Access is not automatic.' });
    warm.createRoute(w, { topic: 'sandbox-access', contact_id: person.id, note_id: note.id, quote: note.body, route_role: 'approver', confirm: true });
    const goal = warm.createGoal(w, { title: 'Run my first sandbox test', role: 'New solutions engineer', topic: 'sandbox-access', success: 'Run one approved test and explain the result.' });
    const ai = createAI(store, domain, { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', dailyLimit: 2 });
    const start = ai.warmPlan(w, goal.id, { consent: true }, warm);
    await ai.drain();
    const job = store.db.prepare('SELECT * FROM jobs WHERE workspace_id=? AND id=?').get(w, start.job_id), plan = warm.goal(w, goal.id).plans[0];
    if (job.state !== 'succeeded' || !plan || plan.mode !== 'openai')
        throw Error(`Model check did not succeed (${job.state}). Review the provider configuration and rerun. No live success may be claimed.`);
    console.log(JSON.stringify({ status: 'passed', checked_at: new Date().toISOString(), provider: 'OpenAI', model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', job, plan_resolution: plan.body.resolution, steps: plan.body.steps.length, created_tasks: domain.state(w).tasks.length, boundary: 'Synthetic live API check, not customer accuracy, security certification or a platform installation.' }, null, 2));
}
catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
finally {
    store.close();
}
