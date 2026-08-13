'use strict'

const fs = require('node:fs')
const path = require('node:path')

hexo.extend.generator.register('cloudflare-headers', () => {
  const source = path.join(hexo.source_dir, '_headers')
  if (!fs.existsSync(source)) return []

  return {
    path: '_headers',
    data: fs.readFileSync(source, 'utf8')
  }
})
