import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { BODY_LIMIT, createAstraServer, isLocalOrigin, parseModelResponse, sanitizeContext, validateRequest } from './astra.mjs'

const TEST_KEY = 'sk-test-server-only-never-real'
const TEST_MODEL = 'explicit-test-model'

function fixture() {
  return {
    question: 'When was I most focused?',
    context: {
      source: 'synthetic demonstration',
      metrics: { focusMinutes: 80, activeMinutes: 120, switchCount: 12, averageHr: 72, averageHrv: 54, agentMinutes: 20, recoveryMinutes: 15 },
      chapters: [{ id: 'local-private-chapter', kind: 'focus', startTs: 1_789_060_000, endTs: 1_789_061_800, avgHr: 70 }],
      findings: [{ id: 'private-finding', tone: 'positive', startTs: 1_789_060_000, endTs: 1_789_061_800, evidence: ['PrivateApp and private screen text'] }],
    },
  }
}

function completion(answer = {}) {
  return {
    status: 'completed', model: TEST_MODEL,
    output: [{ type: 'reasoning', summary: [] }, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({
      answer: 'In this synthetic day, chapter-1 contains a focus interval.',
      evidence: ['Focus time: 80 minutes.'], relatedChapterIds: ['chapter-1'], ...answer,
    }) }] }],
  }
}

const providerResponse = payload => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
async function start(t, options = {}) {
  const server = createAstraServer({ apiKey: TEST_KEY, model: TEST_MODEL, fetchImpl: async () => providerResponse(completion()), ...options })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  })
  return `http://127.0.0.1:${server.address().port}`
}

