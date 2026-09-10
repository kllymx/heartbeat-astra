---
type: assessment
collab_reviewed: true
---

# Heartbeat project assessment

Assessed September 10, 2026 from the local prototype at revision `b0fce6a`. This assessment distinguishes the original desktop prototype from the public observatory edition built for the hackathon. Findings below came from source inspection; native BLE, WHOOP accounts, and long-running collection were not exercised during this frontend release.

## Judgment

Heartbeat's strongest asset is the intersection of physiology, work context, and AI agent activity. The original prototype already captures and correlates signals that most productivity tools separate. Its weakest point for a live audience is comprehension: a dense operational console asks the viewer to interpret too much before the product's value is clear.

The most effective hackathon improvement is an interactive narrative layer over that existing data contract. It should make a single moment understandable, then let the viewer move through time and inspect evidence. The new observatory implements that layer while keeping synthetic demonstrations and actual model inference clearly distinguishable.

## Existing strengths

| Area | Evidence in the original source | Product advantage |
| --- | --- | --- |
| Native collection | Rust collectors for BLE, window context, input, screen text, and agent process activity | A genuinely distinctive combination of body and workspace signals |
| Correlated moments | `get_flashpoints`, `get_moment_context`, Recall captures and agent-session reports | Raw samples can lead to inspectable moments rather than abstract scores |
| Local persistence | SQLite source tables, migrations, retention controls, compaction and an event spine | A credible local-first foundation with recoverable data |
| Search | Recall supports keyword, semantic and hybrid modes, URL context and capture navigation | The product can answer “what was happening?” beyond the foreground app name |
| Native resilience | BLE supervision, reconnection and WHOOP backfill mechanisms | Considerable engineering already invested in imperfect devices and networks |
| Failure honesty | Last-good dashboard state, stale banners, browser-only fixture paths | An important foundation for trustworthy personal analytics |
| Behavioral detail | Agent sessions, tokens, context normalization, focus/active distinction | Richer understanding of AI-assisted work than token counts alone |
| Regression coverage | 64 Rust test attributes across storage and context modules at the assessed revision | More testing exists than the outdated README's largely-untested claim suggests |

## Concrete gaps and risks

### Public-release blockers

1. **Vendored implementation licensing.** The original `src-tauri/crates/whoop-protocol/NOTICE.md` explicitly describes `goose` as UNLICENSED and retained for a personal project. It also notes missing license material in an OpenWhoop reference snapshot. The native source cannot simply be included under a new permissive project license. The public edition excludes it entirely.
2. **Private history and artifacts.** The original repository is private and the local branch was 67 commits ahead of its remote. Publishing that history wholesale would expose more than the new feature scope. A clean repository was prepared with only the observatory, contracts, tests and supporting files. Old screenshots, embedded binaries and named-person mock conversations were excluded.
3. **Reproducible installation.** The inherited frontend paired Vite 8 with a Tailwind Vite plugin whose peer range stopped at Vite 7. A clean npm install failed. The new interface uses ordinary CSS, so the unused Tailwind integration was removed from the public edition instead of bypassing peer checks.

### Integration priorities

The native collector needs a separate production review covering OAuth, secret storage, capture exclusions, content security policy, sample provenance, and signed distribution. The detailed findings from the private prototype are retained locally rather than published with this frontend edition.

The new observatory's boundary is deliberately narrow: it consumes a typed dashboard snapshot, derives transparent observations, and renders an interactive exploration surface. It does not package or redistribute the private native app.

## What the new edition adds

| Capability | Implementation | Why it matters in the demo |
| --- | --- | --- |
| Human observatory | New responsive shell, signal portrait, metric cards and compact evidence panel | The product idea is legible at a glance |
| Day replay | Shared time selection drives HR, app, agent and chapter views | Makes correlations tangible through one coherent interaction |
| Memory constellation | Derived graph of apps, contexts and sessions with search and a moment inspector | Reveals relationships hidden in a flat activity table |
| Pattern lab | Three reproducible synthetic scenarios with calculated metrics | Judges can explore contrasting days without hardware or credentials |
| Local intelligence | Duration-weighted analysis, observations and constrained Q&A | A deterministic, testable baseline with explicit evidence |
| Optional real model | Server-side Responses API connection with an opt-in client | Adds actual model reasoning without embedding credentials in the frontend |
| Shareable artifact | Aggregate JSON export and a static public demo | The result can be tried, discussed and forked after the presentation |

## Recommended sequence after the hackathon

1. Resolve native licensing and privacy controls before shipping the collector broadly.
2. Add an explicit native telemetry quality/provenance contract, then validate the new observatory against real recorded sessions and sparse-data cases.
3. Build a model evaluation set from consented, redacted sessions: unsupported causal claims, evidence fidelity, handling missing data, and useful follow-up questions.
4. Extract Rust read-model modules and normalize the API around moments, sessions, coverage and source identity.
5. Add signing/notarization and upgrade/recovery tests; only then position the desktop product as generally installable.

The release is a compelling exploration surface and integration layer. It does not resolve the original collector's licensing, device bonding, or production distribution constraints.
