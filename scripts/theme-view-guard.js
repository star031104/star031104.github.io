'use strict'

// Hexo 的主题视图处理器使用未锚定的 'layout/*path' 规则，
// 会把 Butterfly 的 source/css/_layout/post.styl 误注册为名为 "post" 的视图。
// 冷启动（hexo clean 之后）时它可能排在 post.pug 之前，导致所有文章页渲染失败。
// 这里在生成前剔除非模板扩展名的视图。

const TEMPLATE_EXTENSIONS = new Set(['.pug', '.ejs', '.njk', '.swig', '.html'])

hexo.extend.filter.register('before_generate', () => {
  const views = hexo.theme.views || {}
  for (const name of Object.keys(views)) {
    for (const ext of Object.keys(views[name] || {})) {
      if (!TEMPLATE_EXTENSIONS.has(ext)) delete views[name][ext]
    }
    if (!Object.keys(views[name]).length) delete views[name]
  }
})
