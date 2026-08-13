'use strict'

const siteUrl = String(hexo.config.url || '').replace(/\/$/, '')
const author = String(hexo.config.author || '浅梦')

function addAttribute(attributes, name, value) {
  if (new RegExp(`\\s${name}=`, 'i').test(attributes)) return attributes
  return `${attributes} ${name}="${value}"`
}

const knownImageDimensions = new Map([
  ['/img/avatar.webp', [320, 320]],
  ['/img/index.webp', [1600, 900]],
  ['/img/og-image.webp', [1200, 630]],
  ['/img/开发报告/2.webp', [1672, 941]]
])

function imageDimensions(source = '') {
  let normalized = source
  try {
    normalized = decodeURIComponent(source)
  } catch {
    // Keep the original path when a third-party URL contains malformed escapes.
  }
  if (normalized.startsWith('/img/covers/') && normalized.endsWith('.webp')) return [1600, 900]
  return knownImageDimensions.get(normalized)
}

hexo.extend.filter.register('after_render:html', html => {
  let output = html.replace(/\s*\/\s+loading=(['"])lazy\1>/gi, ' loading="lazy">')

  output = output.replace(/<img\b([^>]*)>/gi, (tag, attributes) => {
    let enhanced = addAttribute(attributes, 'decoding', 'async')
    const source = enhanced.match(/\bsrc=(['"])(.*?)\1/i)?.[2]
    const dimensions = imageDimensions(source)
    if (dimensions) {
      enhanced = addAttribute(enhanced, 'width', dimensions[0])
      enhanced = addAttribute(enhanced, 'height', dimensions[1])
    }
    return `<img${enhanced}>`
  })

  // The profile portrait is visible immediately in the desktop sidebar. Keep it
  // out of native lazy loading so the card never flashes an empty placeholder.
  output = output.replace(
    /(<img\s+src="\/img\/avatar\.webp"[^>]*?)\s+loading=(['"])lazy\2/gi,
    '$1 loading="eager"'
  )
  output = output.replace(/(<img\s+src="\/img\/avatar\.webp"[^>]*\salt=")[^"]*(")/gi, '$1浅梦的头像$2')

  output = output
    .replace('<body>', '<body><a class="skip-link" href="#content-inner">跳至主要内容</a>')
    .replace(/<main([^>]*\bid="content-inner"[^>]*)>/i, (tag, attributes) => `<main${addAttribute(attributes, 'tabindex', '-1')}>`)
    .replace('<nav id="nav">', '<nav id="nav" aria-label="主导航">')
    .replace('<span class="site-page social-icon search">', '<span class="site-page social-icon search" role="button" tabindex="0" aria-label="打开站内搜索">')
    .replace('<span class="site-page"><i class="fas fa-bars fa-fw"></i></span>', '<span class="site-page" role="button" tabindex="0" aria-label="打开导航菜单"><i class="fas fa-bars fa-fw" aria-hidden="true"></i></span>')
    .replace('<div id="scroll-down">', '<div id="scroll-down" role="button" tabindex="0" aria-label="滚动到最新文章">')

  output = output.replace(/<a\b([^>]*\btarget=(['"])_blank\2[^>]*)>/gi, (tag, attributes) => {
    let enhanced = attributes
    if (/\brel=(['"])(.*?)\1/i.test(enhanced)) {
      enhanced = enhanced.replace(/\brel=(['"])(.*?)\1/i, (relTag, quote, values) => {
        const tokens = new Set(values.split(/\s+/).filter(Boolean))
        tokens.add('noopener')
        tokens.add('noreferrer')
        return `rel=${quote}${[...tokens].join(' ')}${quote}`
      })
    } else {
      enhanced += ' rel="noopener noreferrer"'
    }
    return `<a${enhanced}>`
  })

  output = output.replace(/<a\b([^>]*\bclass=(['"])[^'"]*social-icon[^'"]*\2[^>]*)>/gi, (tag, attributes) => {
    const title = attributes.match(/\btitle=(['"])(.*?)\1/i)?.[2]
    return `<a${title ? addAttribute(attributes, 'aria-label', title) : attributes}>`
  })

  output = output.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi, (tag, json) => {
    if (!json.trim()) return ''
    try {
      const data = JSON.parse(json)
      const person = {
        '@type': 'Person',
        name: author,
        url: siteUrl,
        image: `${siteUrl}/img/avatar.webp`,
        sameAs: [
          'https://github.com/star031104',
          'https://space.bilibili.com/435320784'
        ]
      }

      data.inLanguage ||= 'zh-CN'
      if (data['@type'] === 'WebSite') data.publisher ||= person
      if (data['@type'] === 'BlogPosting') {
        data.mainEntityOfPage ||= { '@type': 'WebPage', '@id': data.url }
        data.isPartOf ||= { '@type': 'Blog', name: hexo.config.title, url: `${siteUrl}/` }
      }

      return `<script type="application/ld+json">${JSON.stringify(data, null, 2)}</script>`
    } catch {
      return tag
    }
  })

  const rootCanonical = `<link rel="canonical" href="${siteUrl}/">`
  if (siteUrl && output.includes(rootCanonical)) {
    const socialImage = `${siteUrl}/img/og-image.webp`
    output = output
      .replace(/(<meta property="og:image" content=")[^"]+(">)/, `$1${socialImage}$2`)
      .replace(/(<meta name="twitter:image" content=")[^"]+(">)/, `$1${socialImage}$2`)
  }

  const ogTitle = output.match(/<meta property="og:title" content="([^"]+)">/i)?.[1]
  const ogDescription = output.match(/<meta property="og:description" content="([^"]+)">/i)?.[1]
  const ogImage = output.match(/<meta property="og:image" content="([^"]+)">/i)?.[1]
  const ogImagePath = ogImage ? new URL(ogImage, `${siteUrl}/`).pathname : ''
  const ogImageDimensions = imageDimensions(ogImagePath)
  const socialMeta = [
    ogTitle && !output.includes('name="twitter:title"') ? `<meta name="twitter:title" content="${ogTitle}">` : '',
    ogDescription && !output.includes('name="twitter:description"') ? `<meta name="twitter:description" content="${ogDescription}">` : '',
    ogImage?.endsWith('.webp') && !output.includes('property="og:image:type"') ? '<meta property="og:image:type" content="image/webp">' : '',
    ogImageDimensions && !output.includes('property="og:image:width"') ? `<meta property="og:image:width" content="${ogImageDimensions[0]}"><meta property="og:image:height" content="${ogImageDimensions[1]}">` : ''
  ].join('')

  const professionalHead = [
    '<meta name="color-scheme" content="light dark">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="浅梦的博客">',
    '<link rel="manifest" href="/site.webmanifest">',
    `<link rel="preload" as="image" href="${ogImagePath || '/img/index.webp'}" type="image/webp" fetchpriority="high">`,
    socialMeta
  ].join('')
  output = output.replace('</head>', `${professionalHead}</head>`)

  return output
}, 20)
