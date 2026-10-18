// Reproducible fictional onboarding archive. Never seeds the application database.
import { openStore } from '../src/store.js';
import { createDomain } from '../src/domain.js';
import { uid, now } from '../src/util.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './operator.js';
const s = openStore(':memory:'), D = createDomain(s), u = uid(), w = uid();
s.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(u, 'fictional-owner@example.invalid', 'Morgan', 'not-a-login-credential', now());
s.db.prepare('INSERT INTO workspaces(id,owner_id,name,timezone,created_at) VALUES(?,?,?,?,?)').run(w, u, 'Morgan’s studio', 'America/Los_Angeles', now());
const make = (name, email, company, role, tags) => D.createContact(w, { name, email, company, role, tags });
const alex = make('Alex Morgan', 'alex@northstar.example.invalid', 'Northstar Facilities', 'Operations director', 'client,operations');
const riley = make('Riley Chen', 'riley@verdant.example.invalid', 'Verdant Labs', 'Engineering lead', 'client,platform');
const jamie = make('Jamie Rivera', 'jamie@harbor.example.invalid', 'Harbor Works', 'Founder', 'partner,delivery');
const sam = make('Sam Taylor', 'sam@bluebird.example.invalid', 'Bluebird Studio', 'Product lead', 'client,discovery');
const jordan = make('Jordan Ellis', 'jordan@clearpath.example.invalid', 'Clearpath Advisory', 'Independent consultant', 'referral,advisor');
D.createContact(w, { name: 'Casey Brooks', company: 'Summit Collective', role: 'Community organizer', tags: 'community,events' });
const p1 = D.createProject(w, { name: 'Private knowledge workspace', company: alex.company, contact_id: alex.id, goal: 'Help the operations team find answers in its internal manuals without exposing documents outside its environment.', status: 'waiting', value: 2400000, currency: 'USD', unknowns: 'Budget approval has not been confirmed.\nCheck who owns the project today.\nRevalidate the security requirements.', next_review: '2026-10-22' });
const p2 = D.createProject(w, { name: 'Single sign-on rollout', company: riley.company, contact_id: riley.id, goal: 'Make internal tools easier to access with one identity provider.', status: 'active', value: 1800000, unknowns: 'Confirm the identity provider and rollout window.\nProcurement approval is still unknown.', next_review: '2026-10-23' });
const p3 = D.createProject(w, { name: 'Customer research workspace', company: sam.company, contact_id: sam.id, goal: 'Organize research notes so the product team can follow the evidence behind a decision.', status: 'active', value: 1200000, unknowns: 'Ask which workflow is most time-consuming.\nNo paid pilot has been agreed.', next_review: '2026-10-24' });
const p4 = D.createProject(w, { name: 'Delivery partnership', company: jamie.company, contact_id: jamie.id, goal: 'Explore collaboration for projects that need extra implementation capacity.', status: 'waiting', value: 0, unknowns: 'Confirm available capacity and commercial terms before proposing a joint project.' });
function note(title, body, kind, occurred_on, project_id = null, contact_id = null) { return D.createNote(w, { title, body, kind, occurred_on, project_id, contact_id }); }
function evidence(n, kind, topic, quote, certainty = 'confirmed', approved = true) { let c = D.createClaim(w, { note_id: n.id, kind, topic, quote, certainty }); if (approved)
    c = D.decideClaim(w, c.id, { version: c.version, decision: 'approve' }); return c; }
