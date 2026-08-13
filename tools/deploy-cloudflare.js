'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

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

const wranglerArgs = [
  '--yes',
  'wrangler@4.120.0',
  'pages',
  'deploy',
  'public',
  '--project-name',
  'star031104-github-io',
  '--branch',
  'main',
  '--commit-dirty=true'
]
const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx'
const commandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npx', ...wranglerArgs]
  : wranglerArgs
const result = spawnSync(executable, commandArgs, {
  cwd: rootDir,
  env: {
    ...process.env,
    CLOUDFLARE_API_TOKEN: token,
    CLOUDFLARE_ACCOUNT_ID: accountId
  },
  stdio: 'inherit'
})

if (result.error) {
  console.error(`Cloudflare 部署启动失败：${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
