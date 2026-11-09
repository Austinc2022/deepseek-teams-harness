# Venture Studio: visual guide

_The whole system on a few pages of diagrams. Last updated 2026-11-09._
_The full reference is [VENTURE-STUDIO.md](VENTURE-STUDIO.md)._

---

## 0. The 30-second version

> Every morning AI agents look for new app business ideas. Every idea they have ever found goes into a ledger, so none repeats. A committee of AI judges scores the best ones. Every day the autopilot takes the best approved idea, builds it, tests it, and deploys it if it passes the automatic quality checks. Every Sunday the system reviews what worked and rewrites its own scouting instructions.

```mermaid
flowchart LR
  A["🔎 Scout<br/>find ideas"] --> B["🧠 Remember<br/>idea ledger"]
  B --> C["⚖️ Judge<br/>investment committee"]
  C --> D["📐 Plan<br/>PRD, UX, architecture"]
  D --> E["🛠 Build<br/>code, tests, review"]
  E --> F{"✅ Quality<br/>gate"}
  F -->|pass| G["🚀 Go live<br/>deploy"]
  F -->|fail| H["🛑 Stop and report"]
  G --> I["📈 Learn<br/>weekly retro"]
  H --> I
  I -->|"better playbook"| A
```

---

## 1. What I did

```mermaid
timeline
  title Build log
  Investigate : Read the harness (Agent Forge, teams, workflows, memory, skills, scheduler)
              : Two research agents checked about 80 GitHub skill paths
  Plan : Designed 8 teams, the workflows, memory and safety
       : You approved the plan
  Build v1 : Installed 70 GitHub skills and scanned them for risky code
           : Wrote 2 local skills, 27 new agents, 8 teams and 4 workflows
           : Upgraded 9 existing dev agents with new skills
           : Shared ledger library, super team and README
  Test : Fake-agent tests confirmed repeats are rejected and the ledger updates
       : Real scouting run produced 6 ideas in 2.5 minutes
  v2, your request : Moved scheduling to DSH Automation tasks (new plugin)
                   : Autonomous go-live with an automatic quality gate
                   : New venture-autopilot workflow
                   : Restarted DSH, 3 automation tasks registered
                   : Wrote these docs
```

### Files I created or changed

```mermaid
flowchart TB
  subgraph NEW["🆕 Created"]
    N1["forge/agents/ - 27 new agents"]
    N2["forge/teams/ - 7 new teams"]
    N3["forge/orchestrations/<br/>idea-scout, idea-evaluate,<br/>venture-pipeline, venture-autopilot, weekly-retro"]
    N4["forge/lib/venture.mjs<br/>shared ledger and committee code"]
    N5["forge/skills/ - 70 GitHub skills,<br/>plus venture-scoring and desktop-packaging"]
    N6["plugins/venture-automation/<br/>DSH Automation tasks plugin"]
    N7["forge/super-teams/venturestudio01.json<br/>forge/super-team-projects.json"]
    N8["scripts/install-venture-skills.sh"]
    N9["docs/VENTURE-STUDIO.md<br/>docs/VENTURE-STUDIO-VISUAL-GUIDE.md"]
  end
  subgraph CHG["✏️ Changed"]
    C1["9 existing dev agents: more skills,<br/>2 new sub-agents for implementer"]
    C2["forge/teams/dev-team.yaml: 2 new members"]
    C3["README.md: Venture studio section"]
    C4["scripts/schedule-daily.sh: weekday option<br/>and PATH fix (no longer needed)"]
    C5[".dsh-home/profiles/web: plugin added,<br/>DSH web restarted"]
  end
```

---

## 2. System map: who talks to whom