const n1 = note('Northstar discovery call', 'Alex: We require private deployment inside our own environment.\nWe want to search maintenance manuals without sending them to a public service.\nBudget will need a separate review. Please check with us again when you have a relevant delivery example.', 'meeting', '2026-05-12', p1.id, alex.id);
evidence(n1, 'requirement', 'private-deployment', 'We require private deployment inside our own environment.');
evidence(n1, 'context', 'budget', 'Budget will need a separate review.', 'uncertain');
const n2 = note('Private deployment completed', 'Delivery review: We completed a private deployment in a customer-controlled environment.\nThe handover included access controls, a documented deployment process, and a recovery rehearsal.\nThis is one delivery example, not a claim that all customer requirements are satisfied.', 'delivery', '2026-10-14');
evidence(n2, 'capability', 'private-deployment', 'We completed a private deployment in a customer-controlled environment.');
const n3 = note('Check current project ownership', 'Alex mentioned moving into a different operations group. Confirm whether Alex still owns the knowledge-workspace evaluation before discussing a proposal.', 'conversation', '2026-10-15', p1.id, alex.id);
evidence(n3, 'contact_change', 'project-ownership', 'Alex mentioned moving into a different operations group.', 'reported');
const n4 = note('Verdant access requirements', 'Riley: We need single sign-on for our internal tools.\nPlease share how the identity integration would work before we schedule a technical review.', 'meeting', '2026-07-08', p2.id, riley.id);
evidence(n4, 'requirement', 'single-sign-on', 'We need single sign-on for our internal tools.');
const n5 = note('Identity integration handover', 'Implementation note: We delivered single sign-on for an internal application.\nThe customer tested account provisioning and sign-out during acceptance.', 'delivery', '2026-10-10');
evidence(n5, 'capability', 'single-sign-on', 'We delivered single sign-on for an internal application.');
const n6 = note('Bluebird discovery notes', 'Sam: We need a better way to recover why a product decision was made.\nThe team currently searches old notes and asks the original researcher.\nI will send a short workflow example before our next discussion.', 'meeting', '2026-10-09', p3.id, sam.id);
evidence(n6, 'requirement', 'research-memory', 'We need a better way to recover why a product decision was made.');
evidence(n6, 'commitment', 'workflow-example', 'I will send a short workflow example before our next discussion.', 'planned', false);
const n7 = note('Potential delivery collaboration', 'Jamie is open to discussing implementation partnerships. Available capacity and responsibilities would need to be confirmed for each project.', 'conversation', '2026-10-13', p4.id, jamie.id);
evidence(n7, 'context', 'delivery-partnership', 'Jamie is open to discussing implementation partnerships.', 'reported', false);
const n8 = note('Roadmap idea — not yet delivered', 'We plan to add a research-memory workflow next quarter. No customer implementation has been completed yet.', 'note', '2026-10-16');
evidence(n8, 'capability', 'research-memory', 'We plan to add a research-memory workflow next quarter.', 'planned');
D.createTask(w, { title: 'Ask Alex who owns the project today', project_id: p1.id, contact_id: alex.id, due_on: '2026-10-20', notes: 'Confirm responsibility before proposing a technical conversation.' });
D.createTask(w, { title: 'Prepare a one-page SSO overview', project_id: p2.id, contact_id: riley.id, due_on: '2026-10-21' });
D.createTask(w, { title: 'Request the research workflow example', project_id: p3.id, contact_id: sam.id, due_on: '2026-10-22' });
D.createTask(w, { title: 'Confirm Jamie’s delivery capacity', project_id: p4.id, contact_id: jamie.id, due_on: '2026-10-23' });
D.createTask(w, { title: 'Thank Jordan for the introduction', contact_id: jordan.id, status: 'done' });
D.refresh(w);
const a = D.export(w);
a.description = 'Fictional example data for learning the application. No real client, revenue, delivery, or relationship is represented. Import is optional and uses the same real data paths as other archives.';
mkdirSync(resolve(root, 'examples'), { recursive: true });
for (const f of ['examples/fictional-workspace.json', 'public/sample-workspace.json'])
    writeFileSync(resolve(root, f), JSON.stringify(a, null, 2) + '\n');
const csv = 'name,email,company,role,phone,tags,notes\n"Taylor Example",taylor@example.invalid,"Example Company","Operations lead",,"client,example","Replace this row with your own authorized contact."\n';
for (const f of ['examples/contacts-template.csv', 'public/contacts-template.csv'])
    writeFileSync(resolve(root, f), csv);
writeFileSync(resolve(root, 'examples/customer-conversation.txt'), 'We require private deployment inside our own environment.\nBudget will need a separate review.\n');
writeFileSync(resolve(root, 'examples/delivery-update.txt'), 'We completed a private deployment in a customer-controlled environment.\nThis is one delivery example; customer fit and budget still need confirmation.\n');
s.close();
console.log('Fictional, optional examples generated. Application database was not changed.');
