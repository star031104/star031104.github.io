import { describe, expect, it } from 'vitest'
import { AppError } from '../src/errors'
import { normalizeSessionId, readLimitedJson, validateAssistantRequest } from '../src/validation'

describe('assistant request validation', () => {
  it('normalizes chat requests and caps history', () => {
    const result = validateAssistantRequest({
      type: 'chat',
      sessionId: 'session_12345678',
      message: '  介绍一下 Qwen  ',
      history: Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `turn ${index}` }))
    })
    expect(result.message).toBe('介绍一下 Qwen')
    expect(result.history).toHaveLength(8)
    expect(result.sessionId).toBe('session_12345678')
    expect(result.stream).toBe(true)
  })

  it('rejects an empty chat message', () => {
    expect(() => validateAssistantRequest({ type: 'chat', message: '  ' }))
      .toThrowError(AppError)
  })

  it('rejects oversized streamed JSON bodies', async () => {
    const request = new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ value: 'x'.repeat(100_000) })
    })
    await expect(readLimitedJson(request)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 })
  })

  it('falls back for invalid session identifiers', () => {
    expect(normalizeSessionId('short')).toBe('anonymous')
    expect(normalizeSessionId('valid_session_123')).toBe('valid_session_123')
  })
})
