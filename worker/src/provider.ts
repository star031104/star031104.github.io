import { AppError } from './errors'
import type { PromptMessage, StreamMetadata } from './types'

export type ProviderEnv = Env & {
  AI_API_KEY?: string
  AI_API_URL?: string
  SILICONFLOW_API_KEY?: string
}

interface CompletionOptions {
  maxTokens: number
  signal?: AbortSignal
}

interface ProviderErrorPayload {
  error?: { message?: string } | string
}

function externalProviderConfigured(env: ProviderEnv): boolean {
  return Boolean(env.AI_API_URL?.trim())
}

export function providerName(env: ProviderEnv): 'siliconflow' | 'zhipu-official' | 'openai-compatible' | 'workers-ai' {
  const value = env.AI_API_URL?.trim()
  if (!value) return 'workers-ai'
  try {
    const hostname = new URL(value).hostname
    if (hostname === 'api.siliconflow.cn') return 'siliconflow'
    return hostname === 'open.bigmodel.cn' ? 'zhipu-official' : 'openai-compatible'
  } catch {
    return 'openai-compatible'
  }
}

function assertExternalProvider(env: ProviderEnv): { url: string; key: string } {
  const url = env.AI_API_URL?.trim() || ''
  const key = providerName(env) === 'siliconflow'
    ? env.SILICONFLOW_API_KEY?.trim() || ''
    : env.AI_API_KEY?.trim() || ''
  if (!url || !key) {
    throw new AppError('PROVIDER_NOT_CONFIGURED', 'AI 服务尚未完成配置。', 503)
  }
  return { url, key }
}

