'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { assetHash } = require('../scripts/asset-versioning')

const rootDir = path.resolve(__dirname, '..')
const tokenPath = path.join(rootDir, '.cloudflare-token')
const accountPath = path.join(rootDir, '.cloudflare-account-id')

if (!fs.existsSync(tokenPath)) {
  console.error('缺少 .cloudflare-token，无法部署。')
  process.exit(1)
}

const tokenLines = fs.readFileSync(tokenPath, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)
const token = tokenLines.find(line => /^cf[A-Za-z0-9_-]{20,}$/.test(line))
  || tokenLines.find(line => !line.includes('@') && line.length >= 20)
const accountId = fs.existsSync(accountPath)
  ? fs.readFileSync(accountPath, 'utf8').trim()
  : '95c94e8b05389eb7025a369a00ddbb51'

if (!token) {
  console.error('.cloudflare-token 中没有找到有效令牌。')
  process.exit(1)
}

const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx'
const deployEnvironment = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: token,
  CLOUDFLARE_ACCOUNT_ID: accountId
}

function runWrangler(cwd, args, allowLoginFallback = false) {
  const wranglerArgs = ['--yes', 'wrangler@4.131.1', ...args]
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npx', ...wranglerArgs]
    : wranglerArgs
  let result = spawnSync(executable, commandArgs, { cwd, env: deployEnvironment, stdio: 'inherit' })
  if (result.error) throw new Error(`Cloudflare 部署命令启动失败：${result.error.message}`)
  if (result.status !== 0 && allowLoginFallback) {
    const loginEnvironment = { ...process.env }
    delete loginEnvironment.CLOUDFLARE_API_TOKEN
    delete loginEnvironment.CLOUDFLARE_ACCOUNT_ID
    console.log('API Token 权限不足，尝试使用已登录的 Wrangler 账户…')
    result = spawnSync(executable, commandArgs, { cwd, env: loginEnvironment, stdio: 'inherit' })
    if (result.error) throw new Error(`Wrangler 登录凭证部署失败：${result.error.message}`)
  }
  if (result.status !== 0) throw new Error(`Cloudflare 部署命令失败，退出码 ${result.status ?? 1}。`)
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function readDeploymentSnapshot(siteUrl, workerUrl) {
  if (process.platform === 'win32') {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$ProgressPreference = 'SilentlyContinue'",
      `$site = Invoke-WebRequest -Uri '${siteUrl}' -UseBasicParsing -TimeoutSec 15`,
      `$worker = Invoke-WebRequest -Uri '${workerUrl}/health' -UseBasicParsing -TimeoutSec 15`,
      `$knowledge = Invoke-WebRequest -Uri '${siteUrl}/data/blog-knowledge.json' -UseBasicParsing -TimeoutSec 15`,
      '[pscustomobject]@{ siteStatus = $site.StatusCode; html = $site.Content; workerStatus = $worker.StatusCode; worker = $worker.Content; knowledgeStatus = $knowledge.StatusCode; knowledge = $knowledge.Content } | ConvertTo-Json -Compress -Depth 6'
    ].join('; ')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 45000,
      maxBuffer: 2 * 1024 * 1024
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'PowerShell 线上核对失败。').trim())
    const payload = JSON.parse(result.stdout.trim())
    return {
      siteStatus: payload.siteStatus,
      html: payload.html,
      workerStatus: payload.workerStatus,
      worker: JSON.parse(payload.worker),
      knowledgeStatus: payload.knowledgeStatus,
      knowledge: JSON.parse(payload.knowledge)
    }
  }

  const [siteResponse, workerResponse, knowledgeResponse] = await Promise.all([
    fetch(siteUrl, { signal: AbortSignal.timeout(15000) }),
    fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(15000) }),
    fetch(`${siteUrl}/data/blog-knowledge.json`, { signal: AbortSignal.timeout(15000) })
  ])
  const [html, worker, knowledge] = await Promise.all([
    siteResponse.text(),
    workerResponse.json(),
    knowledgeResponse.json()
  ])
  return {
    siteStatus: siteResponse.status,
    html,
    workerStatus: workerResponse.status,
    worker,
    knowledgeStatus: knowledgeResponse.status,
    knowledge
  }
}

async function verifyPublishedServices() {
  const siteUrl = 'https://star031104-github-io.pages.dev'
  const workerUrl = 'https://blog-ai-assistant.star20031104.workers.dev'
  const workerConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'worker', 'wrangler.jsonc'), 'utf8'))
  const workerSource = fs.readFileSync(path.join(rootDir, 'worker', 'src', 'index.ts'), 'utf8')
  const expectedWorkerVersion = workerSource.match(/const VERSION = '([^']+)'/)?.[1]
  const assistantAssetVersion = assetHash(path.join(rootDir, 'source'), 'css/assistant-refinement.css')
  if (!assistantAssetVersion) throw new Error('无法计算 AI 助手资源版本。')

  let lastError = '线上服务暂未返回可用内容。'
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const snapshot = await readDeploymentSnapshot(siteUrl, workerUrl)
      if (snapshot.siteStatus !== 200 || snapshot.workerStatus !== 200 || snapshot.knowledgeStatus !== 200) {
        throw new Error(`线上状态码：Pages ${snapshot.siteStatus}、Worker ${snapshot.workerStatus}、知识库 ${snapshot.knowledgeStatus}。`)
      }

      const { html, worker, knowledge } = snapshot
      if (!html.includes('qm-featured-title') || !html.includes(`assistant-refinement.css?v=${assistantAssetVersion}`)) {
        throw new Error('线上首页仍未包含本次首页和 AI 助手资源版本。')
      }
      if (!worker.ok || worker.version !== expectedWorkerVersion || worker.model !== workerConfig.vars.AI_MODEL || worker.provider !== 'siliconflow') {
        throw new Error('线上 AI Worker 的模型或提供方与项目配置不一致。')
      }
      if (!Array.isArray(knowledge) || knowledge.length === 0 || knowledge.some(item => !item.title || !item.url || !item.categories?.length)) {
        throw new Error('线上博客知识库为空或缺少文章分类元数据。')
      }

      console.log(`发布核对通过：博客首页、AI Worker（${worker.model}）和 ${knowledge.length} 个知识片段一致。`)
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt < 9) await delay(3000)
    }
  }
  throw new Error(`Cloudflare 发布后的线上核对未通过：${lastError}`)
}

;(async () => {
  try {
    const workerDir = path.join(rootDir, 'worker')
    console.log('正在预检查 AI Worker…')
    runWrangler(workerDir, ['deploy', '--env=', '--dry-run', '--minify'])
    console.log('正在发布 AI Worker…')
    runWrangler(workerDir, ['deploy', '--env=', '--minify'], true)
    console.log('正在发布博客站点…')
    runWrangler(rootDir, [
      'pages', 'deploy', 'public',
      '--project-name', 'star031104-github-io',
      '--branch', 'main',
      '--commit-dirty=true'
    ], true)
    await verifyPublishedServices()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
})()
