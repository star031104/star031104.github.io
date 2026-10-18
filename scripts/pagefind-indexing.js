'use strict'

// 为 Pagefind 标注索引范围：只索引文章正文，并补充标题、封面与分类筛选元数据。
// 页面一旦出现 data-pagefind-body，Pagefind 就只索引带此标记的页面，首页、归档、标签页等列表页自然被排除。

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

hexo.extend.filter.register('after_render:html', html => {
  if (!html.includes('<div id="post">') || !html.includes('id="article-container"')) return html

  let output = html
    .replace(/<article class="container post-content" id="article-container"(?![^>]*data-pagefind-body)/, '$& data-pagefind-body')
    .replace(/<h1 class="post-title"(?![^>]*data-pagefind-meta)/, '$& data-pagefind-meta="title"')
    // 流程图源码、系列目录、阅读信息条与代码行号不参与全文检索。
    .replace(/<div class="mermaid-wrap"/g, '$& data-pagefind-ignore="all"')
    .replace(/<ol class="series-items"/g, '$& data-pagefind-ignore="all"')
    .replace(/<aside class="qm-reading-bar"/g, '$& data-pagefind-ignore="all"')
    .replace(/<td class="gutter"/g, '$& data-pagefind-ignore="all"')

  const ogImage = output.match(/<meta property="og:image" content="([^"]+)">/i)?.[1]
  const categories = [...output.matchAll(/<a class="post-meta-categories"[^>]*>([^<]+)<\/a>/g)].map(match => match[1].trim())
  const metadata = [
    ogImage ? `<span data-pagefind-meta="image:${escapeAttribute(new URL(ogImage).pathname)}" hidden></span>` : '',
    ...[...new Set(categories)].map(category => `<span data-pagefind-filter="分类" hidden>${category}</span>`)
  ].join('')

  if (metadata) output = output.replace(/(<article class="container post-content" id="article-container"[^>]*>)/, `$1${metadata}`)
  return output
}, 30)