```mermaid
flowchart TB
  subgraph DSH["DeepSeek Harness, running ./dsh web"]
    SCHED["⏰ Automation tasks<br/>DSH scheduler"]
    CONV["💬 Conversation:<br/>'Venture studio autopilot'<br/>lead agent"]
    PLUG["🔌 venture-automation plugin<br/>registers tasks at startup"]
    FORGE["⚙️ Agent Forge engine<br/>runs workflows and agents"]
    SUPER["👑 Super team page<br/>venture-chief plus 8 teams"]
  end
  subgraph CLAUDE["Your Claude subscription"]
    AG["🤖 Each agent = a real<br/>Claude Code session"]
  end
  subgraph FILES["📁 State on disk: forge/"]
    LEDGER[("reports/ideas/ledger.json")]
    PB[("reports/ideas/playbook.md")]
    MEM[("memory/ns/venture-lessons")]
    REPOS[("workspaces/ventures/id<br/>one git repo per product")]
    RUNS[("runs/id<br/>transcripts and artifacts")]
  end
  subgraph WEB["🌐 Outside world"]
    NET["Web, Reddit, HN, app stores"]
    GH["GitHub, private repos"]
    HOST["Vercel / Cloudflare<br/>live sites"]
  end

  PLUG -->|"creates once"| SCHED
  PLUG -->|"creates once"| CONV
  SCHED -->|"delivers instruction"| CONV
  CONV -->|"forge_run"| FORGE
  SUPER --> FORGE
  FORGE --> AG
  AG --> NET
  AG --> GH
  AG --> HOST
  FORGE <--> LEDGER
  FORGE <--> PB
  AG <--> MEM
  AG --> REPOS
  FORGE --> RUNS
```

---

## 3. A week on autopilot (Australia/Sydney time)

```mermaid
gantt
  title Typical week
  dateFormat  YYYY-MM-DD HH:mm
  axisFormat  %a %H:%M
  section Daily
  idea-scout 06:00            :a1, 2026-11-10 06:00, 30m
  venture-autopilot 09:00     :a2, 2026-11-10 09:00, 4h
  idea-scout 06:00            :b1, 2026-11-11 06:00, 30m
  autopilot skips (weekly limit) :b2, 2026-11-11 09:00, 5m
  idea-scout 06:00            :c1, 2026-11-12 06:00, 30m
  autopilot skips             :c2, 2026-11-12 09:00, 5m
  section Weekly
  weekly-retro Sun 07:30      :r1, 2026-11-15 07:30, 20m
```

Default: at most **1 new product a week** (`maxPerWeek=1`). On the other days the autopilot checks its limits and exits in seconds.

---

## 4. How an Automation task becomes a workflow run

```mermaid
sequenceDiagram
  autonumber
  participant S as ⏰ DSH scheduler
  participant C as 💬 Autopilot conversation
  participant L as 🤖 Lead agent
  participant F as ⚙️ Agent Forge engine
  participant A as 🤖 Team agents
  participant D as 📁 forge/ files

  Note over S: 06:00, task "Venture: daily idea scouting"
  S->>C: deliver instruction "Call forge_run idea-scout"
  C->>L: new turn
  L->>F: forge_run(orchestration="idea-scout")
  F-->>L: started run 2026...-abcd
  L-->>C: reply with the run id, then stop
  F->>A: scouts in parallel, curator, committee
  A->>D: report, ledger update, evaluations
```

The lead agent only starts the workflow; the workflow runs in the background inside the harness. You can watch it live on the Workflows → **Runs** tab or with `./forge-cli runs`.

---

## 5. `idea-scout`: finding ideas without repeats

