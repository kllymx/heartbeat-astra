---
type: documentation
collab_reviewed: true
---

# Optional connected model

Heartbeat runs with deterministic local signal analysis by default. The optional Node server uses the OpenAI Responses API when both `OPENAI_API_KEY` and `OPENAI_MODEL` are configured. No model identifier is guessed. Set the exact Responses API model ID your project can access; the chosen model must support Structured Outputs. Status indicates configuration, not a successful authentication or model-access check.

## Run locally

Use Node 22.18 or later. From the repository root, copy `.env.example` to `.env`, fill in the two server-only values, and run:

```sh
npm run model:server
```

Start the frontend in another terminal:

```sh
npm run dev
```

The server listens only on `127.0.0.1:4318`. The Vite development proxy routes `/api` to it. Reload the frontend after starting or reconfiguring the server, then select **Use connected model** in the Intelligence panel. The browser never receives the API key. Without the server, the local analyzer still works. Public static deployments have no connected model unless their own server routes are separately provided; this helper is intended for local development and demos.

The package script runs `node --env-file-if-exists=.env server/astra.mjs`. Running it without `.env` starts an unavailable endpoint so local analysis remains the default.

## Data sent

A question sends the text the user typed and a server-rebuilt context object containing:

- The source category: synthetic demonstration, local telemetry aggregates, or unspecified.
- Numeric focus/active/agent/recovery minutes, switch count, average heart rate, and average HRV; invalid or absent values become `null`.
- Chapter category, timestamps, and average heart rate.
- Finding tone and timestamps.

The server discards all unrecognized fields, raw captures, window titles, app names, narratives, chapter titles, and free-form finding evidence. It replaces chapter and finding identifiers with opaque numbered IDs before calling the API; returned chapter references are mapped back locally. This deliberately limits questions about specific apps. A user can still include private text in their question, which is sent as entered. The request uses `store: false`; it does not claim to override OpenAI's other data policies. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

The model is instructed to cite only supplied measurements, label synthetic data, acknowledge missing context, and avoid medical or causal conclusions. Generated observations can still be wrong and should be checked against the timeline.

## Protocol and limits

`GET /api/astra/status` returns `{available, provider, model}`. `POST /api/astra/ask` accepts `{question, context}` and returns `{answer, evidence, relatedChapterIds, provider, model}`. Errors contain `{error: {code, message}}`; raw provider messages, credentials, and request bodies are not logged or returned.

Requests are limited to 64 KiB, questions to 1,000 characters, chapters to 96, findings to 64, and concurrency to two requests. The model has 45 seconds to answer; the browser allows 50 seconds. Request-body reads time out after 10 seconds. Provider payloads are limited to 256 KiB. Browser cancellation aborts the upstream request. Only loopback hosts and local browser origins are accepted, and JSON content type is required. This is not a multi-user authenticated service; other local processes and local-origin pages are trusted.

The provider call follows the [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs), with a strict JSON schema in `text.format`. Refusal, incomplete output, invalid JSON, invalid answer structure, provider errors, and unknown chapter references are handled explicitly. The model name returned to the frontend is the server's configured ID.

## Verification

```sh
node --test server/astra.test.mjs
```

Tests use injected mock responses and a temporary loopback HTTP listener. They also check that all three actual demo analyses satisfy the endpoint contract. They make no OpenAI API calls and require no key. A live response still requires valid credentials and access to the selected model.
