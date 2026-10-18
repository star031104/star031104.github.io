'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Hexo 会忽略以下划线开头的源文件，这里把 Cloudflare Pages 的配置文件原样输出到站点根目录。
const CLOUDFLARE_FILES = ['_headers', '_redirects']

hexo.extend.generator.register('cloudflare-headers', () => {
  return CLOUDFLARE_FILES
    .map(name => path.join(hexo.source_dir, name))
    .filter(file => fs.existsSync(file))
    .map(file => ({
      path: path.basename(file),
      data: fs.readFileSync(file, 'utf8')
    }))
})
