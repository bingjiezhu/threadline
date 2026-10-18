/** A small fictional example for an understandable walkthrough. Never loaded into real accounts. */
export function seedClarityFixture(app, workspace, {createGoal = true} = {}) {
  const D=app.domain,W=app.warm;
  const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  const maya=D.createContact(workspace,{name:'Maya Chen',company:'Northstar Labs (fictional)',role:'Team lead',tags:'test site, first week'});
  const jordan=D.createContact(workspace,{name:'Jordan Lee',company:'Northstar Labs (fictional)',role:'Team support',tags:'test site, first week'});
  const old=D.createNote(workspace,{title:'Getting access to the test site',body:'Ask Maya Chen for access to the test site. Complete the required training first.',occurred_on:day(-30),contact_id:maya.id});
  const oldRoute=W.createRoute(workspace,{topic:'test-site-access',contact_id:maya.id,note_id:old.id,quote:old.body,route_role:'approver',confirm:true});
  const newSource={title:'A note about who handles access',body:'Jordan Lee now handles test site access, instead of Maya Chen. Training is still required.',occurred_on:day(-1)};
  const update=D.createNote(workspace,{...newSource,contact_id:jordan.id});
  if (!createGoal) return {goal_id:null,old_route_id:oldRoute.id,old_note_id:old.id,new_note_id:update.id,jordan_id:jordan.id,maya_id:maya.id,new_source:newSource};
  const goal=W.createGoal(workspace,{title:'Try the company test site',role:'New team member',topic:'test-site-access',success:'Run a practice test, then show the result to my teammate.',due_on:day(3)});
  const plan=W.plan(workspace,goal.id);
  return {goal_id:goal.id,old_route_id:oldRoute.id,old_note_id:old.id,new_note_id:update.id,jordan_id:jordan.id,maya_id:maya.id,original_plan_id:plan.id,new_source:newSource};
}
