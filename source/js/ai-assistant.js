document.addEventListener('DOMContentLoaded', () => {
  const API_URL = 'https://blog-ai-assistant.star20031104.workers.dev'
  const REQUEST_TIMEOUT_MS = 30000
  const MAX_ARTICLE_CHARS = 30000

  const wrapper = document.createElement('div')
  wrapper.id = 'ai-assistant'
  wrapper.innerHTML = `
    <button id="ai-assistant-btn" type="button" aria-label="打开浅梦 AI 助手" aria-controls="ai-assistant-panel" aria-expanded="false">AI</button>

    <section id="ai-assistant-panel" role="dialog" aria-modal="false" aria-labelledby="ai-panel-title" aria-hidden="true">
      <div class="ai-panel-header">
        <div id="ai-panel-title" class="ai-title">浅梦 AI 助手</div>
        <button id="ai-panel-close" type="button" aria-label="关闭 AI 助手">×</button>
      </div>

      <div class="ai-panel-actions">
        <button id="ai-summary-btn" type="button">总结当前文章</button>
      </div>

      <div id="ai-panel-messages" role="log" aria-live="polite" aria-relevant="additions text">
        <div class="ai-msg ai-msg-bot">你好呀～ 我可以总结当前文章，也可以根据博客内容回答问题。</div>
      </div>

      <form class="ai-panel-input-wrap">
        <label class="sr-only" for="ai-panel-input">输入问题</label>
        <input id="ai-panel-input" type="text" maxlength="1000" autocomplete="off" placeholder="输入你想问的问题..." />
        <button id="ai-panel-send" type="submit">发送</button>
      </form>
      <p class="ai-privacy-note">提问内容将发送到博客 AI 服务处理，请勿输入敏感信息。</p>
    </section>
  `

  document.body.appendChild(wrapper)

  const btn = wrapper.querySelector('#ai-assistant-btn')
  const panel = wrapper.querySelector('#ai-assistant-panel')
  const closeBtn = wrapper.querySelector('#ai-panel-close')
  const input = wrapper.querySelector('#ai-panel-input')
  const form = wrapper.querySelector('.ai-panel-input-wrap')
  const sendBtn = wrapper.querySelector('#ai-panel-send')
  const summaryBtn = wrapper.querySelector('#ai-summary-btn')
  const messages = wrapper.querySelector('#ai-panel-messages')
  const article = getCurrentArticle()
  let pending = false

  if (!article) {
    summaryBtn.disabled = true
    summaryBtn.title = '当前页面不是文章页'
  }

  btn.addEventListener('click', () => setPanelOpen(!panel.classList.contains('show')))
  closeBtn.addEventListener('click', () => setPanelOpen(false))
  form.addEventListener('submit', event => {
    event.preventDefault()
    sendMessage()
  })
  summaryBtn.addEventListener('click', summarizeCurrentArticle)

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('show')) setPanelOpen(false)
  })

  function getCurrentArticle() {
    return document.querySelector('#article-container.post-content, .article-entry.post-content, .post-content')
  }

  function setPanelOpen(open) {
    panel.classList.toggle('show', open)
    panel.setAttribute('aria-hidden', String(!open))
    btn.setAttribute('aria-expanded', String(open))
    btn.setAttribute('aria-label', open ? '关闭浅梦 AI 助手' : '打开浅梦 AI 助手')
    if (open) input.focus()
    else btn.focus()
  }

  async function sendMessage() {
    const text = input.value.trim()
    if (!text || pending) return

    appendMessage(text, 'user')
    input.value = ''
    const loading = appendMessage('正在根据博客内容检索并思考...', 'bot')

    await runRequest({ type: 'chat', message: text }, loading)
  }

  async function summarizeCurrentArticle() {
    if (!article || pending) return

    const content = article.innerText.trim().slice(0, MAX_ARTICLE_CHARS)
    if (!content) {
      appendMessage('没有读取到文章内容。', 'bot')
      return
    }

    appendMessage('请总结当前文章。', 'user')
    const loading = appendMessage('正在总结当前文章...', 'bot')
    await runRequest({
      type: 'summary',
      content,
      title: document.title,
      url: window.location.href
    }, loading)
  }

  async function runRequest(payload, target) {
    setPending(true)
    try {
      const data = await callAI(payload)
      target.textContent = data.answer || data.error || 'AI 暂时无法回答'
    } catch (error) {
      target.textContent = error.name === 'AbortError'
        ? 'AI 服务响应超时，请稍后重试。'
        : '暂时无法连接 AI 服务，请稍后重试。'
    } finally {
      setPending(false)
      messages.scrollTop = messages.scrollHeight
    }
  }

  async function callAI(payload) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })

      if (!response.ok) throw new Error(`AI service returned ${response.status}`)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) throw new Error('AI service returned invalid content')
      return await response.json()
    } finally {
      window.clearTimeout(timeout)
    }
  }

  function setPending(value) {
    pending = value
    sendBtn.disabled = value
    summaryBtn.disabled = value || !article
    input.disabled = value
    panel.setAttribute('aria-busy', String(value))
  }

  function appendMessage(text, type) {
    const div = document.createElement('div')
    div.className = `ai-msg ai-msg-${type}`
    div.textContent = text
    messages.appendChild(div)
    messages.scrollTop = messages.scrollHeight
    return div
  }
})
