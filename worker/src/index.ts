import { AppError } from './errors'
import { buildChatMessages, buildSummaryMessages } from './prompts'
import { generateText, generateTextStream, providerName, staticTextStream } from './provider'
import { buildSources, rankKnowledge } from './retrieval'
import type { AnswerSource, AssistantRequest, KnowledgeChunk, PromptMessage, StreamMetadata } from './types'
import { readLimitedJson, validateAssistantRequest } from './validation'

const VERSION = '2.0.0'
const MAX_KNOWLEDGE_BYTES = 2 * 1024 * 1024
const NO_EVIDENCE_ANSWER = '博客现有内容不足以确认这个问题。你可以换一种更具体的问法，或先查看博客的文章分类。'

function allowedOrigins(env: Env): Set<string> {
  return new Set(env.ALLOWED_ORIGINS.split(',').map(item => item.trim()).filter(Boolean))
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Request-Id',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin'
  })
  const origin = request.headers.get('origin')
  if (origin && allowedOrigins(env).has(origin)) headers.set('Access-Control-Allow-Origin', origin)
  return headers
}

function assertAllowedOrigin(request: Request, env: Env): void {
  const origin = request.headers.get('origin')
  if (origin && allowedOrigins(env).has(origin)) return
  if (!origin && env.ENVIRONMENT !== 'production') return
  throw new AppError('ORIGIN_NOT_ALLOWED', '当前来源无权访问 AI 服务。', 403)
}

function jsonResponse(request: Request, env: Env, payload: unknown, status = 200, requestId?: string): Response {
  const headers = corsHeaders(request, env)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  if (requestId) headers.set('X-Request-Id', requestId)
  return new Response(JSON.stringify(payload), { status, headers })
}

function streamResponse(
  request: Request,
  env: Env,
  stream: ReadableStream<Uint8Array>,
  requestId: string
): Response {
  const headers = corsHeaders(request, env)
  headers.set('Content-Type', 'text/event-stream; charset=utf-8')
  headers.set('Connection', 'keep-alive')
  headers.set('X-Accel-Buffering', 'no')
  headers.set('X-Request-Id', requestId)
  return new Response(stream, { headers })
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new AppError('KNOWLEDGE_UNAVAILABLE', '知识库响应为空。', 503)
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > maxBytes) throw new AppError('KNOWLEDGE_TOO_LARGE', '知识库文件超过安全限制。', 503)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel('knowledge file too large')
      throw new AppError('KNOWLEDGE_TOO_LARGE', '知识库文件超过安全限制。', 503)
    }
    chunks.push(value)
  }
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.byteLength
  }
  return output
}

function isKnowledgeChunk(value: unknown): value is KnowledgeChunk {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return ['id', 'title', 'heading', 'url', 'content'].every(key => typeof item[key] === 'string')
}

async function loadKnowledge(env: Env, ctx: ExecutionContext): Promise<KnowledgeChunk[]> {
  const cacheKey = new Request(env.KNOWLEDGE_URL, { method: 'GET' })
  const knowledgeCache = await caches.open('blog-ai-knowledge-v2')
  let response = await knowledgeCache.match(cacheKey)

  if (!response) {
    const upstream = await fetch(cacheKey, { headers: { Accept: 'application/json' } })
    if (!upstream.ok) throw new AppError('KNOWLEDGE_UNAVAILABLE', '博客知识库暂时不可用。', 503)
    const cacheHeaders = new Headers(upstream.headers)
    cacheHeaders.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
    response = new Response(upstream.body, { status: upstream.status, headers: cacheHeaders })
    ctx.waitUntil(knowledgeCache.put(cacheKey, response.clone()))
  }

  const bytes = await readResponseBytes(response, MAX_KNOWLEDGE_BYTES)
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new AppError('KNOWLEDGE_INVALID', '博客知识库格式不正确。', 503)
  }
  if (!Array.isArray(parsed)) throw new AppError('KNOWLEDGE_INVALID', '博客知识库格式不正确。', 503)

  return parsed.filter(isKnowledgeChunk).map(item => ({
    ...item,
    categories: Array.isArray(item.categories) ? item.categories.filter(value => typeof value === 'string') : [],
    category: typeof item.category === 'string' ? item.category : '',
    tags: Array.isArray(item.tags) ? item.tags.filter(value => typeof value === 'string') : [],
    date: typeof item.date === 'string' ? item.date : '',
    updated: typeof item.updated === 'string' ? item.updated : '',
    source: typeof item.source === 'string' ? item.source : ''
  }))
}

function numericSetting(value: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback
}

