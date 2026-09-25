import { AppError } from './errors'
import type { AssistantRequest, ChatTurn, RequestKind } from './types'

const MAX_BODY_BYTES = 96 * 1024
const MAX_MESSAGE_CHARS = 1000
const MAX_ARTICLE_CHARS = 30_000
const MAX_HISTORY_TURNS = 8
const MAX_HISTORY_CHARS = 2000

function cleanString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\u0000/g, '').trim().slice(0, maxLength)
}

function parseHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return []

  return value
    .slice(-MAX_HISTORY_TURNS)
    .flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const candidate = item as Record<string, unknown>
      if (candidate.role !== 'user' && candidate.role !== 'assistant') return []
      const content = cleanString(candidate.content, MAX_HISTORY_CHARS)
      return content ? [{ role: candidate.role, content }] : []
    })
}

export async function readLimitedJson(request: Request): Promise<unknown> {
  if (!request.body) throw new AppError('INVALID_REQUEST', '请求正文不能为空。', 400)

  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', '请求内容过长。', 413)
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel('payload too large')
      throw new AppError('PAYLOAD_TOO_LARGE', '请求内容过长。', 413)
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return JSON.parse(new TextDecoder().decode(body))
  } catch {
    throw new AppError('INVALID_JSON', '请求不是有效的 JSON。', 400)
  }
}

export function validateAssistantRequest(value: unknown): AssistantRequest {
  if (!value || typeof value !== 'object') {
    throw new AppError('INVALID_REQUEST', '请求格式不正确。', 400)
  }

  const body = value as Record<string, unknown>
  const type: RequestKind = body.type === 'summary' ? 'summary' : 'chat'
  const message = cleanString(body.message, MAX_MESSAGE_CHARS)
  const content = cleanString(body.content, MAX_ARTICLE_CHARS)
  const title = cleanString(body.title, 200)
  const url = cleanString(body.url, 1000)

  if (type === 'chat' && !message) {
    throw new AppError('EMPTY_MESSAGE', '请输入问题后再发送。', 400)
  }
  if (type === 'summary' && !content) {
    throw new AppError('EMPTY_ARTICLE', '没有读取到可总结的文章内容。', 400)
  }

  return {
    type,
    sessionId: normalizeSessionId(typeof body.sessionId === 'string' ? body.sessionId : null),
    message,
    content,
    title,
    url,
    history: parseHistory(body.history),
    stream: body.stream !== false
  }
}

export function normalizeSessionId(value: string | null): string {
  if (!value) return 'anonymous'
  const normalized = value.trim()
  return /^[A-Za-z0-9_-]{8,80}$/.test(normalized) ? normalized : 'anonymous'
}
