'use strict'

const crypto = require('node:crypto')

const MAX_CHUNK_LENGTH = 1200
const CHUNK_OVERLAP = 120

function stripFrontMatter(markdown) {
  return markdown.replace(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---\s*[\r\n]*/, '')
}

function cleanMarkdown(markdown) {
  return stripFrontMatter(markdown)
    .replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, language, code) => `\n代码${language ? `（${language.trim()}）` : ''}：\n${code.trim()}\n`)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitLongText(text, maxLength = MAX_CHUNK_LENGTH, overlap = CHUNK_OVERLAP) {
  const characters = Array.from(text)
  if (characters.length <= maxLength) return [text]

  const chunks = []
  let start = 0
  while (start < characters.length) {
    const end = Math.min(start + maxLength, characters.length)
    chunks.push(characters.slice(start, end).join('').trim())
    if (end === characters.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks.filter(Boolean)
}

function splitSection(text) {
  const paragraphs = text.split(/\n{2,}/).map(item => item.trim()).filter(Boolean)
  const chunks = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (Array.from(paragraph).length > MAX_CHUNK_LENGTH) {
      if (current) chunks.push(current)
      chunks.push(...splitLongText(paragraph))
      current = ''
      continue
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (Array.from(candidate).length > MAX_CHUNK_LENGTH) {
      chunks.push(current)
      current = paragraph
    } else {
      current = candidate
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function getSections(markdown, fallbackTitle) {
  const sections = []
  let heading = fallbackTitle
  let buffer = []

  const flush = () => {
    const content = cleanMarkdown(buffer.join('\n'))
    if (content) sections.push({ heading, content })
    buffer = []
  }

  for (const line of stripFrontMatter(markdown).split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+)$/)
    if (match) {
      flush()
      heading = cleanMarkdown(match[1]) || fallbackTitle
    } else {
      buffer.push(line)
    }
  }
  flush()

  return sections.length ? sections : [{ heading: fallbackTitle, content: cleanMarkdown(markdown) }]
}

function normalizeDate(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

hexo.extend.generator.register('blog-knowledge', locals => {
  const knowledge = []
  const root = (hexo.config.root || '/').replace(/\/$/, '')
  const posts = locals.posts.sort('-date').toArray()

  for (const post of posts) {
    const title = String(post.title || post.slug || '未命名文章')
    const markdown = String(post.raw || post._content || post.content || '')
    const url = encodeURI(`${root}/${String(post.path || '').replace(/^\//, '')}`)
    const categories = post.categories ? post.categories.map(item => item.name) : []
    const tags = post.tags ? post.tags.map(item => item.name) : []

    for (const section of getSections(markdown, title)) {
      splitSection(section.content).forEach((content, index) => {
        const id = crypto
          .createHash('sha1')
          .update(`${post.source}|${section.heading}|${index}|${content}`)
          .digest('hex')
          .slice(0, 16)

        knowledge.push({
          id,
          title,
          heading: section.heading,
          categories,
          category: categories[0] || '',
          tags,
          date: normalizeDate(post.date),
          updated: normalizeDate(post.updated),
          source: post.source,
          url,
          content
        })
      })
    }
  }

  return {
    path: 'data/blog-knowledge.json',
    data: JSON.stringify(knowledge, null, 2)
  }
})
