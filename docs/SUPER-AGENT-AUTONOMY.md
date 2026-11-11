# Super agent: decide, don't ask, and work at master level

This document is the design for two changes to the company and super-agent plugins:

1. The owner is asked far fewer questions.
2. The super agent leads like a master of its field, and can run work much larger than one ticket.

The reference for the first change is the principle of DeepSeek's dsh-superagent prototype: *take as little human
attention as possible, and give as much value as possible.* There, the agent "chooses reasonable defaults instead
of asking the human to manage routine steps", reports blocked only when a human must act, and the host, not the
prompt, decides whether a question may be sent.

## 1. Why the owner was asked so much

| Source of a question | Before |
|---|---|
| CEO cycle | Up to two "decisions" in the plan and two in the review, on any subject |
| Super agent | `reply_owner` with `question: true`, with no condition |
| Worker | Any question in a report went straight to "Needs you" |
| Turn limit | A ticket that used its turns asked the owner to retry or stop |
| Blocked or failed ticket | Listed under "Needs you" until the owner wrote to it |

Most of these were choices the company could make itself: scope, design, whether to retry, how to work around a
limit of the sandbox.

## 2. The rule: authority, enforced in code

**The company decides everything inside its charter. The owner decides only owner-only matters.**

Owner-only matters are a short list that each profile states (`profile.ownerOnly`). The default list:

| Key | What it covers |
|---|---|
| `spend` | Paying for anything: a service, an asset, hardware, advertising |
| `release` | Anything public: publishing, store submission, pricing, selling, announcements |
| `legal` | Licences, contracts, other people's protected work |
| `access` | Credentials, accounts, permissions, anything outside the company's folders and sandbox |
| `charter` | The mission, the budget, the limits and the gate's bar |

Everything else has the category `internal`, and the agents decide it.

### One door for questions

Every question an agent wants to put to the owner goes through `Company.askOwner`. It needs a category, a
recommendation and what the company will do if no answer comes (`ifNoAnswer`).

| The question is | What happens |
|---|---|
| `internal` | It is not sent. The recommendation becomes the decision, recorded as **decided for you**. The owner can overrule it later; the CEO then sees the owner's choice. |
| Owner-only, and nothing else is waiting | It is asked, under "Needs you". |
| Owner-only, but one is already waiting or today's limit is reached | It is **held**. The company continues with `ifNoAnswer`. A held question is asked when the place is free. |

The limits are in the charter: `autonomy.level` (`high`, the default, or `ask` for the old behaviour) and
`autonomy.maxQuestionsPerDay` (default 1).

An owner-only question never blocks other work, and it is never answered by an agent.

### The other sources

| Source | Now |
|---|---|
| Worker question | Goes to the worker's lead (the super agent that owns the ticket). The lead answers it with `message_ticket`, and only an owner-only matter goes on through `askOwner`. |
| Turn limit | The ticket gets four more turns once, and its lead is told so it can narrow the scope. The second time, the ticket is stopped and the lead decides what follows. |
| Blocked or failed ticket | Its lead receives the report and decides: new instructions, a different ticket, or stop. It is not listed under "Needs you". |
| Passed the gate | Asked only when the profile holds the start for the owner (`charter.execution.ownerApproval`, on for the quant profile). |
| Hire | Asked only when hiring is set to "ask me first". |

### What the environment cannot measure

Several past questions had one cause: the gate wanted evidence the sandbox cannot produce (a frame rate on a real
headset). A profile now lists such evidence in `gateSpec.unmeasurable`. The auditor does not lower the score for
it. The deliverable records it as an open risk for the owner to check when they choose to.

### What the owner still sees

Nothing is hidden. The dashboard shows what was decided for the owner, with an Overrule button, and what is held.
The messages the super agent may send are a finished result, an owner-only question, or something it cannot
finish.

## 3. Master-level leadership

No setting makes a model more talented. What can be designed is how the leader works. Four things change.

**Standards the leader holds itself to.** Three skills in `forge/skills/` are given to the CEO and every super
agent:

| Skill | What it carries |
|---|---|
| `executive-judgment` | Deciding without asking: the authority rule, defaults, the assumptions log, when to escalate |
| `masterwork-standard` | Taste and the quality bar: pillars, references, the critique loop, when work is finished |
| `grand-scale-orchestration` | Work far larger than one ticket: phases, workstreams, integration, organisation design |

**The best model, thinking hardest, at the top.** The CEO tier uses the profile's strongest model at the highest
effort, with a fallback model. Hard tickets can be given to a principal builder on that same model
(`open_ticket` with `talent: "principal"`).

**A critique panel.** `critique` sends a ticket's folder to the profile's critics at once, each with its own lens
(for the VR studio: creative direction, engineering, play, market, and the independent auditor). They return
scores, what must be fixed and what would lift the work. The leader sends the fixes back to the ticket. Work goes
to the gate after the panel, not before.

**Work at scale.** A ticket can belong to a `workstream` and can wait for other tickets (`dependsOn`). The leader
lays out a whole programme at once: parallel workstreams, then an integration ticket that starts when they are
delivered. Super agents below the CEO each lead an area. The profile sets how much runs at once
(`profile.scale`).

### An honest limit

A film or a game of the largest kind is made by thousands of people over years, with assets (performance,
recorded sound, licensed technology) that agents in a sandbox cannot produce. This design gives the leader the
method and the structure for large work, and raises the quality of what it ships. It does not make that scale
reachable in a day, and the charter still requires the CEO to state the odds honestly.
