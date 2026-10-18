## Inspiration

An address book remembers who someone is. It rarely remembers what they asked you for, why a conversation stopped, or what you promised to do next. Those details live in private notes and in your head. As your network grows, maintaining that context becomes the work you keep postponing.

We wanted a personal relationship brain that helps you return to a conversation with a reason—and follow through on what you said.

## What it does

Threadline is a private workspace for contacts, projects, conversations, evidence and promises. It is designed for a person managing their own professional relationships, such as an independent consultant or a small service-business owner.

Morgan Ellis runs a small consultancy. In our fictional May 12 call, Alex Morgan at Northstar says, “We require private deployment inside our own environment.” The project pauses without a relevant delivery example. Alex asks Morgan to check back when that changes; budget and ownership remain unknown.

An October 16 delivery note says, “We completed private deployment inside a customer-controlled environment.” Morgan reviews and approves that evidence. Threadline connects it to the earlier requirement and shows both dated sources and the remaining questions.

Morgan now has something better than “just checking in”: a specific reason to ask whether the old need still exists. Morgan selects the evidence for a draft, edits the wording, and decides whether to send it through their usual messaging tool. Morgan separately manages an ordinary task for a promise. Actual contact and outcomes are recorded separately; copying a draft is never counted as a conversation.

You can also search past context, review a person's projects and manage promises without a match or model key.

## How we built it

One Node.js server serves an English web interface and stores each owner's records in SQLite. New accounts start empty. Original notes and dated quotations stay attached to reviewed evidence; projects retain goals and unknowns.

The working local path uses explicit topics and rules: an approved requirement can match a later confirmed capability on the same topic. Expired evidence, later blockers and contact restrictions can stop an inappropriate follow-up. This is transparent matching, not a claimed semantic model or an automatic measure of trust.

Optional OpenAI and Vertex adapters help propose evidence from a selected note or draft from selected quotations, with explicit sharing consent. A person reviews the interpretation and message. One consented fictional personal delivery note was extracted with real Gemini 3.8 Flash/Vertex. Exact-quote candidates stayed proposed, with no tasks or sends. This is one case, not an accuracy study. Drafting is untested live; the 83-second local demo contains no model call.

## Challenges and choices

The hard part was connecting memory to an appropriate next action. A technical capability may justify another question without proving buying intent. A polished message can become wrong when its source changes. We keep the original words inspectable, retain unknowns, and make changed context invalidate derived guidance.

We also kept promises separate from predictions. A task is something the owner chooses to do; an outcome is something they report happened. Recording either does not train a recommendation model or manufacture progress.

## What we are proud of

The product can carry one relationship through a complete local workflow: capture a conversation, remember an unfinished condition, connect new evidence, prepare a thoughtful follow-up and track a commitment. The mock people are fictional; the records, edits, drafts and tasks use the real application.

## What we learned and what comes next

The value is not a larger contact list. It is being able to recover the reason behind a relationship at the moment it matters. Next we want people to use their own authorized notes and compare the total maintenance effort with their current notes-and-reminders routine. We have not measured time saved or business results, and do not claim to have invented personal CRM.

Threadline extends an existing Apache-2.0 application. This final consolidation returns the newer core to a personal relationship entry point; earlier code and the supplied 83-second walkthrough remain disclosed prior work. Automatic social-history import, outbound messaging and feedback-trained recommendations are future work, not demonstrated features.
