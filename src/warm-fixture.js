/** Fictional, opt-in practice data. Uses the same domain operations as the application. */
export function seedWarmFixture(app, w) {
    const D = app.domain, W = app.warm;
    const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    const maya = D.createContact(w, { name: 'Maya Chen', company: 'Northstar Labs (fictional)', role: 'Platform lead', tags: 'sandbox, onboarding' });
    const jordan = D.createContact(w, { name: 'Jordan Lee', company: 'Northstar Labs (fictional)', role: 'Developer enablement', tags: 'sandbox, access' });
    const aria = D.createContact(w, { name: 'Aria Patel', company: 'Northstar Labs (fictional)', role: 'Onboarding mentor', tags: 'mentor, first week' });
    const old = D.createNote(w, { title: 'The original sandbox guide', body: 'Maya Chen approves sandbox access for new solutions engineers. Ask Maya after completing security training. This note does not confirm that your training is complete.', occurred_on: day(-45), contact_id: maya.id });
    const oldRoute = W.createRoute(w, { topic: 'sandbox-access', contact_id: maya.id, note_id: old.id, quote: old.body, route_role: 'approver', confirm: true });
    const mentor = D.createNote(w, { title: 'A safe first contribution', body: 'Aria Patel helps new solutions engineers prepare their first sandbox walkthrough. Bring one concrete goal and a proposed definition of done. Mentorship availability must be checked.', occurred_on: day(-5), contact_id: aria.id });
    W.createRoute(w, { topic: 'first-walkthrough', contact_id: aria.id, note_id: mentor.id, quote: mentor.body, route_role: 'mentor', confirm: true });
    const goal = W.createGoal(w, { title: 'Run my first sandbox walkthrough', role: 'New solutions engineer', topic: 'sandbox-access', success: 'Run one approved test and explain the result to my buddy.', due_on: day(3) });
    return { goal_id: goal.id, old_route_id: oldRoute.id, old_note_id: old.id, jordan_id: jordan.id, maya_id: maya.id, new_source: { title: 'Sandbox ownership update', body: 'Jordan Lee now handles sandbox access. Maya Chen no longer approves access requests. Complete security training first; access and approval are not automatic.', occurred_on: day(-1) } };
}
