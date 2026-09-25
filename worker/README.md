# 浅梦博客 AI Worker

这是博客 AI 助手的可部署后端。它负责请求校验、博客知识检索、提示词组装、模型调用、流式输出、来源返回、限流与脱敏日志。

## 默认架构

```text
浏览器组件
  → POST /v1/chat
  → 请求校验与会话限流
  → 拉取并缓存 blog-knowledge.json
  → 中文友好的 BM25 混合检索
  → 智谱官方 GLM-4.7-Flash 生成
  → SSE：meta / token / done
```

生产和预发布环境当前直连智谱官方 API：

- 接口：`https://api.siliconflow.cn/v1/chat/completions`
- 模型：`Qwen/Qwen3-8B`
- 密钥：Cloudflare Secret `AI_API_KEY`

`AI_API_URL` 和 `AI_MODEL` 是可公开的非敏感配置；硅基流动密钥只能通过 `SILICONFLOW_API_KEY` Wrangler Secret 或本地 `.dev.vars` 提供，不能提交到仓库。清空 `AI_API_URL` 后，后端仍可回退到代码允许列表中的 Workers AI 模型。

## 本地验证

在仓库根目录运行：

```bash
npm install
npm test
npm run deploy:ai:dry
```

本地启动 Worker：

```bash
npm run dev:ai
```

真实问答会直接调用智谱官方接口。纯单元测试和 dry-run 不会调用模型。

## 接口

健康检查：

```http
GET /health
```

问答：

```json
{
  "type": "chat",
  "sessionId": "浏览器生成的匿名会话标识",
  "message": "Qwen 本地部署需要注意什么？",
  "history": [
    { "role": "user", "content": "上一篇文章讲了什么？" },
    { "role": "assistant", "content": "……" }
  ],
  "stream": true
}
```

文章总结使用 `type: "summary"`，并传入 `content`、`title`、`url`。

流式响应事件：

- `meta`：请求 ID 和检索来源；
- `token`：增量回答文本；
- `done`：生成结束；
- `error`：流中断及可展示错误码。

设置 `stream: false` 时返回 JSON：

```json
{
  "answer": "……",
  "sources": [
    { "index": 1, "title": "文章标题", "heading": "章节", "url": "/文章地址/", "score": 3.2 }
  ],
  "requestId": "……"
}
```

## 部署顺序

1. 先运行 `npm --workspace worker run deploy:staging` 部署 staging Worker 并做真实问答验证。
2. 备份当前生产 Worker 的代码与变量。
3. 部署生产 Worker；检查 `/health`、CORS、问答、总结、引用和 429 响应。
4. 最后部署博客前端。

生产部署命令：

```bash
npm --workspace worker run deploy
```

首次部署或轮换智谱密钥时，生产与预发布环境要分别设置 Secret：

```bash
cd worker
npx wrangler secret put AI_API_KEY
npx wrangler secret put AI_API_KEY --env staging
```

密钥来自智谱开放平台的 API Keys 页面。不要把密钥写进 `wrangler.jsonc`、源码或维护文档。

## 运行保护

- 请求体最多 96 KiB；问题最多 1000 字；文章正文最多 30,000 字；
- 每个匿名浏览器会话每分钟最多 12 次请求；
- 知识库最多读取 2 MiB，并在边缘缓存；
- 无检索证据时不调用模型，直接提示资料不足；
- 日志不记录提问正文、文章正文或访问密钥；
- CORS 仅允许 `ALLOWED_ORIGINS` 中的站点。

会话 ID 只能减少正常客户端的误用，不能代替预算保护。生产环境仍建议在 Cloudflare 上配置账户级告警、AI 用量预算，以及针对异常流量的 WAF 规则。
