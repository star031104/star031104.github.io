import { describe, expect, it } from 'vitest'
import { buildContext, buildSources, rankKnowledge, tokenize } from '../src/retrieval'
import type { KnowledgeChunk } from '../src/types'

function chunk(overrides: Partial<KnowledgeChunk>): KnowledgeChunk {
  return {
    id: 'default',
    title: '默认文章',
    heading: '默认章节',
    categories: ['技术文档'],
    category: '技术文档',
    tags: [],
    date: '2026-09-14T00:00:00Z',
    updated: '2026-09-14T00:00:00Z',
    source: '_posts/default.md',
    url: '/default/',
    content: '默认内容',
    ...overrides
  }
}

describe('blog knowledge retrieval', () => {
  it('tokenizes Chinese and technical terms', () => {
    const tokens = tokenize('如何在 WSL2 配置 CUDA？')
    expect(tokens).toContain('wsl2')
    expect(tokens).toContain('cuda')
    expect(tokens).toContain('配置')
  })

  it('ranks title and heading matches above unrelated content', () => {
    const knowledge = [
      chunk({ id: 'cuda', title: 'WSL2 CUDA 配置记录', heading: '驱动配置', url: '/cuda/', content: '检查 NVIDIA 驱动和工具链。' }),
      chunk({ id: 'writing', title: '写作随笔', heading: '一些想法', url: '/writing/', content: '记录生活与电影。' })
    ]
    const results = rankKnowledge(knowledge, 'WSL2 怎么配置 CUDA', 6, 0)
    expect(results[0]?.id).toBe('cuda')
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score || 0)
  })

  it('limits repeated chunks from one article', () => {
    const knowledge = Array.from({ length: 5 }, (_, index) => chunk({
      id: `same-${index}`,
      title: 'Qwen 本地部署',
      heading: `章节 ${index}`,
      url: '/qwen/',
      content: `Qwen llama.cpp CUDA 本地部署说明 ${index}`
    }))
    const results = rankKnowledge(knowledge, 'Qwen 本地部署', 6, 0)
    expect(results).toHaveLength(2)
  })

  it('builds numbered, bounded context and matching sources', () => {
    const ranked = [
      { ...chunk({ id: 'one', title: '文章一', heading: '第一节', url: '/one/', content: '内容一' }), score: 3.5 },
      { ...chunk({ id: 'two', title: '文章二', heading: '第二节', url: '/two/', content: '内容二' }), score: 2.5 }
    ]
    expect(buildContext(ranked)).toContain('[1] 文章：文章一')
    expect(buildSources(ranked)[1]).toMatchObject({ index: 2, id: 'two', url: '/two/' })
  })
})
