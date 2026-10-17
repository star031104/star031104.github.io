'use strict'

const siteUrl = String(hexo.config.url || '').replace(/\/$/, '')

const projectSection = `
<section class="qm-featured" aria-labelledby="qm-featured-title">
  <div class="qm-section-heading">
    <div><span class="qm-eyebrow">SELECTED WORK</span><h2 id="qm-featured-title">正在构建的东西</h2><p>把 AI 能力做成能验证、能交付、能持续迭代的系统。</p></div>
    <a class="qm-text-link" href="/reports/">查看全部项目 <span aria-hidden="true">↗</span></a>
  </div>
  <div class="qm-project-grid">
    <a class="qm-project-card qm-project-card-primary" href="/2026/09/04/yingzhang-ai-ppt/">
      <img src="/img/开发报告/yingzhang-ai-ppt-cover.webp" alt="映章 AI PPT 项目视觉" width="1600" height="900" loading="lazy" decoding="async">
      <span class="qm-project-kicker">AI PRESENTATION · WORKFLOW</span>
      <strong>映章 YingZhang</strong>
      <span>从材料理解到可编辑 PPTX 的完整生产链路</span>
    </a>
    <a class="qm-project-card" href="/2026/08/12/开发报告-砚火InkForge-Local/">
      <img src="/img/开发报告/inkforge-local-cover.webp" alt="砚火 InkForge Local 项目视觉" width="1600" height="900" loading="lazy" decoding="async">
      <span class="qm-project-kicker">LOCAL AI · LONG-FORM WRITING</span>
      <strong>砚火 InkForge Local</strong>
      <span>让本地 AI 长篇写作拥有记忆、约束与可追溯性</span>
    </a>
    <a class="qm-project-card" href="/2026/05/19/开发报告-AI语音助手/">
      <img src="/img/generated-covers/ai-voice-assistant-image25.webp" alt="浅梦 AI 语音助手项目视觉" width="1600" height="900" loading="lazy" decoding="async">
      <span class="qm-project-kicker">AGENT · VOICE · RAG</span>
      <strong>浅梦 AI 助手 Runtime</strong>
      <span>一个本地语音桌面 Agent 的工程化实现</span>
    </a>
  </div>
</section>
<nav class="qm-topic-path" aria-label="按主题开始阅读">
  <span class="qm-topic-label">从一个方向开始</span>
  <a href="/docs/">本地 AI 与技术实践 <span>部署、模型、工具链</span></a>
  <a href="/reports/">AI 项目与工程复盘 <span>架构、取舍、验证结果</span></a>
  <a href="/essays/">阅读与生活随笔 <span>技术之外的观察</span></a>
</nav>
<div class="qm-section-heading qm-latest-heading">
  <div><span class="qm-eyebrow">LATEST WRITING</span><h2>最近更新</h2><p>新文章与近期修订，按时间继续阅读。</p></div>
  <a class="qm-text-link" href="/archives/">浏览全部文章 <span aria-hidden="true">↗</span></a>
</div>
`

const heroActions = `
<p class="qm-hero-lede">持续探索本地 AI、Agent 与知识工程，记录从想法到可交付系统的实践。</p>
<div class="qm-hero-actions">
  <a class="qm-hero-primary" href="/reports/">查看代表项目 <span aria-hidden="true">↗</span></a>
  <a class="qm-hero-secondary" href="/docs/">从技术文档开始</a>
</div>
<div class="qm-hero-topics" aria-label="主要方向"><span>LOCAL AI</span><i></i><span>AGENTS</span><i></i><span>RAG</span><i></i><span>ENGINEERING</span></div>
`

hexo.extend.filter.register('after_render:html', html => {
  const canonical = `<link rel="canonical" href="${siteUrl}/">`
  if (!siteUrl || !html.includes(canonical)) return html

  let output = html.replace(
    '<div id="site-subtitle"><span id="subtitle"></span></div>',
    `<div id="site-subtitle"><span id="subtitle"></span></div>${heroActions}`
  )
  output = output.replace('<div class="recent-post-items">', `<div class="recent-post-items">${projectSection}`)
  return output
}, 30)

hexo.extend.filter.register('after_render:html', html => {
  const articleMatch = html.match(/<article\b[^>]*id="article-container"[^>]*>([\s\S]*?)<\/article>/i)
  if (!articleMatch) return html

  const text = articleMatch[1]
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ')
  const minutes = Math.max(1, Math.ceil(Array.from(text).length / 450))
  const updated = html.match(/<time class="post-meta-date-updated"[^>]*>([^<]+)<\/time>/i)?.[1]
  const category = html.match(/<span class="post-meta-categories"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i)?.[1]?.trim()
  const metadata = `<aside class="qm-reading-bar" aria-label="文章阅读信息"><span><i aria-hidden="true">◷</i> 预计阅读 ${minutes} 分钟</span>${category ? `<span class="qm-reading-category">${category}</span>` : ''}${updated ? `<span>最近更新 ${updated}</span>` : ''}</aside>`
  return html.replace(articleMatch[0], articleMatch[0].replace(articleMatch[1], `${metadata}${articleMatch[1]}`))
}, 30)
