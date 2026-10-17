'use strict'

// 为 source/ 下自定义的 CSS/JS 自动追加内容哈希版本号（?v=<hash>）。
// 修改样式或脚本后无需再手动改 _config.butterfly.yml 里的版本号，
// 配合 _headers 中 /css/* /js/* 的 immutable 长缓存也不会出现旧资源。

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const cache = new Map()

function assetHash(sourceDir, assetPath) {
  const file = path.join(sourceDir, assetPath.replace(/^\//, ''))
  if (!fs.existsSync(file)) return null
  const stat = fs.statSync(file)
  const cached = cache.get(file)
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.hash
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10)
  cache.set(file, { mtimeMs: stat.mtimeMs, hash })
  return hash
}

// 主题自带资源（/css/index.css、/js/main.js 等）由主题配置渲染而来，
// 用“主题版本 + 主题配置内容”的哈希作为版本号，改配色等配置后也能刷新缓存。
function themeHash(baseDir, themeDir) {
  const parts = []
  for (const file of [path.join(themeDir, 'package.json'), path.join(baseDir, '_config.butterfly.yml')]) {
    if (fs.existsSync(file)) parts.push(fs.readFileSync(file))
  }
  return crypto.createHash('sha256').update(Buffer.concat(parts)).digest('hex').slice(0, 10)
}

if (typeof hexo !== 'undefined') {
  hexo.extend.filter.register('after_render:html', html => {
    const themeVersion = themeHash(hexo.base_dir, hexo.theme_dir)
    return html.replace(
      /((?:href|src)=")(\/(?:css|js)\/[^"?#]+\.(?:css|js))(?:\?v=[^"]*)?(")/g,
      (match, prefix, assetPath, suffix) => {
        const hash = assetHash(hexo.source_dir, assetPath) || themeVersion
        return `${prefix}${assetPath}?v=${hash}${suffix}`
      }
    )
  }, 40)
}

module.exports = { assetHash, themeHash }
