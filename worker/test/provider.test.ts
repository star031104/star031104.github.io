import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateText, providerName } from '../src/provider'
import type { ProviderEnv } from '../src/provider'

describe('external model provider configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recognizes the official SiliconFlow endpoint', () => {
    const env = { AI_API_URL: 'https://api.siliconflow.cn/v1/chat/completions' } as ProviderEnv
    expect(providerName(env)).toBe('siliconflow')
  })

  it('uses the SiliconFlow secret and disables thinking for blog answers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '回答成功' } }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    const env = {
      AI_API_URL: 'https://api.siliconflow.cn/v1/chat/completions',
      AI_MODEL: 'Qwen/Qwen3-8B',
      SILICONFLOW_API_KEY: 'siliconflow-secret',
      AI_API_KEY: 'other-provider-secret'
    } as ProviderEnv

    await expect(generateText(env, [{ role: 'user', content: '测试' }], { maxTokens: 256 }))
      .resolves.toBe('回答成功')

    const call = fetchMock.mock.calls[0]
    expect(call).toBeDefined()
    const [url, init] = call!
    expect(url).toBe('https://api.siliconflow.cn/v1/chat/completions')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer siliconflow-secret')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'Qwen/Qwen3-8B',
      enable_thinking: false,
      stream: false
    })
  })
})