```mermaid
flowchart TB
  START(["⏰ 06:00"]) --> CTX["Load learning context:<br/>• ledger, all known ideas<br/>• playbook.md<br/>• venture-lessons<br/>• lens weights and recent search angles"]
  CTX --> ALLOC["Allocate scouts:<br/>1 per lens, plus 1 to the best lens,<br/>plus 1 to the least-used lens"]
  ALLOC --> P

  subgraph P["Scouts run in parallel, no memory"]
    direction LR
    S1["ios-scout<br/>Apple App Store"]
    S2["android-scout<br/>Google Play"]
    S3["mac-scout<br/>Mac App Store, Setapp"]
    S4["windows-scout<br/>Microsoft Store"]
    S5["web-saas-scout<br/>web apps, SaaS, B2B"]
    S6["extension-scout<br/>Chrome / Edge / Firefox"]
    S7["wearables-xr-scout<br/>Watch, Wear OS, Vision Pro, Quest"]
  end

  P --> RAW["Raw ideas<br/>with evidence URLs and revenue estimates"]
  RAW --> DEDUP{"Code check against<br/>the ledger:<br/>word overlap of 50% or more?"}
  DEDUP -->|yes| SEEN["Count as 'seen again'<br/>no new entry"]
  DEDUP -->|no| CUR["idea-curator, has memory<br/>• catches reworded repeats<br/>• merges similar ideas<br/>• quick score 0-100<br/>• saves lessons"]
  CUR --> REC["Write to the ledger, with a lock<br/>+ update lens statistics"]
  REC --> TOP{"Quick score<br/>60 or more?"}
  TOP -->|"top 1"| EVAL["⚖️ idea-evaluate"]
  TOP -->|others| SL["status: shortlisted or new"]
  EVAL --> REP["📄 reports/ideas/date.md"]
  SL --> REP
```

---

## 6. `idea-evaluate`: the investment committee

```mermaid
flowchart LR
  IDEA["Idea card"] --> J1 & J2 & J3 & J4
  subgraph JUDGES["4 independent judges in parallel, no memory"]
    J1["📊 market-analyst<br/>market size, competitors"]
    J2["💰 unit-economist<br/>pricing, CAC, LTV, revenue"]
    J3["🔧 feasibility-engineer<br/>can it ship in 8 weeks?"]
    J4["😈 devils-advocate<br/>why it will fail"]
  end
  J1 & J2 & J3 & J4 --> CHAIR["👨‍⚖️ ic-chair, keeps a verdict journal<br/>weighs the evidence, resolves disagreements"]
  CHAIR --> SCORE["Code computes the final score<br/>from fixed weights"]
  SCORE --> V{"Verdict"}
  V -->|"70 or more, strong evidence"| PUR["✅ pursue"]
  V -->|"50-69"| WAT["👀 watch"]
  V -->|"under 50 or a kill rule"| REJ["❌ reject"]
```

### Scoring weights (out of 100)

```mermaid
pie showData
  title Weight of each scoring area
  "Demand evidence" : 20
  "Market size" : 15
  "Revenue ceiling" : 15
  "Feasibility" : 15
  "Moat" : 10
  "Time to revenue" : 10
  "Competition gap" : 10
  "Risk" : 5
```

### Revenue tiers (gross revenue per day at maturity)

| Tier | Per day | Meaning |
|---|---|---|
| T0 | under $10k | lifestyle business |
| T1 | $10k-$100k | strong indie business |
| T2 | $100k-$1M | venture scale |
| T3 | $1M-$10M | category leader |
| **T4** | **$10M or more** | **north star, a handful exist** |

---

## 7. `venture-autopilot`: deciding what to build

```mermaid
flowchart TB
  T(["⏰ 09:00"]) --> P1{"AUTOPILOT-PAUSED<br/>file exists?"}
  P1 -->|yes| X1["Exit: paused"]
  P1 -->|no| P2{"Another autopilot<br/>run active?"}
  P2 -->|yes| X2["Exit: busy"]
  P2 -->|no| P3{"Weekly limit<br/>reached?"}
  P3 -->|yes| X3["Exit: limit"]
  P3 -->|no| P4{"Any 'pursue' idea<br/>scoring 70 or more?"}
  P4 -->|yes| PICK["Pick the highest score"]
  P4 -->|no| EV["Evaluate the top 2<br/>shortlisted ideas"]
  EV --> P5{"Now a 'pursue'<br/>idea scoring 70+?"}
  P5 -->|no| X4["Exit: nothing good enough"]
  P5 -->|yes| PICK
  PICK --> VP["🚀 venture-pipeline<br/>build=true, publish=true"]
  VP --> R["📄 autopilot-date-idea.md"]
```

