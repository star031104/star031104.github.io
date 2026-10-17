'use strict'

// CommonMark 的“定界符规则”要求 ** 的内侧紧邻非标点字符，
// 因此 “**多候选：**每页……” 这类以中文标点结尾、后接中文的写法不会被渲染成粗体，
// 页面上会直接露出星号。这里在 Markdown 渲染前把这类粗体转换成 <strong>，
// 并跳过代码块与行内代码。

function convertEmphasis(text) {
  return text.replace(/\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
}

function transform(markdown) {
  const output = []
  let inFence = false
  let fenceMarker = ''
  for (const line of markdown.split('\n')) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceMarker = fence[1][0]
      } else if (fence[1][0] === fenceMarker) {
        inFence = false
      }
      output.push(line)
      continue
    }
    if (inFence) {
      output.push(line)
      continue
    }
    // 行内代码保持原样
    output.push(line.split(/(`+[^`]*`+)/).map((part, index) => index % 2 ? part : convertEmphasis(part)).join(''))
  }
  return output.join('\n')
}

if (typeof hexo !== 'undefined') {
  hexo.extend.filter.register('before_post_render', data => {
    if (data.source && /\.(md|markdown)$/i.test(data.source)) data.content = transform(data.content)
    return data
  })
}

module.exports = { transform }
