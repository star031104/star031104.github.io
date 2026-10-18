'use strict'

// 站内搜索：点击导航栏「搜索」或按 Ctrl/⌘ + K 时，按需加载 Pagefind 并在对话框中展示结果。
// 索引由 npm run build 生成到 /pagefind/，本地 hexo server 预览时不存在，会给出提示。
;(() => {
  let dialog = null
  let loading = null

  const loadAsset = (tag, attributes) => new Promise((resolve, reject) => {
    const element = document.createElement(tag)
    Object.assign(element, attributes)
    element.onload = resolve
    element.onerror = reject
    document.head.appendChild(element)
  })

  const loadPagefind = () => {
    loading ||= Promise.all([
      loadAsset('link', { rel: 'stylesheet', href: '/pagefind/pagefind-ui.css' }),
      loadAsset('script', { src: '/pagefind/pagefind-ui.js' })
    ])
    return loading
  }

  const createDialog = () => {
    dialog = document.createElement('dialog')
    dialog.className = 'qm-search-dialog'
    dialog.setAttribute('aria-label', '站内搜索')
    dialog.innerHTML = `
      <div class="qm-search-panel">
        <div class="qm-search-head">
          <span class="qm-search-title"><i class="fas fa-search" aria-hidden="true"></i> 站内搜索</span>
          <button type="button" class="qm-search-close" aria-label="关闭搜索">ESC</button>
        </div>
        <div id="qm-pagefind" class="qm-search-body"><p class="qm-search-status">正在加载搜索…</p></div>
      </div>`
    dialog.querySelector('.qm-search-close').addEventListener('click', () => dialog.close())
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close()
    })
    dialog.addEventListener('close', () => document.body.classList.remove('qm-search-open'))
    document.body.appendChild(dialog)
  }

  const focusInput = () => dialog.querySelector('.pagefind-ui__search-input')?.focus()

  const openSearch = async () => {
    if (!dialog) createDialog()
    if (!dialog.open) dialog.showModal()
    document.body.classList.add('qm-search-open')
    if (window.PagefindUI && dialog.dataset.ready) return focusInput()

    try {
      await loadPagefind()
      const container = dialog.querySelector('#qm-pagefind')
      container.innerHTML = ''
      // eslint-disable-next-line no-new
      new window.PagefindUI({
        element: '#qm-pagefind',
        showSubResults: true,
        showImages: true,
        resetStyles: false,
        pageSize: 6,
        excerptLength: 36,
        autofocus: true
      })
      dialog.dataset.ready = 'true'
      focusInput()
    } catch {
      loading = null
      dialog.querySelector('#qm-pagefind').innerHTML =
        '<p class="qm-search-status">搜索索引尚未生成。本地预览请先运行 <code>npm run build</code>，再用 <code>npx hexo server -s</code> 打开。</p>'
    }
  }

  document.addEventListener('click', event => {
    if (!event.target.closest('#search-button')) return
    event.preventDefault()
    openSearch()
  })

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      openSearch()
    }
  })
})()