---

## 8. `venture-pipeline`: from idea to a live product

```mermaid
flowchart TB
  I["Idea plus committee verdict"] --> REPO["Create repo<br/>workspaces/ventures/id"]
  REPO --> PRD["📝 product-manager<br/>docs/PRD.md"]
  PRD --> UX & ARCH
  UX["🎨 ux-designer<br/>docs/UX.md, wireframes.html"]
  ARCH["🏗 solution-architect<br/>ADRs, ARCHITECTURE.md, PLAN.md"]
  UX & ARCH --> PR{"plan-reviewer<br/>approved?"}
  PR -->|"no, up to 2 rounds"| ARCH
  PR -->|yes| KIT

  subgraph KIT["Launch kit in parallel, drafts only"]
    M["📣 growth-marketer<br/>LAUNCH-KIT.md"]
    BR["🎨 brand-designer<br/>BRAND.md and visuals"]
    LG["⚖️ legal-drafter<br/>privacy, terms, compliance"]
  end

  KIT --> BUILD["🛠 dev-pipeline<br/>plan, implementer with sub-agents,<br/>code and security review, fix loops, QA"]
  BUILD --> AUD["🔍 dependency-auditor<br/>supply chain, CI, dangerous APIs"]
  AUD --> CRIT{"Critical<br/>findings?"}
  CRIT -->|yes| FIX["implementer fixes, then re-audit"] --> GATE
  CRIT -->|no| GATE

  GATE{"✅ QUALITY GATE<br/>QA passed AND<br/>0 blocking reviews AND<br/>0 critical audit findings"}
  GATE -->|fail| NL["Not live<br/>status: building or built"]
  GATE -->|pass| REL

  subgraph REL["Release and go live"]
    CI["⚙️ devops-engineer<br/>CI/CD, private GitHub repo"]
    PK["📦 desktop-packager<br/>installers, updater"]
    MP["📱 mobile-packager<br/>TestFlight, Play internal track"]
    EP["🧩 extension-engineer<br/>store zips"]
    DEP["☁️ cloud-deployer<br/>preview, health check, production"]
  end
  REL --> HC{"Production<br/>health check OK?"}
  HC -->|no| RB["↩️ Roll back"]
  HC -->|yes| LIVE["🎉 LIVE<br/>URLs recorded in the ledger"]
```

### What ends up in each product repo

```
forge/workspaces/ventures/<idea-id>/
├── docs/
│   ├── IDEA.md            idea card and committee verdict
│   ├── PRD.md             what to build and why
│   ├── UX.md              user flows, screens, design tokens
│   ├── wireframes.html    clickable mock-up of key screens
│   ├── ARCHITECTURE.md    stack and structure
│   ├── PLAN.md            step-by-step build plan
│   └── adr/               architecture decision records
├── launch/
│   ├── LAUNCH-KIT.md      positioning, landing copy, launch plan, SEO, ASO
│   ├── BRAND.md + brand/  names, voice, colors, visuals
│   └── legal/             privacy policy, terms outline, compliance (drafts)
├── src/ ...               the app (built by dev-team)
├── .github/workflows/     CI/CD
├── DEPLOY.md              how it is deployed
└── RELEASE-CHECKLIST.md   secrets and certificates still missing
```

---

## 9. Life of an idea in the ledger

```mermaid
stateDiagram-v2
  [*] --> new: scout found it, quick score under 60
  [*] --> shortlisted: quick score 60 or more
  new --> pursue: committee
  shortlisted --> pursue: committee 70+
  shortlisted --> watch: committee 50-69
  shortlisted --> rejected: committee under 50 or a kill rule
  pursue --> planned: venture-pipeline, docs and launch kit
  planned --> building: build started or QA failed
  planned --> built: QA passed
  building --> built
  built --> live: gate passed and deployed
  live --> [*]
  rejected --> [*]
  note right of new: Seen again later? timesSeen goes up. Never a duplicate entry.
```

