---
name: responsible-disclosure
description: Rules for handling discovered vulnerabilities - private reporting, no public disclosure, no attacks on live systems.
---
# Responsible disclosure rules

- Never test against production services, other people's systems, or networks you do not own.
  Reproduce only against a local build.
- PoCs are minimal and demonstrate the bug (crash, wrong check), not weaponized exploits.
- Reports are private drafts for the maintainers. Use the project's SECURITY.md, GitHub
  "Report a vulnerability" (private vulnerability reporting), or the listed security email.
- Standard embargo: 90 days or until a fix ships, whichever is first; coordinate CVE
  assignment through the maintainer or GitHub's CNA.
- Never publish findings, open public issues, or share details outside the report.
