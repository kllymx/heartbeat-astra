---
type: documentation
collab_reviewed: true
---

# Data and security

The public browser experience uses fictional sample data. It has no login, telemetry ingestion service, or database. The optional native adapter can display data from an existing Heartbeat desktop shell, which is not included here.

Default intelligence runs locally. Optional connected intelligence requires a server-side API key and explicit selection in the UI. The model service accepts a question plus a restricted aggregate context; it does not receive raw screen captures, window titles or app activity logs. Questions are user-authored text and should not include information you do not intend to send to the configured provider.

Do not expose the local model server to the public internet. It is intended for loopback development use. Do not use VITE-prefixed environment variables for secrets, commit .env files, or deploy credentials to GitHub Pages.

Exports are user-initiated JSON downloads containing measurements and derived observations. Raw screen captures are excluded. Inspect exports before sharing personal native data.

The animated portrait is an artistic visualization. Pattern labels and biological measurements are observational and are not a diagnosis or proof of causation.

To report a vulnerability, use GitHub's private vulnerability reporting when enabled. Do not post secrets or captured personal data in a public issue.