---

## 10. The learning loop

```mermaid
flowchart LR
  subgraph DAILY["Every day"]
    SC["Scouts<br/>use the playbook and lessons"] --> LG[("ledger.json<br/>per-lens: runs, ideas,<br/>strong, duplicates, angles")]
    CU["Curator"] -->|"memory_save lessons"| LS[("venture-lessons")]
    CM["Committee"] -->|"real scores"| LG
  end
  subgraph WEEKLY["Every Sunday: weekly-retro"]
    ST["Statistics in code:<br/>• strong-idea rate per lens<br/>• duplicate rate<br/>• quick score vs committee score<br/>• verdict mix"] --> RC["retro-curator"]
    RC --> NP[("playbook.md<br/>rewritten")]
    RC --> LW[("lens weights 0.5-2")]
    RC --> CAL[("curator calibration note")]
    RC --> LS
  end
  LG --> ST
  NP --> SC
  LW -->|"more scouts on good lenses"| SC
  CAL --> CU
  LS --> SC
```

How a scout gets allocated: score = lens weight × (strong ideas + 1) / (all ideas + 2). Extra scouts go to the highest score, and one always explores the least-used lens.

---

## 11. Memory: who remembers what

```mermaid
flowchart TB
  subgraph STATELESS["🧊 Stateless: fresh every run, so their judgement stays independent"]
    direction LR
    a1[5 scouts] ~~~ a2[4 judges] ~~~ a3[coder, test-writer] ~~~ a4[ux-designer, brand, legal] ~~~ a5[frontend and desktop engineers]
  end
  subgraph STATEFUL["🧠 Stateful"]
    direction LR
    b1["idea-curator, retro-curator<br/>→ shared notes: venture-lessons"]
    b2["ic-chair<br/>→ journal of past verdicts"]
    b3["product-manager, solution-architect,<br/>planner, implementer<br/>→ team memory, notes and journal"]
    b4["venture-chief, growth-marketer<br/>→ own notes"]
    b5["devops, packager, deployer, release,<br/>metrics, feedback, QA → journals"]
  end
  subgraph FILESTATE["📁 Code-controlled state, the source of truth"]
    direction LR
    c1[("ledger.json")] ~~~ c2[("playbook.md")] ~~~ c3[("lens weights<br/>and calibration")]
  end
```

---

## 12. All teams and agents at a glance

```mermaid
mindmap
  root((👑 Venture studio))
    idea-scouts
      ios-scout
      android-scout
      mac-scout
      windows-scout
      web-saas-scout
      extension-scout
      wearables-xr-scout
      idea-curator 🧠
    venture-evaluators
      market-analyst
      unit-economist
      feasibility-engineer
      devils-advocate
      ic-chair 🧠
    product-planning
      product-manager 🧠
      ux-designer
      solution-architect 🧠
      plan-reviewer
    dev-team
      planner
      implementer
        coder
        test-writer
        frontend-engineer
        desktop-app-engineer
        ios-app-engineer
        android-app-engineer
        extension-engineer
      code-reviewer
      security-reviewer
      qa-engineer
      release-manager
    quality-security
      qa-engineer
      code-reviewer
      security-reviewer
      dependency-auditor
    release-ops
      devops-engineer
      desktop-packager
      mobile-packager
      cloud-deployer
      release-manager
    growth-launch
      growth-marketer 🧠
      brand-designer
      legal-drafter
    learning-loop
      metrics-analyst
      feedback-analyst
      retro-curator 🧠
```

### Main GitHub skills used by each team