function post(url, payload = fixture(), options = {}) {
  return fetch(`${url}/api/astra/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), ...options })
}

test('status requires an explicit key and model without exposing the key or probing OpenAI', async t => {
  for (const options of [{ apiKey: '', model: '' }, { apiKey: TEST_KEY, model: '' }, { apiKey: '', model: TEST_MODEL }, { apiKey: TEST_KEY, model: 'not a model id' }]) {
    const url = await start(t, { ...options, fetchImpl: () => assert.fail('Status must not call OpenAI') })
    const response = await fetch(`${url}/api/astra/status`)
    const data = await response.json()
    assert.equal(data.available, false)
    assert.equal(data.provider, 'none')
    assert.ok(data.model === TEST_MODEL || data.model === null)
    assert.equal(JSON.stringify(data).includes(TEST_KEY), false)
    assert.equal((await post(url)).status, 503)
  }
  const url = await start(t)
  assert.deepEqual(await (await fetch(`${url}/api/astra/status`)).json(), { available: true, provider: 'openai', model: TEST_MODEL })
})

test('server sends only allowlisted aggregates using Responses and maps chapter IDs locally', async t => {
  let called = false
  const input = fixture()
  input.context.rawScreen = 'secret screenshot'
  input.context.appName = 'PrivateApp'
  input.context.metrics.windowTitle = 'secret window'
  input.context.metrics.nested = { screen: 'private nested text' }
  input.context.chapters[0].title = 'secret chapter title'
  const url = await start(t, { fetchImpl: async (endpoint, options) => {
    called = true
    assert.equal(endpoint, 'https://api.openai.com/v1/responses')
    assert.equal(options.headers.Authorization, `Bearer ${TEST_KEY}`)
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    const payload = JSON.parse(options.body)
    assert.equal(payload.model, TEST_MODEL)
    assert.equal(payload.store, false)
    assert.equal(payload.text.format.type, 'json_schema')
    assert.equal(payload.text.format.strict, true)
    assert.equal(payload.text.format.schema.additionalProperties, false)
    assert.equal(payload.tools, undefined)
    for (const secret of ['PrivateApp', 'secret screenshot', 'secret window', 'private nested text', 'secret chapter title', 'local-private-chapter', 'private-finding', 'private screen text']) {
      assert.equal(options.body.includes(secret), false, `Unexpected private value: ${secret}`)
    }
    const context = JSON.parse(payload.input[0].content).context
    assert.equal(context.metrics.focusMinutes, 80)
    assert.deepEqual(context.chapters[0], { id: 'chapter-1', kind: 'focus', startTs: 1_789_060_000, endTs: 1_789_061_800, avgHr: 70 })
    return providerResponse(completion({ relatedChapterIds: ['chapter-1', 'invented-chapter', 'chapter-1'] }))
  } })
  const response = await post(url, input)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    answer: 'In this synthetic day, chapter-1 contains a focus interval.', evidence: ['Focus time: 80 minutes.'],
    relatedChapterIds: ['local-private-chapter'], provider: 'openai', model: TEST_MODEL,
  })
  assert.equal(called, true)
})

test('aggregate validation removes nested/freeform values and rejects invalid intervals and sizes', () => {
  const input = fixture().context
  input.source = 'PrivateApp source'
  input.metrics.averageHr = '72'
  input.metrics.averageHrv = Number.NaN
  input.metrics.focusMinutes = -1
  const result = sanitizeContext(input)
  assert.equal(result.source, 'unspecified')
  assert.equal(result.metrics.averageHr, null)
  assert.equal(result.metrics.averageHrv, null)
  assert.equal(result.metrics.focusMinutes, null)
  assert.equal(result.findings[0].evidence, undefined)
  assert.throws(() => sanitizeContext({ ...input, chapters: Array(97).fill(input.chapters[0]) }))
  assert.throws(() => sanitizeContext({ ...input, findings: Array(65).fill(input.findings[0]) }))
  assert.throws(() => sanitizeContext({ ...input, chapters: [{ ...input.chapters[0], endTs: 1 }] }))
  assert.throws(() => sanitizeContext({ ...input, chapters: [{ ...input.chapters[0], kind: 'PrivateApp' }] }))
  assert.throws(() => validateRequest({ question: ' ', context: input }))
  assert.throws(() => validateRequest({ question: 'x'.repeat(1001), context: input }))
  assert.throws(() => validateRequest({ question: 'hello', context: [] }))
})

test('localhost origins and Host headers are enforced with CORS only for allowed origins', async t => {
  for (const origin of ['http://localhost:5178', 'https://localhost', 'http://127.0.0.1:5178', 'http://[::1]:5178']) assert.equal(isLocalOrigin(origin), true)
  for (const origin of ['null', 'http://localhost.evil.example', 'https://example.com', 'http://127.0.0.1/path', 'http://user@localhost', 'file://localhost']) assert.equal(isLocalOrigin(origin), false)
  const url = await start(t, { fetchImpl: () => assert.fail('Disallowed requests must not call OpenAI') })
  const foreign = await post(url, fixture(), { headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' } })
  assert.equal(foreign.status, 403)
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null)
  // Node's fetch normalizes Host; use the HTTP client to exercise the actual
  // hostile header received by the server.
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${url}/api/astra/status`, { headers: { Host: 'evil.example' } }, response => {
      response.resume()
      response.on('end', () => resolve(response.statusCode))
    })
    request.on('error', reject)
    request.end()
  })
  assert.equal(hostileHostStatus, 403)
  assert.equal((await fetch(`${url}/api/astra/status`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403)
  const preflight = await fetch(`${url}/api/astra/ask`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5178' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5178')
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Content-Type')
})

