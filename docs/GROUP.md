# Group headquarters, company advisory teams

A **group headquarters** (`plugins/group-hq`) oversees several companies. Each company is its own install of this repository (its own `dsh web` and `forge/`), on the same computer or on another one. A company joins from its own web UI, and its owner decides how much the headquarters may do.

Every company also has an **independent advisory team** that reviews the whole company and advises its CEO. The headquarters has its own **review team** that does the same for the group.

```
            Group headquarters (plugins/group-hq, e.g. on another computer)
            ├─ Group CEO (hq-group-ceo): directives, advice, questions, policies
            ├─ Review team (portfolio, benchmarks, governance + lead): reports to the HQ owner
            └─ Listener on its own port  <───── companies call out (HTTPS or a private network)
                     ▲                 ▲
         sync every few minutes         │
 Company A (this repo, dsh web)    Company B (another install)
 ├─ CEO super agent, COO, departments ...
 └─ Advisory team (organisation, performance, strategy, governance + lead): reports to the company owner
```

## Set up the headquarters (on the HQ computer)

1. Install this repository there. Add the plugin to the web profile once, then restart `dsh web`:
   `./dsh plugin --profile web add ./plugins/group-hq`.
   Without the web UI, run `./hq-cli serve` instead: it serves the page on localhost (it prints a token link), plus the listener and the timers.
2. Open **Headquarters → Settings and invites**:
   - Name the group and write its mission.
   - Switch the **listener** on. It is a separate server on its own port (default 3095), not the DSH web UI.
     - Use **https** by giving it a certificate file and a key file, or keep it on a private network (LAN, VPN, Tailscale).
     - Over plain http on the internet, the company keys would travel in clear, and the company page warns about it.
   - Create an **invite**. The code is shown once, works once and expires (7 days by default).
   - From the shell: `./hq-cli listen on --port 3095` and `./hq-cli invite "Crypto company"`.
3. Give the company's owner the address (for example `https://hq.example.com:3095`) and the code.

## Join from a company (in that company's web UI)

Go to **Connections → Group headquarters**, enter the address and the invite code, choose the authority and what to share, and click **Join**. You can change the authority and the sharing at any time on the same page. Leaving deletes the key.

| Authority | Directives from the HQ | Group policies |
|---|---|---|
| **observe** | Shown on the Connections page; nobody acts on them | Not applied |
| **advise** (default) | Reach the CEO as advice: it accepts or declines each with a reason (`respond_hq`) | Guidance |
| **direct** | Reach the CEO as instructions: it carries them out, or reports them **blocked** with the reason, and you are told. Declining is refused in code. | The daily spend cap is **enforced** in the company's budget check; the rules bind the leaders |

Whatever the authority, real money, publishing, credentials and the company's charter stay with the company's owner.

**What a company shares** (each can be switched off): KPIs, budget and spend, goal progress; the leaders' plans; initiatives and gate results; the organisation and unit scores; advisory reviews and how the CEO answered them; health checks; and the owner's feed (off by default). The name, the mission and whether the loop runs are always sent. Keys, credentials and files never are.

**How the link works**
- The company always calls out, and the headquarters never connects in, so a company needs no open port and works behind NAT.
- Each sync (every 5 minutes by default) sends a snapshot and the answers to earlier directives. It receives the directives the company has not confirmed yet (a lost one is sent again) and the policies that apply to it.
- Keys and invite codes are kept at the headquarters as SHA-256 hashes only. The company keeps its key in `forge/company/group-secret.json` (mode 600).
- The listener accepts at most 1 MB per request and 60 requests a minute per address, and allows 10 join attempts an hour per address.

## The headquarters page

