import type { AnswerSource, KnowledgeChunk, RankedChunk } from './types'

const CHINESE_STOP_WORDS = new Set([
  '一个', '一些', '什么', '怎么', '如何', '为什么', '这个', '那个', '哪些', '是否',
  '可以', '以及', '关于', '博客', '文章', '内容', '一下', '请问', '帮我', '介绍'
])
const LATIN_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in',
  'is', 'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'what', 'when', 'where', 'why', 'with'
])

function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim()
}

function cjkBigrams(text: string): string[] {
  const output: string[] = []
  const runs = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu) || []
  for (const run of runs) {
    const chars = Array.from(run)
    if (chars.length === 1 && chars[0]) output.push(chars[0])
    for (let index = 0; index < chars.length - 1; index += 1) {
      output.push(`${chars[index]}${chars[index + 1]}`)
    }
  }
  return output
}

export function tokenize(text: string): string[] {
  const normalized = normalize(text)
  const tokens: string[] = []
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })

  for (const part of segmenter.segment(normalized)) {
    const token = part.segment.trim()
    if (!part.isWordLike || !token) continue
    if (CHINESE_STOP_WORDS.has(token) || LATIN_STOP_WORDS.has(token)) continue
    if (/^[a-z0-9][a-z0-9._+-]*$/i.test(token) && token.length > 1) tokens.push(token)
    else if (token.length > 1) tokens.push(token)
  }

  tokens.push(...cjkBigrams(normalized).filter(token => !CHINESE_STOP_WORDS.has(token)))
  return tokens
}

function countTerms(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1)
  return counts
}

function weightedTermFrequency(chunk: KnowledgeChunk): Map<string, number> {
  const output = countTerms(tokenize(chunk.content))
  const add = (text: string, weight: number) => {
    for (const token of tokenize(text)) output.set(token, (output.get(token) || 0) + weight)
  }
  add(chunk.title, 4)
  add(chunk.heading, 3)
  add(chunk.tags.join(' '), 2)
  add(chunk.categories.join(' '), 2)
  return output
}

function exactMatchBoost(chunk: KnowledgeChunk, query: string): number {
  const phrase = normalize(query)
  if (phrase.length < 2) return 0
  if (normalize(chunk.title).includes(phrase)) return 6
  if (normalize(chunk.heading).includes(phrase)) return 4
  if (normalize(chunk.content).includes(phrase)) return 2.5
  return 0
}

export function rankKnowledge(
  chunks: KnowledgeChunk[],
  query: string,
  limit = 6,
  minScore = 0.8
): RankedChunk[] {
  if (!chunks.length) return []
  const queryTerms = [...new Set(tokenize(query))]
  if (!queryTerms.length) return []

  const documents = chunks.map(chunk => {
    const contentTokens = tokenize(chunk.content)
    return {
      chunk,
      length: Math.max(contentTokens.length, 1),
      terms: weightedTermFrequency(chunk)
    }
  })
  const averageLength = documents.reduce((sum, item) => sum + item.length, 0) / documents.length
  const documentFrequency = new Map<string, number>()

  for (const term of queryTerms) {
    documentFrequency.set(term, documents.filter(document => document.terms.has(term)).length)
  }

  const scored = documents.map(document => {
    let score = exactMatchBoost(document.chunk, query)
    for (const term of queryTerms) {
      const frequency = document.terms.get(term) || 0
      if (!frequency) continue
      const matchingDocuments = documentFrequency.get(term) || 0
      const inverseFrequency = Math.log(1 + (documents.length - matchingDocuments + 0.5) / (matchingDocuments + 0.5))
      const normalizedFrequency = (frequency * 2.2) /
        (frequency + 1.2 * (0.25 + 0.75 * (document.length / averageLength)))
      score += inverseFrequency * normalizedFrequency
    }
    return { ...document.chunk, score: Number(score.toFixed(4)) }
  })

  const selected: RankedChunk[] = []
  const perArticle = new Map<string, number>()
  for (const chunk of scored.sort((left, right) => right.score - left.score)) {
    if (chunk.score < minScore) break
    const articleCount = perArticle.get(chunk.url) || 0
    if (articleCount >= 2) continue
    selected.push(chunk)
    perArticle.set(chunk.url, articleCount + 1)
    if (selected.length >= limit) break
  }
  return selected
}

export function buildSources(chunks: RankedChunk[]): AnswerSource[] {
  return chunks.map((chunk, index) => ({
    id: chunk.id,
    index: index + 1,
    title: chunk.title,
    heading: chunk.heading,
    url: chunk.url,
    score: chunk.score
  }))
}

export function buildContext(chunks: RankedChunk[], maxCharacters = 7000): string {
  let output = ''
  chunks.forEach((chunk, index) => {
    const block = `[${index + 1}] 文章：${chunk.title}\n章节：${chunk.heading}\n链接：${chunk.url}\n内容：${chunk.content}\n\n`
    if (output.length + block.length <= maxCharacters) output += block
  })
  return output.trim()
}
