import { describe, expect, it } from 'vitest'
import { staticTextStream } from '../src/provider'

describe('assistant SSE contract', () => {
  it('emits metadata, tokens and a completion event', async () => {
    const stream = staticTextStream('没有找到足够资料。', {
      requestId: 'request-1',
      sources: []
    })
    const body = await new Response(stream).text()
    expect(body).toContain('event: meta')
    expect(body).toContain('"requestId":"request-1"')
    expect(body).toContain('event: token')
    expect(body).toContain('没有找到足够资料。')
    expect(body).toContain('event: done')
  })
})