| Team | Main skills |
|---|---|
| idea-scouts | last30days, aso-audit, sentiment-analysis, market-sizing, competitor-analysis, venture-scoring |
| venture-evaluators | market-sizing, market-research-reports, financial-analyst, saas-metrics-coach, pricing-strategy, business-model, identify-assumptions-new |
| product-planning | create-prd, write-spec, user-personas, prioritization-frameworks, frontend-design, architecture-decision-records, writing-plans, brainstorming |
| dev-team | test-driven-development, systematic-debugging, executing-plans, subagent-driven-development, verification-before-completion, vercel-react-best-practices, desktop-packaging |
| quality-security | playwright-skill, webapp-testing, e2e-testing-patterns, find-bugs, security-review, differential-review, semgrep, supply-chain-risk-auditor |
| release-ops | github-actions-templates, deployment-pipeline-design, secrets-management, deploy-to-vercel, wrangler, desktop-packaging |
| growth-launch | product-marketing, launch, copywriting, seo-audit, cro, pricing, aso, canvas-design, theme-factory, privacy-policy, compliance-check |
| learning-loop | metrics-review, cohort-analysis, north-star-metric, analytics, analyze-feature-requests, synthesize-research |

---

## 13. Safety rails while running autonomously

```mermaid
flowchart LR
  subgraph AUTO["✅ Done without you"]
    y1[Scout, judge, plan]
    y2[Write code, commit]
    y3[Create private GitHub repo]
    y4[Deploy to free Vercel / Cloudflare]
    y5[Publish installers]
    y6[Roll back a failed deploy]
  end
  subgraph NEVER["⛔ Never, even on autopilot"]
    n1[Spend money: domains, plans, ads, certificates]
    n2[Post on social media or communities as you]
    n3[Make source code public]
    n4[Commit secrets or export certificates]
    n5[Ship if the quality gate fails]
  end
```

| Control | How |
|---|---|
| Pause autopilot | `touch forge/reports/ideas/AUTOPILOT-PAUSED` (delete the file to resume) |
| Pause any task | **Automation tasks** page → Pause |
| Run a task now | **Automation tasks** page → Run now |
| Change times | **Automation tasks** page → Edit, or `plugins/venture-automation/tasks.json` |
| Build more per week | edit the autopilot task's instruction: `args_json "{\"maxPerWeek\":2}"` |
| See what autopilot would build | `./forge-cli run venture-autopilot dryRun=true` |

---

## 14. Current status: what works and what's needed

| Item | Status |
|---|---|
| All agents, teams, workflows and skills load | ✅ verified |
| Repeat detection, ledger, learning statistics | ✅ fake-agent tests |
| Real scouting run | ✅ 6 ideas in 2.5 minutes |
| Autopilot: pick, build, gate, live (logic) | ✅ fake-agent test |
| Automation tasks registered in DSH | ✅ 06:00, 09:00, Sun 07:30 Sydney |
| First real automatic delivery | ⏳ tomorrow 06:00, or press Run now |
| GitHub login (`gh`) | ✅ logged in |
| **Vercel or Cloudflare login** | ❌ **needed to go live**: run `npx vercel login` or `npx wrangler login` |
| Real end-to-end build and go-live | ⏳ not run yet (heavy subscription usage) |
| macOS code signing | ⚠️ none configured, so installers are unsigned |

---

## 15. Cheat sheet

```bash
cd ~/Documents/deepseekharness/deepseek-teams-harness

./dsh web                                         # start the harness; tasks only fire while it runs
./forge-cli run idea-scout                        # scout now
./forge-cli run idea-evaluate idea=<id>           # committee on one idea
./forge-cli run venture-autopilot dryRun=true     # what would it build?
./forge-cli run venture-pipeline idea=<id>        # plan only
./forge-cli run venture-pipeline idea=<id> build=true publish=true   # build and go live
./forge-cli run weekly-retro                      # learning loop now
./forge-cli runs                                  # recent runs

open forge/reports/ideas/                         # reports, ledger, playbook
```