- **Portfolio**: every company with its link state, its authority, score, goal progress, delivery, spend, health, advisory grade and open directives. Click a company to see everything it shares. From there you can send it a directive, advice or a question, set its own policies (the lower spend cap of the group's and its own wins), suspend it, or remove it.
- **Directives**: send to one company or to all, and see each answer.
- **Group CEO**: chat with it. It reads the companies and acts only through tools: `send_directive`, `set_policy`, `respond_review`, `note_owner`.
  - When "handles events by itself" is on, it also takes a turn on its own when a review finishes, when a company declines or blocks a directive, or when a company joins.
  - "May send directives" can be switched off. It can then only advise and ask.
- **Review**: the independent review team (portfolio and capital, benchmarks and lessons, governance and advisory quality, plus a lead).
  - It reviews every 7 days, or on demand.
  - It grades each company and grades each company's own advisory team.
  - It recommends policies, directives, budget moves and lessons to pass between companies.
  - The group CEO must answer each recommendation. A rejected high-severity one is shown to you as an escalation.
  - You can accept a recommendation, which sends its proposed text to the company, or dismiss it.
- **Settings and invites**: the listener, invites, the group policies, the HQ's model (default `claude-opus-5-5`), its daily budget for model work (default $30), and the review schedule.

State lives in `forge/group-hq/`:
- `hq.json`
- `companies/<id>/snapshot.json`
- `companies/<id>/history.jsonl`, one KPI row every 30 minutes, for trends
- `chief.json`
- `reviews.json` and `reviews/<id>/REPORT.md`

## The company advisory team

`plugins/super-agent/lib/advisory.js`. It is created automatically, as five read-only agents on the profile's lead model (Opus 5.5 for the crypto company):

| Agent | Lens |
|---|---|
| `<prefix>advisor-organisation` | structure, reporting lines, staffing, overlapping or missing roles, skills, tools, models, memory |
| `<prefix>advisor-performance` | unit scores and trends, delivery and failure rates, reliability, cost per result, gate results |
| `<prefix>advisor-strategy` | the goal ladder, every leader's plan, direction, realistic timelines, what to stop or start |
| `<prefix>advisor-governance` | hard rules and charter, budget discipline, owner-only matters, follow-through on decisions and advice |
| `<prefix>advisory-lead` | checks the findings against the facts and merges them into one review |

**Independence is enforced in code.** The CEO, the COO and every super agent are refused when they try to update, staff, restructure or re-prompt these agents or their team. Staffing never picks them for company work. The team has its **own daily budget** (default $25), so a spent company budget does not stop its reviews. It reports to the company owner, and to the headquarters when the company shares advisory data.

**The cycle**
1. **Review**: every 7 days, on demand from the **Advisory** page, and after big events. Big events are a health check failing for 2 hours, or the company score falling 10 points, with at most one such review a day. Each review writes `forge/company/advisory/reviews/<id>/CONTEXT.md` (the facts) and `REPORT.md`.
2. **Recommend**: up to 8 ranked recommendations, each with its expected effect and, where one fits, the KPI it should move (15 KPIs are tracked: company score, goal progress, deliveries, delivery rate, failures, gate passes, spend, health, plan freshness, open owner questions, low-scoring units and more).
3. **Answer**: the CEO (or the COO) must answer each one with `respond_advice`:
   - **accept**, and put it in the plan;
   - **reject**, with the evidence;
   - **defer**, until a date;
   - later, **done**, with the evidence once it is carried out.
4. **Escalate**: the CEO is reminded after 48 hours. Advice still unanswered after 96 hours, or a rejected high-severity recommendation, goes to you. You can accept it on the CEO's behalf, and the CEO is then told to carry it out, or you can dismiss it.
5. **Follow up**: the next review measures every accepted recommendation against its KPI (when advised, when accepted, now) and records whether it helped.

## Files

| Where | What |
|---|---|
| `plugins/group-hq/` | the headquarters plugin: `lib/hq.js` (store and rules), `lib/listener.js` (the public endpoint), `lib/team.js` (group CEO and review team), `ui/index.html`, `bin/hq.js` (`./hq-cli`) |
| `plugins/super-agent/lib/group-link.js` | the company side of the link (join, sync, authority, sharing, `respond_hq`) |
| `plugins/super-agent/lib/advisory.js` | the company advisory team (`respond_advice`) |
| `plugins/super-agent/lib/connect-http.js` | the API of the Advisory and Connections pages |
| `plugins/company-dashboard/ui/advisory.html`, `connections.html` | the two pages, also in the sidebar |
