document.addEventListener('DOMContentLoaded', () => {
  const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])
  const DEFAULT_API_URL = LOCAL_HOSTS.has(window.location.hostname)
    ? 'https://blog-ai-assistant-staging.star20031104.workers.dev'
    : 'https://blog-ai-assistant.star20031104.workers.dev'
  const API_URL = document.documentElement.dataset.aiEndpoint || DEFAULT_API_URL
  const REQUEST_TIMEOUT_MS = 120000
  const MAX_ARTICLE_CHARS = 30000
  const MAX_HISTORY_TURNS = 8
  const STORAGE_KEY = 'qm-ai-assistant-v2'

  const wrapper = document.createElement('div')
  wrapper.id = 'ai-assistant'
  wrapper.innerHTML = `
    <button id="ai-assistant-btn" type="button" aria-label="打开浅梦 AI 助手" aria-controls="ai-assistant-panel" aria-expanded="false">
      <span class="ai-launcher-mark" aria-hidden="true">✦</span>
      <span class="ai-launcher-label">AI</span>
    </button>

    <section id="ai-assistant-panel" role="dialog" aria-modal="false" aria-labelledby="ai-panel-title" aria-hidden="true">
      <div class="ai-panel-header">
        <div class="ai-brand">
          <span class="ai-brand-mark" aria-hidden="true">✦</span>
          <div>
            <div id="ai-panel-title" class="ai-title">浅梦 AI 助手</div>
            <div id="ai-panel-status" class="ai-status"><span class="ai-status-dot" aria-hidden="true"></span><span class="ai-status-text">博客知识库已连接</span></div>
          </div>
        </div>
        <div class="ai-header-actions">
          <button id="ai-clear-btn" class="ai-icon-btn" type="button" aria-label="清空对话" title="清空对话">清空</button>
          <button id="ai-panel-close" class="ai-icon-btn ai-close-btn" type="button" aria-label="关闭 AI 助手" title="关闭">×</button>
        </div>
      </div>

      <div class="ai-panel-actions" aria-label="快捷提问">
        <button id="ai-summary-btn" class="ai-quick-action" type="button"><span aria-hidden="true">✦</span>总结本文</button>
        <button class="ai-quick-action" type="button" data-ai-prompt="请介绍博客的主要文章分类，并为每类推荐一篇内容。">文章分类</button>
        <button class="ai-quick-action" type="button" data-ai-prompt="博客最近更新了哪些内容？请简要介绍。">最近更新</button>
      </div>

      <div id="ai-panel-messages" role="log" aria-live="polite" aria-relevant="additions text"></div>

      <form class="ai-panel-input-wrap">
        <div class="ai-composer">
          <label class="sr-only" for="ai-panel-input">输入问题</label>
          <textarea id="ai-panel-input" rows="1" maxlength="1000" placeholder="问问这座博客里的内容…"></textarea>
          <button id="ai-panel-send" type="submit" aria-label="发送消息">
            <span class="ai-send-label">发送</span>
            <span class="ai-send-icon" aria-hidden="true">↑</span>
          </button>
        </div>
        <p class="ai-privacy-note">AI 可能会出错，请以引用的原文为准</p>
      </form>
    </section>
  `
  document.body.appendChild(wrapper)

  const btn = wrapper.querySelector('#ai-assistant-btn')
  const panel = wrapper.querySelector('#ai-assistant-panel')
  const closeBtn = wrapper.querySelector('#ai-panel-close')
  const clearBtn = wrapper.querySelector('#ai-clear-btn')
  const input = wrapper.querySelector('#ai-panel-input')
  const form = wrapper.querySelector('.ai-panel-input-wrap')
  const sendBtn = wrapper.querySelector('#ai-panel-send')
  const summaryBtn = wrapper.querySelector('#ai-summary-btn')
  const messages = wrapper.querySelector('#ai-panel-messages')
  const status = wrapper.querySelector('#ai-panel-status')
  const statusText = wrapper.querySelector('.ai-status-text')
  const sendLabel = wrapper.querySelector('.ai-send-label')
  const sendIcon = wrapper.querySelector('.ai-send-icon')
  const quickActionBtns = [...wrapper.querySelectorAll('.ai-quick-action')]

  let pending = false
  let activeController = null
  let history = loadHistory()
  let lastRequest = null

  renderInitialMessages()
  updateArticleAction()

  btn.addEventListener('click', () => setPanelOpen(!panel.classList.contains('show')))
  closeBtn.addEventListener('click', () => setPanelOpen(false))
  clearBtn.addEventListener('click', clearConversation)
  summaryBtn.addEventListener('click', summarizeCurrentArticle)
  wrapper.querySelectorAll('[data-ai-prompt]').forEach(action => {
    action.addEventListener('click', () => sendSuggestedMessage(action.dataset.aiPrompt || ''))
  })
  form.addEventListener('submit', event => {
    event.preventDefault()
    if (pending) stopRequest()
    else sendMessage()
  })
  input.addEventListener('input', autoResizeInput)
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.classList.contains('show')) setPanelOpen(false)
  })

  function getCurrentArticle() {
    return document.querySelector('#article-container.post-content, .article-entry.post-content, .post-content')
  }

  function getArticleTitle() {
    return document.querySelector('#post-info .post-title, .post-title')?.textContent?.trim() || document.title
  }

  function updateArticleAction() {
    const hasArticle = Boolean(getCurrentArticle())
    summaryBtn.disabled = !hasArticle
    summaryBtn.hidden = !hasArticle
    summaryBtn.title = hasArticle ? '' : '当前页面不是文章页'
  }

  function setPanelOpen(open) {
    panel.classList.toggle('show', open)
    panel.setAttribute('aria-hidden', String(!open))
    btn.setAttribute('aria-expanded', String(open))
    btn.setAttribute('aria-label', open ? '关闭浅梦 AI 助手' : '打开浅梦 AI 助手')
    if (open) {
      updateArticleAction()
      window.setTimeout(() => input.focus(), 80)
    } else {
      btn.focus()
    }
  }

  function renderInitialMessages() {
    messages.replaceChildren()
    if (!history.length) {
      appendMessage('你好呀～ 我可以总结当前文章，也可以根据博客内容回答问题。回答下方会附上参考文章，方便你核对。', 'bot')
      return
    }
    history.forEach(turn => appendMessage(turn.content, turn.role === 'assistant' ? 'bot' : 'user'))
  }

  function sendSuggestedMessage(prompt) {
    if (!prompt || pending) return
    input.value = prompt
    autoResizeInput()
    sendMessage()
  }

  function clearConversation() {
    if (pending) stopRequest()
    history = []
    lastRequest = null
    sessionStorage.removeItem(STORAGE_KEY)
    renderInitialMessages()
    input.focus()
  }

  function loadHistory() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')
      if (!Array.isArray(value)) return []
      return value
        .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .slice(-MAX_HISTORY_TURNS)
    } catch {
      return []
    }
  }

  function saveHistory() {
    history = history.slice(-MAX_HISTORY_TURNS)
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    } catch {
      // Private browsing or a full storage quota should not break chat.
    }
  }

  function getSessionId() {
    const key = `${STORAGE_KEY}:session`
    try {
      const existing = sessionStorage.getItem(key)
      if (existing) return existing
      const value = crypto.randomUUID().replace(/-/g, '')
      sessionStorage.setItem(key, value)
      return value
    } catch {
      return 'browser-session'
    }
  }

  async function sendMessage() {
    const text = input.value.trim()
    if (!text || pending) return

    const previousHistory = history.slice(-MAX_HISTORY_TURNS)
    appendMessage(text, 'user')
    history.push({ role: 'user', content: text })
    saveHistory()
    input.value = ''
    autoResizeInput()

    const payload = {
      type: 'chat',
      sessionId: getSessionId(),
      message: text,
      history: previousHistory,
      stream: true
    }
    lastRequest = payload
    await runRequest(payload)
  }

  async function summarizeCurrentArticle() {
    const article = getCurrentArticle()
    if (!article || pending) return
    const content = article.innerText.trim().slice(0, MAX_ARTICLE_CHARS)
    if (!content) {
      appendMessage('没有读取到文章内容。', 'bot')
      return
    }

    const label = `请总结《${getArticleTitle()}》。`
    appendMessage(label, 'user')
    const previousHistory = history.slice(-MAX_HISTORY_TURNS)
    history.push({ role: 'user', content: label })
    saveHistory()

    const payload = {
      type: 'summary',
      sessionId: getSessionId(),
      content,
      title: getArticleTitle(),
      url: window.location.href,
      history: previousHistory,
      stream: true
    }
    lastRequest = payload
    await runRequest(payload)
  }

  async function retryLastRequest() {
    if (!lastRequest || pending) return
    await runRequest(lastRequest)
  }

  async function runRequest(payload) {
    const answer = appendMessage('', 'bot', { loading: true })
    const answerText = answer.querySelector('.ai-msg-text')
    setPending(true)
    let receivedText = ''
    let sources = []

    try {
      const result = await callAI(payload, {
        onMetadata(metadata) {
          sources = Array.isArray(metadata.sources) ? metadata.sources : []
        },
        onToken(token) {
          receivedText += token
          answer.classList.remove('is-loading')
          answerText.textContent = receivedText
          messages.scrollTop = messages.scrollHeight
        }
      })
      receivedText = receivedText || result.answer || ''
      sources = sources.length ? sources : (result.sources || [])
      answer.classList.remove('is-loading')
      renderAssistantText(answerText, receivedText || 'AI 暂时没有返回有效内容。')
      renderSources(answer, sources)
      if (receivedText) {
        history.push({ role: 'assistant', content: receivedText })
        saveHistory()
      }
    } catch (error) {
      answer.classList.remove('is-loading')
      if (error.name === 'AbortError' && error.code !== 'TIMEOUT') {
        answerText.textContent = receivedText || '已停止生成。'
      } else {
        answer.classList.add('is-error')
        answerText.textContent = friendlyError(error)
        const retry = document.createElement('button')
        retry.type = 'button'
        retry.className = 'ai-retry-btn'
        retry.textContent = '重试'
        retry.addEventListener('click', retryLastRequest, { once: true })
        answer.appendChild(retry)
      }
    } finally {
      setPending(false)
      messages.scrollTop = messages.scrollHeight
    }
  }

  async function callAI(payload, handlers) {
    const controller = new AbortController()
    activeController = controller
    let timedOut = false
    let timeout = 0
    const resetTimeout = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => {
        timedOut = true
        controller.abort()
      }, REQUEST_TIMEOUT_MS)
    }
    resetTimeout()

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })

      const contentType = response.headers.get('content-type') || ''
      if (!response.ok) {
        const payload = contentType.includes('application/json') ? await response.json() : null
        const error = new Error(payload?.error?.message || payload?.error || `AI service returned ${response.status}`)
        error.code = payload?.error?.code || `HTTP_${response.status}`
        throw error
      }

      if (contentType.includes('text/event-stream') && response.body) {
        return await readEventStream(response.body, {
          onMetadata(metadata) {
            resetTimeout()
            handlers.onMetadata(metadata)
          },
          onToken(token) {
            resetTimeout()
            handlers.onToken(token)
          }
        })
      }
      if (!contentType.includes('application/json')) throw new Error('AI service returned invalid content')
      const data = await response.json()
      if (data.error) {
        const error = new Error(data.error.message || data.error)
        error.code = data.error.code
        throw error
      }
      return data
    } catch (error) {
      if (timedOut) error.code = 'TIMEOUT'
      throw error
    } finally {
      window.clearTimeout(timeout)
      if (activeController === controller) activeController = null
    }
  }

  async function readEventStream(stream, handlers) {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let answer = ''
    let sources = []

    const processEvent = block => {
      const lines = block.split('\n')
      const eventName = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message'
      const dataText = lines
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n')
      if (!dataText || dataText === '[DONE]') return
      let data
      try {
        data = JSON.parse(dataText)
      } catch {
        return
      }
      if (eventName === 'meta') {
        sources = Array.isArray(data.sources) ? data.sources : []
        handlers.onMetadata(data)
      } else if (eventName === 'token') {
        const token = typeof data.text === 'string' ? data.text : ''
        answer += token
        handlers.onToken(token)
      } else if (eventName === 'error') {
        const error = new Error(data.message || '回答生成过程中断。')
        error.code = data.code
        throw error
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let separator = buffer.indexOf('\n\n')
      while (separator >= 0) {
        processEvent(buffer.slice(0, separator))
        buffer = buffer.slice(separator + 2)
        separator = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) processEvent(buffer)
    return { answer, sources }
  }

  function stopRequest() {
    activeController?.abort()
  }

  function setPending(value) {
    pending = value
    sendLabel.textContent = value ? '停止' : '发送'
    sendIcon.textContent = value ? '■' : '↑'
    sendBtn.setAttribute('aria-label', value ? '停止生成' : '发送消息')
    sendBtn.classList.toggle('is-stop', value)
    quickActionBtns.forEach(action => { action.disabled = value })
    summaryBtn.disabled = value || !getCurrentArticle()
    clearBtn.disabled = value
    input.disabled = value
    panel.setAttribute('aria-busy', String(value))
    status.classList.toggle('is-thinking', value)
    statusText.textContent = value ? '正在检索博客并生成回答' : '博客知识库已连接'
  }

  function appendMessage(text, type, options = {}) {
    const div = document.createElement('div')
    div.className = `ai-msg ai-msg-${type}${options.loading ? ' is-loading' : ''}`
    const content = document.createElement('div')
    content.className = 'ai-msg-text'
    if (type === 'bot' && text) renderAssistantText(content, text)
    else content.textContent = text
    div.appendChild(content)
    messages.appendChild(div)
    messages.scrollTop = messages.scrollHeight
    return div
  }

  function renderAssistantText(container, text) {
    container.replaceChildren()
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
    let list = null
    let listType = ''

    const appendInline = (target, value) => {
      const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g
      let lastIndex = 0
      let match
      while ((match = pattern.exec(value)) !== null) {
        if (match.index > lastIndex) target.append(document.createTextNode(value.slice(lastIndex, match.index)))
        const token = match[0]
        const node = document.createElement(token.startsWith('**') ? 'strong' : 'code')
        node.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1)
        target.append(node)
        lastIndex = pattern.lastIndex
      }
      if (lastIndex < value.length) target.append(document.createTextNode(value.slice(lastIndex)))
    }

    const resetList = () => {
      list = null
      listType = ''
    }

    lines.forEach(rawLine => {
      const line = rawLine.trim()
      if (!line) {
        resetList()
        return
      }

      const heading = line.match(/^#{1,3}\s+(.+)$/)
      const unordered = line.match(/^[-*]\s+(.+)$/)
      const ordered = line.match(/^\d+[.)]\s+(.+)$/)

      if (unordered || ordered) {
        const nextType = ordered ? 'ol' : 'ul'
        if (!list || listType !== nextType) {
          list = document.createElement(nextType)
          listType = nextType
          container.append(list)
        }
        const item = document.createElement('li')
        appendInline(item, (ordered || unordered)[1])
        list.append(item)
        return
      }

      resetList()
      const paragraph = document.createElement('p')
      if (heading) paragraph.className = 'ai-answer-heading'
      appendInline(paragraph, heading ? heading[1] : line)
      container.append(paragraph)
    })
  }

  function renderSources(message, sourceList) {
    if (!Array.isArray(sourceList) || !sourceList.length) return
    const container = document.createElement('details')
    container.className = 'ai-sources'
    const label = document.createElement('summary')
    label.className = 'ai-sources-label'
    label.textContent = `查看 ${Math.min(sourceList.length, 6)} 个参考来源`
    container.appendChild(label)

    const list = document.createElement('div')
    list.className = 'ai-source-list'

    sourceList.slice(0, 6).forEach((source, index) => {
      const href = safeSourceUrl(source.url)
      if (!href) return
      const link = document.createElement('a')
      link.href = href
      link.className = 'ai-source-link'
      link.textContent = `[${source.index || index + 1}] ${source.title}${source.heading && source.heading !== source.title ? ` · ${source.heading}` : ''}`
      link.title = '打开参考文章'
      list.appendChild(link)
    })
    if (list.childElementCount) {
      container.appendChild(list)
      message.appendChild(container)
    }
  }

  function safeSourceUrl(value) {
    if (typeof value !== 'string' || !value) return ''
    try {
      const url = new URL(value, window.location.origin)
      return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : ''
    } catch {
      return ''
    }
  }

  function friendlyError(error) {
    const messagesByCode = {
      RATE_LIMITED: '请求有些频繁，请稍等一分钟再试。',
      ORIGIN_NOT_ALLOWED: '当前网站地址未被 AI 服务授权。',
      KNOWLEDGE_UNAVAILABLE: '博客知识库暂时不可用，请稍后重试。',
      KNOWLEDGE_INVALID: '博客知识库正在维护，请稍后重试。',
      MODEL_ERROR: '模型服务暂时繁忙，请稍后重试。',
      MODEL_RATE_LIMITED: '硅基流动模型当前请求较多，请稍后再试。',
      PROVIDER_AUTH_FAILED: '智谱模型密钥无效或尚未配置。',
      PROVIDER_NOT_CONFIGURED: 'AI 模型尚未完成配置。',
      TIMEOUT: '硅基流动模型响应时间较长，本次请求已超时。请稍后重试。'
    }
    return messagesByCode[error.code] || '暂时无法连接 AI 服务，请稍后重试。'
  }

  function autoResizeInput() {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 96)}px`
  }
})
