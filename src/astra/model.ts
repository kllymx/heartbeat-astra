export type ModelStatus = {
  available: boolean
  provider: 'openai' | 'none'
  model: string | null
}

export type ModelAnswer = {
  answer: string
  evidence: string[]
  relatedChapterIds: string[]
  provider: string
  model: string
}

const unavailable: ModelStatus = { available: false, provider: 'none', model: null }
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const serverErrors: Record<string, string> = {
  invalid_request: 'Enter a question of up to 1,000 characters and load a valid day.',
  body_too_large: 'This day contains too much context. Try a smaller time range.',
  not_configured: 'The connected model is not configured. Use local analysis.',
  provider_configuration: 'Check the server API key and configured model access.',
  provider_busy: 'The model is rate limited. Try again shortly or use local analysis.',
  busy: 'Two questions are already being answered. Try again shortly.',
  model_timeout: 'The model took too long. Try again or use local analysis.',
  model_refusal: 'The model could not answer this question. Try another question or local analysis.',
  incomplete_response: 'The model did not complete an answer. Try again or use local analysis.',
}

// Same-origin routes work with the Vite proxy and avoid probing localhost from a
// publicly hosted page. No browser environment variable contains an API key.
export async function getModelStatus(): Promise<ModelStatus> {
  // The optional server is loopback-only; static demos never probe a missing API.
  if (typeof window !== 'undefined' && !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return { ...unavailable }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const response = await fetch('/api/astra/status', { signal: controller.signal, credentials: 'omit', cache: 'no-store' })
    if (!response.ok) return { ...unavailable }
    const value: unknown = await response.json()
    if (!isRecord(value) || typeof value.available !== 'boolean' || !['openai', 'none'].includes(String(value.provider)) || !(typeof value.model === 'string' || value.model === null)) return { ...unavailable }
    if (value.available && (value.provider !== 'openai' || typeof value.model !== 'string' || !value.model)) return { ...unavailable }
    return { available: value.available, provider: value.provider as ModelStatus['provider'], model: value.model }
  } catch { return { ...unavailable } }
  finally { clearTimeout(timer) }
}

export async function askModel(question: string, context: unknown, signal?: AbortSignal): Promise<ModelAnswer> {
  if (!question.trim() || question.length > 1000) throw new Error('Enter a question between 1 and 1,000 characters.')
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(() => controller.abort(), 50000)
  try {
    const response = await fetch('/api/astra/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'omit', cache: 'no-store', signal: controller.signal,
      body: JSON.stringify({ question: question.trim(), context }),
    })
    const value: unknown = await response.json()
    if (!response.ok) {
      const code = isRecord(value) && isRecord(value.error) && typeof value.error.code === 'string' ? value.error.code : ''
      throw new Error(serverErrors[code] ?? 'The connected model could not answer. Try again or use local analysis.')
    }
    if (!isRecord(value) || typeof value.answer !== 'string' || !value.answer.trim() || value.answer.length > 6000 || !isStringArray(value.evidence) || value.evidence.length > 8 || value.evidence.some(item => item.length > 500) || !isStringArray(value.relatedChapterIds) || value.relatedChapterIds.length > 12 || typeof value.provider !== 'string' || typeof value.model !== 'string') {
      throw new Error('The connected model returned an invalid answer. Use local analysis or try again.')
    }
    return { answer: value.answer, evidence: value.evidence, relatedChapterIds: value.relatedChapterIds, provider: value.provider, model: value.model }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Question cancelled.', 'AbortError')
    if (controller.signal.aborted) throw new Error('The model took too long. Try again or use local analysis.')
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('The local model server could not be reached. Use local analysis or start the server.')
    throw error
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
}
