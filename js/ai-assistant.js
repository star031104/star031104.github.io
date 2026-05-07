document.addEventListener('DOMContentLoaded', function () {
  const API_URL = 'https://blog-ai-assistant.star20031104.workers.dev'

  const wrapper = document.createElement('div')
  wrapper.innerHTML = `
    <div id="ai-assistant-btn">AI</div>

    <div id="ai-assistant-panel">
      <div class="ai-panel-header">
        <div class="ai-title">浅梦 AI 助手</div>
        <button id="ai-panel-close">×</button>
      </div>

      <div class="ai-panel-actions">
        <button id="ai-summary-btn">总结当前文章</button>
      </div>

      <div id="ai-panel-messages">
        <div class="ai-msg ai-msg-bot">
          你好呀～ 我可以总结当前文章，也可以根据博客内容回答问题。
        </div>
      </div>

      <div class="ai-panel-input-wrap">
        <input id="ai-panel-input" placeholder="输入你想问的问题..." />
        <button id="ai-panel-send">发送</button>
      </div>
    </div>
  `

  document.body.appendChild(wrapper)

  const btn = document.getElementById('ai-assistant-btn')
  const panel = document.getElementById('ai-assistant-panel')
  const closeBtn = document.getElementById('ai-panel-close')
  const input = document.getElementById('ai-panel-input')
  const sendBtn = document.getElementById('ai-panel-send')
  const summaryBtn = document.getElementById('ai-summary-btn')
  const messages = document.getElementById('ai-panel-messages')

  btn.addEventListener('click', () => panel.classList.toggle('show'))
  closeBtn.addEventListener('click', () => panel.classList.remove('show'))
  sendBtn.addEventListener('click', sendMessage)

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage()
  })

  summaryBtn.addEventListener('click', summarizeCurrentArticle)

  async function sendMessage() {
    const text = input.value.trim()
    if (!text) return

    appendMessage(text, 'user')
    input.value = ''

    const loading = appendMessage('正在根据博客内容检索并思考...', 'bot')

    try {
      const data = await callAI({
        type: 'chat',
        message: text
      })

      loading.textContent = data.answer || data.error || 'AI 暂时无法回答'
    } catch (err) {
      loading.textContent = '连接 AI 服务失败'
    }

    messages.scrollTop = messages.scrollHeight
  }

  async function summarizeCurrentArticle() {
    const article =
      document.querySelector('.article-entry') ||
      document.querySelector('#article-container') ||
      document.querySelector('.post-content')

    if (!article) {
      appendMessage('当前页面好像不是文章页，暂时没有可总结的正文。', 'bot')
      return
    }

    const content = article.innerText.trim()

    if (!content) {
      appendMessage('没有读取到文章内容。', 'bot')
      return
    }

    appendMessage('请总结当前文章。', 'user')
    const loading = appendMessage('正在总结当前文章...', 'bot')

    try {
      const data = await callAI({
        type: 'summary',
        content
      })

      loading.textContent = data.answer || data.error || '总结失败'
    } catch (err) {
      loading.textContent = '连接 AI 服务失败'
    }

    messages.scrollTop = messages.scrollHeight
  }

  async function callAI(payload) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    return await res.json()
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