async function externalRequest(
  env: ProviderEnv,
  messages: PromptMessage[],
  options: CompletionOptions,
  stream: boolean
): Promise<Response> {
  const provider = assertExternalProvider(env)
  const isZhipuOfficial = providerName(env) === 'zhipu-official'
  const body: Record<string, unknown> = {
    model: env.AI_MODEL,
    messages,
    stream,
    temperature: 0.25,
    top_p: 0.85,
    max_tokens: options.maxTokens
  }
  if (isZhipuOfficial) body.thinking = { type: 'disabled' }
  if (providerName(env) === 'siliconflow') body.enable_thinking = false

  const response = await fetch(provider.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.key}`,
      'Content-Type': 'application/json',
      Accept: stream ? 'text/event-stream' : 'application/json'
    },
    body: JSON.stringify(body),
    signal: options.signal
  })

  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.clone().json<ProviderErrorPayload>()
      detail = typeof payload.error === 'string' ? payload.error : payload.error?.message || ''
    } catch {
      // The provider body may not be JSON. Do not expose its raw response.
    }
    console.error(JSON.stringify({ event: 'provider_error', status: response.status, detail: detail.slice(0, 200) }))
    if (response.status === 401 || response.status === 403) {
      throw new AppError('PROVIDER_AUTH_FAILED', 'AI 服务鉴权失败。', 503)
    }
    if (response.status === 429) {
      throw new AppError('MODEL_RATE_LIMITED', '模型服务请求过于频繁，请稍后再试。', 503)
    }
    throw new AppError('MODEL_ERROR', '模型服务暂时不可用。', 502)
  }
  return response
}

function workersAiStream(env: Env, messages: PromptMessage[], maxTokens: number): Promise<ReadableStream> {
  const input = {
    messages,
    stream: true as const,
    temperature: 0.25,
    top_p: 0.85,
    max_completion_tokens: maxTokens
  }

  const model = String(env.AI_MODEL)
  switch (model) {
    case '@cf/zai-org/glm-4.7-flash':
      return env.AI.run('@cf/zai-org/glm-4.7-flash', input)
    case '@cf/google/gemma-4-26b-a4b-it':
      return env.AI.run('@cf/google/gemma-4-26b-a4b-it', input)
    case '@cf/moonshotai/kimi-k2.6':
      return env.AI.run('@cf/moonshotai/kimi-k2.6', input)
    default:
      throw new AppError('UNSUPPORTED_MODEL', '当前 Workers AI 模型未加入允许列表。', 503)
  }
}

async function workersAiText(env: Env, messages: PromptMessage[], maxTokens: number): Promise<string> {
  const input = {
    messages,
    temperature: 0.25,
    top_p: 0.85,
    max_completion_tokens: maxTokens
  }

  let result: ChatCompletionsOutput
  const model = String(env.AI_MODEL)
  switch (model) {
    case '@cf/zai-org/glm-4.7-flash':
      result = await env.AI.run('@cf/zai-org/glm-4.7-flash', input)
      break
    case '@cf/google/gemma-4-26b-a4b-it':
      result = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', input)
      break
    case '@cf/moonshotai/kimi-k2.6':
      result = await env.AI.run('@cf/moonshotai/kimi-k2.6', input)
      break
    default:
      throw new AppError('UNSUPPORTED_MODEL', '当前 Workers AI 模型未加入允许列表。', 503)
  }

  return result.choices[0]?.message.content?.trim() || ''
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const data = payload as Record<string, unknown>
  if (typeof data.response === 'string') return data.response
  if (typeof data.output_text === 'string') return data.output_text

  const choices = Array.isArray(data.choices) ? data.choices : []
  const first = choices[0]
  if (!first || typeof first !== 'object') return ''
  const choice = first as Record<string, unknown>
  for (const containerName of ['delta', 'message']) {
    const container = choice[containerName]
    if (!container || typeof container !== 'object') continue
    const content = (container as Record<string, unknown>).content
    if (typeof content === 'string') return content
  }
  return typeof choice.text === 'string' ? choice.text : ''
}

function encodeEvent(name: string, payload: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export async function generateText(
  env: ProviderEnv,
  messages: PromptMessage[],
  options: CompletionOptions
): Promise<string> {
  if (!externalProviderConfigured(env)) return workersAiText(env, messages, options.maxTokens)

  const response = await externalRequest(env, messages, options, false)
  const payload = await response.json<unknown>()
  const text = extractText(payload).trim()
  if (!text) throw new AppError('EMPTY_MODEL_RESPONSE', '模型没有返回有效内容。', 502)
  return text
}

export async function generateTextStream(
  env: ProviderEnv,
  messages: PromptMessage[],
  metadata: StreamMetadata,
  options: CompletionOptions,
  onFinished: (result: { ok: boolean; outputCharacters: number }) => void
): Promise<ReadableStream<Uint8Array>> {
  let upstream: ReadableStream
  if (externalProviderConfigured(env)) {
    const response = await externalRequest(env, messages, options, true)
    if (!response.body) throw new AppError('EMPTY_MODEL_RESPONSE', '模型没有返回数据流。', 502)
    upstream = response.body
  } else {
    upstream = await workersAiStream(env, messages, options.maxTokens)
  }

  let upstreamReader: ReadableStreamDefaultReader | undefined
  let outputCharacters = 0

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encodeEvent('meta', metadata))
      upstreamReader = upstream.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let doneSent = false

      const processBlock = (block: string) => {
        const data = block
          .split('\n')
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n')
          .trim()
        if (!data) return
        if (data === '[DONE]') {
          doneSent = true
          return
        }
        try {
          const token = extractText(JSON.parse(data))
          if (token) {
            outputCharacters += token.length
            controller.enqueue(encodeEvent('token', { text: token }))
          }
        } catch {
          // Ignore provider keep-alive or non-JSON diagnostic events.
        }
      }

      try {
        while (true) {
          const { done, value } = await upstreamReader.read()
          if (done) break
          buffer += decoder.decode(value as AllowSharedBufferSource, { stream: true }).replace(/\r\n/g, '\n')
          let separator = buffer.indexOf('\n\n')
          while (separator >= 0) {
            processBlock(buffer.slice(0, separator))
            buffer = buffer.slice(separator + 2)
            separator = buffer.indexOf('\n\n')
          }
        }
        buffer += decoder.decode()
        if (buffer.trim()) processBlock(buffer)
        if (outputCharacters === 0) {
          controller.enqueue(encodeEvent('error', {
            code: 'EMPTY_MODEL_RESPONSE',
            message: '模型没有返回有效内容，请重试。',
            requestId: metadata.requestId
          }))
          controller.close()
          onFinished({ ok: false, outputCharacters })
          return
        }
        controller.enqueue(encodeEvent('done', { requestId: metadata.requestId, providerDone: doneSent }))
        controller.close()
        onFinished({ ok: true, outputCharacters })
      } catch (error) {
        console.error(JSON.stringify({ event: 'stream_error', requestId: metadata.requestId, error: String(error) }))
        controller.enqueue(encodeEvent('error', {
          code: 'STREAM_INTERRUPTED',
          message: '回答生成过程中断，请重试。',
          requestId: metadata.requestId
        }))
        controller.close()
        onFinished({ ok: false, outputCharacters })
      }
    },
    async cancel(reason) {
      await upstreamReader?.cancel(reason)
    }
  })
}

export function staticTextStream(text: string, metadata: StreamMetadata): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeEvent('meta', metadata))
      controller.enqueue(encodeEvent('token', { text }))
      controller.enqueue(encodeEvent('done', { requestId: metadata.requestId }))
      controller.close()
    }
  })
}
