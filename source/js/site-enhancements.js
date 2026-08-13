'use strict'

document.addEventListener('DOMContentLoaded', () => {
  const skipLink = document.querySelector('.skip-link')
  const mainContent = document.querySelector('#content-inner')
  skipLink?.addEventListener('click', event => {
    event.preventDefault()
    mainContent?.focus({ preventScroll: true })
    mainContent?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.replaceState(null, '', '#content-inner')
  })

  const interactiveSelectors = [
    '#search-button .search[role="button"]',
    '#toggle-menu .site-page[role="button"]',
    '#scroll-down[role="button"]'
  ]

  document.querySelectorAll(interactiveSelectors.join(',')).forEach(element => {
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      element.click()
    })
  })

  const normalizePath = value => {
    const path = value.replace(/\/index\.html$/, '/').replace(/\/$/, '')
    return path || '/'
  }
  const currentPath = normalizePath(window.location.pathname)
  document.querySelectorAll('#nav a.site-page, #sidebar-menus a.site-page').forEach(link => {
    if (normalizePath(new URL(link.href, window.location.href).pathname) === currentPath) {
      link.setAttribute('aria-current', 'page')
    }
  })

  const themeColor = document.querySelector('meta[name="theme-color"]')
  const syncThemeColor = () => {
    if (!themeColor) return
    themeColor.content = document.documentElement.dataset.theme === 'dark' ? '#0b1020' : '#f4f6fb'
  }
  syncThemeColor()
  new MutationObserver(syncThemeColor).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
})