test('malformed, oversized, unsupported and unknown requests never reach the provider', async t => {
  const url = await start(t, { fetchImpl: () => assert.fail('Invalid requests must not call OpenAI') })
  assert.equal((await post(url, null)).status, 400)
  assert.equal((await post(url, fixture(), { body: '{broken' })).status, 400)
  assert.equal((await post(url, fixture(), { headers: { 'Content-Type': 'text/plain' } })).status, 415)
  assert.equal((await post(url, fixture(), { body: 'x'.repeat(BODY_LIMIT + 1) })).status, 413)
  assert.equal((await fetch(`${url}/api/astra/ask`)).status, 405)
  assert.equal((await fetch(`${url}/api/unknown`)).status, 404)
  const streamed = await new Promise((resolve, reject) => {
    const request = httpRequest(`${url}/api/astra/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, response => {
      response.resume()
      response.on('end', () => resolve(response.statusCode))
    })
    request.on('error', reject)
    request.write('x'.repeat(BODY_LIMIT / 2))
    request.end('x'.repeat(BODY_LIMIT / 2 + 1))
  })
  assert.equal(streamed, 413)
})

test('provider errors are sanitized and never echo provider bodies or secrets', async t => {
  for (const [status, expected] of [[401, 503], [403, 503], [404, 503], [429, 429], [500, 502]]) {
    const url = await start(t, { fetchImpl: async () => new Response(`private diagnostic ${TEST_KEY}`, { status }) })
    const response = await post(url)
    assert.equal(response.status, expected)
    const text = await response.text()
    assert.equal(text.includes(TEST_KEY), false)
    assert.equal(text.includes('private diagnostic'), false)
  }
  const url = await start(t, { fetchImpl: async () => { throw new Error(`secret network failure ${TEST_KEY}`) } })
  const response = await post(url)
  assert.equal(response.status, 502)
  assert.equal((await response.text()).includes(TEST_KEY), false)
})

test('refused, incomplete, malformed and oversized responses are rejected', async t => {
  const validated = validateRequest(fixture())
  assert.throws(() => parseModelResponse({ ...completion(), status: 'incomplete' }, validated), /did not complete/)
  assert.throws(() => parseModelResponse({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'private refusal' }] }] }, validated), /could not answer/)
  for (const answer of [{ answer: '' }, { answer: 'x'.repeat(6001) }, { evidence: [42] }, { relatedChapterIds: 'chapter-1' }]) {
    assert.throws(() => parseModelResponse(completion(answer), validated), /invalid answer/)
  }
  const url = await start(t, { fetchImpl: async () => new Response('x'.repeat(256 * 1024 + 1)) })
  assert.equal((await post(url)).status, 502)
})

test('the model deadline aborts the provider and releases the request slot', async t => {
  let calls = 0
  let aborted = false
  const url = await start(t, { timeoutMs: 20, fetchImpl: async (_url, options) => {
    calls++
    if (calls > 1) return providerResponse(completion())
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { aborted = true; reject(options.signal.reason) }, { once: true }))
  } })
  const response = await post(url)
  assert.equal(response.status, 504)
  assert.equal((await response.json()).error.code, 'model_timeout')
  assert.equal(aborted, true)
  assert.equal((await post(url)).status, 200)
})

test('client cancellation aborts the upstream request', async t => {
  let started
  let cancelled
  const began = new Promise(resolve => { started = resolve })
  const ended = new Promise(resolve => { cancelled = resolve })
  const url = await start(t, { fetchImpl: async (_url, options) => {
    started()
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { cancelled(); reject(options.signal.reason) }, { once: true }))
  } })
  const controller = new AbortController()
  const response = post(url, fixture(), { signal: controller.signal })
  await began
  controller.abort()
  await assert.rejects(response, { name: 'AbortError' })
  await Promise.race([ended, delay(1000).then(() => assert.fail('Provider was not cancelled'))])
})

test('concurrency is bounded before starting another provider call', async t => {
  const releases = []
  let twoStarted
  const started = new Promise(resolve => { twoStarted = resolve })
  const url = await start(t, { fetchImpl: async () => new Promise(resolve => {
    releases.push(() => resolve(providerResponse(completion())))
    if (releases.length === 2) twoStarted()
  }) })
  const first = post(url)
  const second = post(url)
  await started
  const extra = await post(url)
  assert.equal(extra.status, 429)
  assert.equal(releases.length, 2)
  releases.forEach(release => release())
  assert.equal((await first).status, 200)
  assert.equal((await second).status, 200)
})

test('all three real demo analyses satisfy the connected model contract', async t => {
  const { buildDemoDay } = await import('../src/astra/demo.ts')
  const { analyzeDay } = await import('../src/astra/engine.ts')
  const url = await start(t)
  for (const scenario of ['balanced', 'overloaded', 'recovered']) {
    const analysis = analyzeDay(buildDemoDay(scenario))
    const context = {
      source: 'synthetic demonstration', metrics: analysis.metrics,
      chapters: analysis.chapters.map(({ id, kind, startTs, endTs, avgHr }) => ({ id, kind, startTs, endTs, avgHr })),
      findings: analysis.findings.map(({ id, tone, evidence, startTs, endTs }) => ({ id, tone, evidence, startTs, endTs })),
    }
    const response = await post(url, { question: 'When was I most focused?', context })
    assert.equal(response.status, 200, scenario)
    const answer = await response.json()
    assert.deepEqual(answer.relatedChapterIds, [analysis.chapters[0].id], scenario)
  }
})
