import type { AnswerSource, KnowledgeChunk } from './types'

export type CatalogIntent = 'categories' | 'recent' | null

export function detectCatalogIntent(message: string): CatalogIntent {
  const value = message.normalize('NFKC').toLocaleLowerCase('zh-CN')
  if (/分类|栏目/.test(value) && /推荐|介绍|主要|有哪些|每类/.test(value)) return 'categories'
  if (/最近|最新|更新/.test(value) && /文章|内容|更新|最近|最新/.test(value)) return 'recent'
  return null
}

function uniqueArticles(chunks: KnowledgeChunk[]): KnowledgeChunk[] {
  const byUrl = new Map<string, KnowledgeChunk>()
  for (const chunk of chunks) {
    const current = byUrl.get(chunk.url)
    if (!current || Date.parse(chunk.updated || chunk.date) > Date.parse(current.updated || current.date)) {
      byUrl.set(chunk.url, chunk)
    }
  }
  return [...byUrl.values()].sort((left, right) =>
    Date.parse(right.updated || right.date) - Date.parse(left.updated || left.date)
  )
}

function formatArticleTitle(title: string): string {
  return title.startsWith('《') ? title : `《${title}》`
}

export function buildCatalogAnswer(
  chunks: KnowledgeChunk[],
  intent: Exclude<CatalogIntent, null>
): { answer: string; sources: AnswerSource[] } {
  const articles = uniqueArticles(chunks)
  const sources: AnswerSource[] = []
  const addSource = (article: KnowledgeChunk): number => {
    const existing = sources.find(source => source.url === article.url)
    if (existing) return existing.index
    const index = sources.length + 1
    sources.push({ id: article.id, index, title: article.title, heading: article.heading, url: article.url, score: 1 })
    return index
  }

  if (intent === 'categories') {
    const categories = new Map<string, KnowledgeChunk>()
    for (const article of articles) {
      for (const category of article.categories.length ? article.categories : article.category ? [article.category] : []) {
        if (!categories.has(category)) categories.set(category, article)
      }
    }
    const preferred = ['技术文档', '开发报告', '随笔']
    const ordered = [...categories.entries()].sort(([left], [right]) => {
      const leftIndex = preferred.indexOf(left)
      const rightIndex = preferred.indexOf(right)
      return (leftIndex < 0 ? preferred.length : leftIndex) - (rightIndex < 0 ? preferred.length : rightIndex) || left.localeCompare(right, 'zh-CN')
    })
    if (!ordered.length) return { answer: '目前还没有可用的文章分类信息。', sources }
    const lines = ordered.map(([category, article]) => {
      const index = addSource(article)
      return `- **${category}**：推荐${formatArticleTitle(article.title)}[${index}]`
    })
    return {
      answer: `博客目前有 ${ordered.length} 个文章分类：\n\n${lines.join('\n')}\n\n推荐文章按该分类中最近更新的内容整理。`,
      sources
    }
  }

  const recent = articles.slice(0, 5)
  if (!recent.length) return { answer: '暂时没有找到文章更新记录。', sources }
  const lines = recent.map(article => {
    const index = addSource(article)
    const date = (article.updated || article.date || '').slice(0, 10)
    return `- ${date} · ${formatArticleTitle(article.title)}[${index}]`
  })
  return { answer: `最近更新的文章如下：\n\n${lines.join('\n')}`, sources }
}
