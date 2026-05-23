const fs = require('fs')
const path = require('path')

const postsDir = path.join(__dirname, '../source/_posts')
const outputDir = path.join(__dirname, '../source/data')
const outputFile = path.join(outputDir, 'blog-knowledge.json')

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

function getTitle(raw, file) {
  const match = raw.match(/title:\s*(.+)/)
  return match ? match[1].trim() : file.replace('.md', '')
}

function getCategory(raw) {
  const match = raw.match(/categories:\s*\n\s*-\s*(.+)/)
  return match ? match[1].trim() : ''
}

function removeFrontMatter(raw) {
  return raw.replace(/^---[\s\S]*?---/, '').trim()
}

function cleanText(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitText(text, size = 800) {
  const chunks = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

const files = fs.readdirSync(postsDir).filter(f => f.endsWith('.md'))
const knowledge = []

for (const file of files) {
  const raw = fs.readFileSync(path.join(postsDir, file), 'utf-8')
  const title = getTitle(raw, file)
  const category = getCategory(raw)
  const content = cleanText(removeFrontMatter(raw))
  const slug = encodeURIComponent(file.replace('.md', ''))

  splitText(content).forEach((chunk, index) => {
    knowledge.push({
      id: `${file}-${index}`,
      title,
      category,
      file,
      url: `/${slug}/`,
      content: chunk
    })
  })
}

fs.writeFileSync(outputFile, JSON.stringify(knowledge, null, 2), 'utf-8')
console.log(`知识库生成完成：${knowledge.length} 个片段`)