function safeSummarySource(request: AssistantRequest): AnswerSource[] {
  let url = ''
  try {
    const parsed = new URL(request.url)
    url = parsed.pathname + parsed.search
  } catch {
    if (request.url.startsWith('/')) url = request.url
  }
  return [{
    id: 'current-article',
    index: 1,
    title: request.title || '当前文章',
    heading: '全文',
    url,
    score: 1
  }]
}

async function preparePrompt(
  requestBody: AssistantRequest,
  env: Env,
  ctx: ExecutionContext
): Promise<{ messages: PromptMessage[]; sources: AnswerSource[]; noEvidence: boolean }> {
  if (requestBody.type === 'summary') {
    return {
      messages: buildSummaryMessages(requestBody),
      sources: safeSummarySource(requestBody),
      noEvidence: false
    }
  }

  const knowledge = await loadKnowledge(env, ctx)
  const previousUserTurn = [...requestBody.history].reverse().find(turn => turn.role === 'user')?.content || ''
  const query = `${previousUserTurn} ${requestBody.message}`.trim()
  const limit = numericSetting(env.RETRIEVAL_LIMIT, 6, 1, 10)
  const minScore = numericSetting(env.MIN_RETRIEVAL_SCORE, 0.8, 0, 20)
  const ranked = rankKnowledge(knowledge, query, limit, minScore)
  return {
    messages: buildChatMessages(requestBody, ranked),
    sources: buildSources(ranked),
    noEvidence: ranked.length === 0
  }
}

async function handleAssistantRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const startedAt = Date.now()
  const requestId = crypto.randomUUID()
  assertAllowedOrigin(request, env)

  const body = validateAssistantRequest(await readLimitedJson(request))
  const rateLimit = await env.AI_RATE_LIMITER.limit({ key: `session:${body.sessionId}` })
  if (!rateLimit.success) throw new AppError('RATE_LIMITED', '请求过于频繁，请稍后再试。', 429)
  const prepared = await preparePrompt(body, env, ctx)
  const metadata: StreamMetadata = { requestId, sources: prepared.sources }
  const maxTokens = numericSetting(env.MAX_OUTPUT_TOKENS, 900, 128, 2000)

  const logResult = (result: { ok: boolean; outputCharacters: number }) => {
    console.log(JSON.stringify({
      event: 'assistant_request',
      requestId,
      type: body.type,
      ok: result.ok,
      durationMs: Date.now() - startedAt,
      sourceCount: prepared.sources.length,
      outputCharacters: result.outputCharacters
    }))
  }

  if (body.stream) {
    if (prepared.noEvidence) {
      logResult({ ok: true, outputCharacters: NO_EVIDENCE_ANSWER.length })
      return streamResponse(request, env, staticTextStream(NO_EVIDENCE_ANSWER, metadata), requestId)
    }
    const stream = await generateTextStream(
      env,
      prepared.messages,
      metadata,
      { maxTokens, signal: request.signal },
      logResult
    )
    return streamResponse(request, env, stream, requestId)
  }

  const answer = prepared.noEvidence
    ? NO_EVIDENCE_ANSWER
    : await generateText(env, prepared.messages, { maxTokens, signal: request.signal })
  logResult({ ok: true, outputCharacters: answer.length })
  return jsonResponse(request, env, { answer, sources: prepared.sources, requestId }, 200, requestId)
}

export async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    const headers = corsHeaders(request, env)
    const origin = request.headers.get('origin')
    return new Response(null, { status: origin && allowedOrigins(env).has(origin) ? 204 : 403, headers })
  }

  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    return jsonResponse(request, env, {
      ok: true,
      service: 'blog-ai-assistant',
      version: VERSION,
      environment: env.ENVIRONMENT,
      model: env.AI_MODEL,
      provider: providerName(env)
    })
  }

  if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '/v1/chat')) {
    return handleAssistantRequest(request, env, ctx)
  }

  return jsonResponse(request, env, { error: { code: 'NOT_FOUND', message: '接口不存在。' } }, 404)
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx)
    } catch (error) {
      const requestId = crypto.randomUUID()
      const appError = error instanceof AppError
        ? error
        : new AppError('INTERNAL_ERROR', 'AI 服务暂时不可用，请稍后再试。', 500)
      console.error(JSON.stringify({
        event: 'assistant_error',
        requestId,
        code: appError.code,
        status: appError.status,
        error: error instanceof Error ? error.message : String(error)
      }))
      return jsonResponse(request, env, {
        error: { code: appError.code, message: appError.message },
        requestId
      }, appError.status, requestId)
    }
  }
} satisfies ExportedHandler<Env>
