import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { mergeSmallChunks } = require('../../scripts/knowledge-generator.js') as {
  mergeSmallChunks: (
    chunks: Array<{ heading: string; content: string }>,
    minLength?: number,
    maxLength?: number
  ) => Array<{ heading: string; content: string }>
}

describe('knowledge chunk merging', () => {
  it('merges a short leading section into the next useful section', () => {
    const result = mergeSmallChunks([
      { heading: '部署流程', content: '下面开始部署。' },
      { heading: '环境准备', content: '需要准备 Node.js、Cloudflare 账户与对应的运行环境。' }
    ], 20, 200)
    expect(result).toHaveLength(1)
    expect(result[0]?.heading).toBe('部署流程 / 环境准备')
    expect(result[0]?.content).toContain('下面开始部署。')
    expect(result[0]?.content).toContain('需要准备 Node.js')
  })

  it('does not create chunks larger than the configured limit', () => {
    const result = mergeSmallChunks([
      { heading: '短章节', content: '很短' },
      { heading: '长章节', content: '内容'.repeat(100) }
    ], 20, 100)
    expect(result).toHaveLength(2)
  })
})

describe('knowledge markdown cleaning', () => {
  const { cleanMarkdown } = require('../../scripts/knowledge-generator.js') as {
    cleanMarkdown: (markdown: string) => string
  }

  it('turns mermaid diagrams into readable flow text and drops Hexo tags', () => {
    const result = cleanMarkdown([
      '{% mermaid %}',
      'flowchart TD',
      '  A["材料导入"] -->|"解析、切分"| B["证据图谱<br/>来源登记"]',
      '{% endmermaid %}',
      '',
      '## 系列文章',
      '',
      '{% series %}'
    ].join('\n'))
    expect(result).toContain('流程：材料导入 → 解析、切分 → 证据图谱 来源登记')
    expect(result).not.toContain('flowchart')
    expect(result).not.toContain('{%')
  })
})
