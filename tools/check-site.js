'use strict'

const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')
const errors = []
const warnings = []

function walk(directory, extension) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(fullPath, extension)
    return !extension || entry.name.endsWith(extension) ? [fullPath] : []
  })
}

function localTargetToFile(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split(/[?#]/)[0]).replace(/^\/+/, '')
  const direct = path.join(publicDir, cleanPath)
  const candidates = [
    direct,
    `${direct}.html`,
    path.join(direct, 'index.html')
  ]
  return candidates.find(candidate => fs.existsSync(candidate))
}

if (!fs.existsSync(publicDir)) {
  errors.push('public/ 不存在，请先运行 npm run build。')
} else {
  const htmlFiles = walk(publicDir, '.html')

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8')
    const relative = path.relative(publicDir, file).replaceAll(path.sep, '/')
    const isVerificationFile = relative.startsWith('google')
    const h1Count = (html.match(/<h1(?:\s|>)/gi) || []).length

    if (/<img[^>]*\/\s+loading=/i.test(html)) {
      errors.push(`${relative}: 存在无效的懒加载图片标签。`)
    }
    if (relative !== '404.html' && !isVerificationFile && h1Count !== 1) {
      errors.push(`${relative}: 应恰好包含一个 H1，当前为 ${h1Count}。`)
    }
    if (!/<meta name="description" content="[^\"]{10,}"/i.test(html) && !isVerificationFile) {
      warnings.push(`${relative}: description 过短或缺失。`)
    }

    if (!isVerificationFile) {
      if (!/<html[^>]+lang="zh-CN"/i.test(html)) errors.push(`${relative}: html 缺少 zh-CN 语言声明。`)
      if (!/<link rel="canonical" href="https:\/\//i.test(html)) errors.push(`${relative}: 缺少 canonical URL。`)
      if (!/<link rel="manifest" href="\/site\.webmanifest">/i.test(html)) errors.push(`${relative}: 缺少 Web App Manifest。`)
      if (!/class="skip-link"[^>]+href="#content-inner"/i.test(html)) errors.push(`${relative}: 缺少跳至主要内容链接。`)
      if (!/<main[^>]+id="content-inner"[^>]+tabindex="-1"/i.test(html)) errors.push(`${relative}: 主内容区域不可被跳转聚焦。`)
      if (!/<nav[^>]+id="nav"[^>]+aria-label=/i.test(html)) errors.push(`${relative}: 主导航缺少可访问名称。`)

      for (const image of html.match(/<img\b[^>]*>/gi) || []) {
        if (!/\balt=(['"]).*?\1/i.test(image)) errors.push(`${relative}: 图片缺少 alt 属性。`)
        if (!/\bdecoding=(['"])async\1/i.test(image)) warnings.push(`${relative}: 图片未启用异步解码。`)
        if ((image.match(/\bdecoding=/gi) || []).length > 1) errors.push(`${relative}: 图片存在重复 decoding 属性。`)
        if (/\bsrc=(['"])\/img\/covers\//i.test(image) && !/\bwidth=(['"])1600\1[^>]*\bheight=(['"])900\2/i.test(image)) {
          errors.push(`${relative}: 专属文章封面缺少 1600×900 固有尺寸。`)
        }
      }
      for (const anchor of html.match(/<a\b[^>]*\btarget=(['"])_blank\1[^>]*>/gi) || []) {
        if (!/\brel=(['"])[^'"]*noopener[^'"]*\1/i.test(anchor)) errors.push(`${relative}: 新窗口链接缺少 noopener。`)
      }
      for (const iframe of html.match(/<iframe\b[^>]*>/gi) || []) {
        if (!/\btitle=(['"]).+?\1/i.test(iframe)) errors.push(`${relative}: iframe 缺少 title。`)
        if (!/\bloading=(['"])lazy\1/i.test(iframe)) warnings.push(`${relative}: iframe 未启用懒加载。`)
      }

      for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
        try {
          const structuredData = JSON.parse(match[1])
          if (!structuredData['@context'] || !structuredData['@type']) {
            errors.push(`${relative}: 结构化数据缺少 @context 或 @type。`)
          }
        } catch (error) {
          errors.push(`${relative}: JSON-LD 无法解析：${error.message}`)
        }
      }

      const ogImage = html.match(/<meta property="og:image" content="([^"]+)">/i)?.[1]
      const preloadImage = html.match(/<link rel="preload" as="image" href="([^"]+)"/i)?.[1]
      if (ogImage && preloadImage) {
        const ogPath = new URL(ogImage).pathname
        if (ogPath !== preloadImage) errors.push(`${relative}: 首屏预加载图片与页面分享图不一致。`)
      }
    }

    const links = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(match => match[1])
    for (const link of links) {
      if (!link.startsWith('/') || link.startsWith('//')) continue
      if (!localTargetToFile(link)) errors.push(`${relative}: 本地资源不存在 ${link}`)
    }
  }

  const sitemapPath = path.join(publicDir, 'sitemap.xml')
  if (!fs.existsSync(sitemapPath)) errors.push('缺少 sitemap.xml。')
  else if (/blog-knowledge\.json/i.test(fs.readFileSync(sitemapPath, 'utf8'))) {
    errors.push('sitemap.xml 不应收录 blog-knowledge.json。')
  }

  const requiredFiles = [
    '404.html',
    'robots.txt',
    '_headers',
    'site.webmanifest',
    'js/site-enhancements.js',
    'data/blog-knowledge.json'
  ]
  for (const required of requiredFiles) {
    if (!fs.existsSync(path.join(publicDir, required))) errors.push(`缺少生成文件 ${required}。`)
  }

  for (const image of walk(path.join(publicDir, 'img'))) {
    const size = fs.statSync(image).size
    if (size > 500 * 1024) {
      errors.push(`${path.relative(publicDir, image)}: 图片超过 500 KiB（${Math.ceil(size / 1024)} KiB）。`)
    }
  }

  const manifestPath = path.join(publicDir, 'site.webmanifest')
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (!manifest.name || !manifest.start_url || !Array.isArray(manifest.icons) || manifest.icons.length < 2) {
        errors.push('site.webmanifest 缺少必要的名称、入口或图标。')
      }
    } catch (error) {
      errors.push(`site.webmanifest 无法解析：${error.message}`)
    }
  }

  for (const asset of [...walk(path.join(publicDir, 'css')), ...walk(path.join(publicDir, 'js'))]) {
    const size = fs.statSync(asset).size
    if (size > 300 * 1024) {
      warnings.push(`${path.relative(publicDir, asset)}: 静态资源超过 300 KiB（${Math.ceil(size / 1024)} KiB）。`)
    }
  }

  const knowledgePath = path.join(publicDir, 'data', 'blog-knowledge.json')
  if (fs.existsSync(knowledgePath)) {
    try {
      const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'))
      if (!Array.isArray(knowledge) || knowledge.length === 0) errors.push('知识库必须是非空数组。')
      for (const item of knowledge) {
        if (!item.id || !item.title || !item.url || !item.content) errors.push('知识库存在字段不完整的片段。')
        if (item.url && !localTargetToFile(item.url)) errors.push(`知识库链接不存在 ${item.url}`)
      }
    } catch (error) {
      errors.push(`知识库 JSON 无法解析：${error.message}`)
    }
  }
}

warnings.forEach(message => console.warn(`WARN ${message}`))
errors.forEach(message => console.error(`ERROR ${message}`))

if (errors.length) {
  console.error(`\n质量检查失败：${errors.length} 个错误，${warnings.length} 个警告。`)
  process.exit(1)
}

console.log(`质量检查通过：${warnings.length} 个非阻断警告。`)
