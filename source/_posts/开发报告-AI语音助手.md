---
title: 浅梦 AI 助手 Runtime 开发报告：一个本地语音桌面 Agent 的工程化实现
date: 2026-05-19
categories:
    - 开发报告
tags:
  - AI Agent
  - 本地大模型
  - 语音交互
  - RAG
cover: /img/开发报告/2.webp
top_img: /img/开发报告/2.webp
description: 该项目以本地大语言模型为核心，结合 FunASR 语音识别、GPT-SoVITS 语音合成、Search/RAG、Tool Calling、长期记忆、屏幕观察和 Skill Package 工作流，实现了一个可在 Windows 本地运行的个人 AI Agent Runtime。
---


## 1. 项目概述

`AI_voice_assistant` 是一个面向 Windows 本地环境的个人 AI 助手 Runtime。它并不是一个简单的“语音聊天脚本”，而是一个把本地大语言模型、语音识别、语音合成、桌面上下文、网页搜索、RAG、工具调用、长期记忆和 Skill Package 扩展机制整合到一起的桌面 Agent 框架。

从整体定位来看，该项目希望实现的是：

- 以本地大模型为核心的对话能力；
- 通过 FunASR 完成中文语音输入；
- 通过 GPT-SoVITS 完成拟人化语音输出；
- 通过弹窗、桌宠入口、CLI、WebUI 等方式提供多入口交互；
- 通过 Search/RAG 机制增强实时信息获取能力；
- 通过 Tool Registry 和 Skill Package 实现工具调用与任务扩展；
- 通过屏幕观察、浏览器上下文、桌面状态等能力，让助手具备一定的“桌面感知”能力。

如果用一句话概括：

> 这是一个本地可部署、支持语音交互、具备桌面上下文感知、可联网检索、可调用工具、可扩展技能包的个人 AI Agent Runtime。

## 2. 技术栈分析

### 2.1 本地大模型服务

项目默认使用 OpenAI-compatible API 形式访问本地模型服务。配置文件中主模型地址为：

```yaml
llm:
  base_url: "http://127.0.0.1:8000/v1"
  api_key_env: "LOCAL_LLM_API_KEY"
  api_key: "local"
  model: "Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf"
```

这意味着项目本身并不直接加载大模型权重，而是通过本地推理服务访问模型。仓库脚本中主要配套的是 `llama.cpp` 的 `llama-server`。

项目约定了多个模型服务端口：

| 服务 | 默认端口 | 作用 |
| --- | ---: | --- |
| 主对话模型 | 8000 | 负责普通对话、Agent 推理、工具调用决策 |
| 视觉语言模型 | 8001 | 负责屏幕截图或视觉内容理解 |
| Embedding 模型 | 8010 | 负责 RAG 向量召回 |
| Reranker 模型 | 8011 | 负责搜索结果/网页片段重排序 |
| GPT-SoVITS | 9880 | 负责文本转语音 |
| SearXNG | 8080 | 负责本地搜索聚合 |

这种拆分方式的优点是清晰：每个模型服务负责一种能力，Runtime 只负责调用和编排。缺点是启动成本较高，用户需要同时保证多个本地服务可用。

### 2.2 语音输入：FunASR

语音输入部分位于 `app/voice_input`，核心包括：

- `service.py`：语音输入服务入口；
- `voice_input_manager.py`：麦克风采集、VAD、声纹验证、流式识别、最终识别的主流程；
- `asr_engine.py`：FunASR 模型封装；
- `speaker_verifier.py`：声纹验证与声纹档案更新；
- `text_filter.py`：过滤误识别文本；
- `voice_vad.py`：语音活动检测；
- `events.py`：语音服务事件结构。

配置文件 `configs/voice_input.yaml` 中默认使用：

```yaml
stream_model: "paraformer-zh-streaming"
final_model: "paraformer-zh"
punc_model: "ct-punc-c"
vad_model: "fsmn-vad"
```

项目的语音输入并不是简单地“录音然后识别”，而是包含以下流程：

1. 从麦克风采集音频；
2. 进行噪声校准；
3. 使用 VAD 判断是否有人声；
4. 进行声纹验证，判断是不是用户本人；
5. 流式 ASR 输出 partial 文本；
6. 最终 ASR 输出完整文本；
7. 把文本交给 Runtime 的 `SessionRunner`；
8. 等待模型回答后，通过 TTS 输出语音；
9. TTS 播放期间抑制麦克风输入，避免“自说自话”。

这套设计体现了桌面语音助手需要解决的一个关键问题：**语音输入和语音输出会互相干扰**。如果没有 TTS 抑制机制，助手播放自己的回答时，麦克风可能再次捕获声音，导致系统把自己的语音误认为用户输入。

### 2.3 语音输出：GPT-SoVITS

TTS 客户端位于：

```text
app/clients/tts.py
app/streaming/tts_streamer.py
app/audio/player.py
app/audio/tts_gate.py
```

项目通过 HTTP 调用 GPT-SoVITS 的 `/tts` 接口，并支持：

- 参考音频 `ref_audio_path`；
- 文本分段合成；
- 异步合成和分段播放；
- 音频缓存；
- 播放结束后自动清理输出音频；
- TTS 文本净化，避免把 debug 信息、JSON、代码块直接读出来。

配置文件中默认：

```yaml
tts:
  url: "http://127.0.0.1:9880/tts"
  ref_audio_path: "assets/voices/1.wav"
  async_pipeline: true
  segmented_playback: true
```

从工程设计上看，`tts_gate.py` 是一个很实用的模块。因为 Agent 的文本回答可能包含引用、工具调试信息、代码、表格、链接等内容，这些内容适合显示，但不适合直接朗读。因此项目将“屏幕显示文本”和“TTS 朗读文本”拆开处理。

### 2.4 桌面 UI：Popup、CLI 与 WebUI

项目提供多个交互入口：

| 入口 | 文件 | 说明 |
| --- | --- | --- |
| 默认弹窗 | `main.py` → `app.popup.launch` | 默认启动方式，桌面弹窗交互 |
| CLI | `main.py --cli` → `app.cli.main` | 命令行交互 |
| 语音服务 | `main.py --voice` → `app.voice_input.service.main` | 独立语音输入服务 |
| WebUI | `webui.py` → `app.webui.launch` | Gradio Web 界面 |
| 桌宠/启动器 | `app/popup/chat_popup.py` | 与弹窗联动 |

`main.py` 是主入口，逻辑非常清晰：

```python
if "--voice" in args or "voice" in args:
    from app.voice_input.service import main
elif "--cli" in args or "cli" in args or "-c" in args:
    from app.cli import main
else:
    from app.popup import launch
```

这说明项目的入口设计采用“单主入口，多模式分发”的方式，降低了用户使用门槛。

`app/popup/chat_popup.py` 则是桌面端体验的核心文件。它负责：

- 创建 Tkinter 弹窗；
- 初始化 `SessionRunner`；
- 绑定快捷键；
- 启动语音服务子进程；
- 读取语音服务 JSONL 事件；
- 把最终 ASR 文本送入对话流程；
- 显示模型回答；
- 处理屏幕观察、桌面上下文、主动提醒等交互。

WebUI 位于 `app/webui/app.py`，基于 Gradio Blocks 组织界面，包含 Chat、Memory、RAG、Pending、Runtime、Performance、Config、TTS、Logs、Diagnostics、Tasks、Workflow、Screen 等标签页。这更像是开发调试控制台，而不仅仅是聊天页面。

## 3. 项目目录结构分析

项目目录可以按功能分为以下几层：

```text
AI_voice_assistant/
├── main.py                    # 主入口：popup / cli / voice 分发
├── webui.py                   # WebUI 启动入口
├── voice_service.py           # 语音服务独立入口
├── config.yaml                # 主配置，include 多个子配置
├── configs/                   # Agent、RAG、TTS、工具、安全、语音等配置
├── app/
│   ├── agent/                 # Agent 决策、规划、工具调用循环
│   ├── runtime/               # SessionRunner、TTS 状态、pending action
│   ├── tools/                 # 工具注册、工具策略、具体工具实现
│   ├── rag/                   # 网页抓取、chunk、rank、evidence
│   ├── search/                # 搜索计划、深度搜索、查询改写
│   ├── voice_input/           # FunASR、声纹验证、VAD、语音输入服务
│   ├── clients/               # LLM、Embedding、Reranker、TTS 客户端
│   ├── popup/                 # 桌面弹窗
│   ├── webui/                 # Gradio WebUI
│   ├── memory/                # 长期记忆模块
│   ├── skills/                # Skill Package 加载与执行
│   ├── screen/                # 屏幕观察与视觉模型调用
│   ├── desktop_context/       # 桌面上下文获取
│   └── workspace/             # 工作区上下文维护
├── workspace/
│   ├── skills/                # 内置技能包
│   ├── memory/                # USER / PROJECT / TASKS / KNOWLEDGE 等记忆文件
│   └── TOOLS.md               # 工具说明与安全策略说明
├── scripts/                   # 诊断、清理、模型启动、声纹管理脚本
├── data/                      # 缓存、会话、记忆、运行状态
├── logs/                      # 日志
├── profiles/                  # 声纹档案
└── assets/voices/             # TTS 参考音频
```

目录结构体现了几个工程特点：

1. **配置与逻辑分离**：`config.yaml` 只做主入口配置，具体配置被拆到 `configs/`。
2. **Runtime 与 Agent 解耦**：`runtime` 负责单轮会话生命周期，`agent` 负责决策和生成。
3. **工具系统独立**：`tools` 不直接散落在 Agent 中，而是通过注册表统一管理。
4. **RAG 与 Search 分层**：`search` 负责搜索策略，`rag` 负责网页抓取、chunk、排序和证据组织。
5. **Skill Package 独立于代码主干**：`workspace/skills` 中的技能包可以独立增删，不必修改核心代码。

## 4. 核心运行流程

### 4.1 总体流程

可以将项目运行流程抽象为：

```text
用户输入
  ├── 文本输入：Popup / CLI / WebUI
  └── 语音输入：麦克风 → VAD → 声纹验证 → FunASR
        ↓
SessionRunner.run_user_turn()
        ↓
意图路由 Intent Router
        ↓
┌───────────────────────────────┐
│ 1. Direct Tool Fast Path       │  确定性任务：时间、天气、窗口、简单搜索等
│ 2. Skill Workflow Engine       │  命中技能包时执行工作流
│ 3. LLM Agent Loop              │  复杂任务：规划、工具调用、反思、回答
└───────────────────────────────┘
        ↓
Tool Registry 执行工具 / RAG / Memory / Screen / Desktop
        ↓
Final Renderer 生成显示回答和 TTS 回答
        ↓
Popup / CLI / WebUI 显示
        ↓
GPT-SoVITS 语音播放
```

该流程的关键设计是：**所有输入最后都归一到 `SessionRunner.run_user_turn()`**。也就是说，无论用户是打字、语音、WebUI 输入，还是桌面弹窗输入，后续都复用同一套 Runtime。

### 4.2 SessionRunner：单轮会话中枢

`app/runtime/session_runner.py` 是项目的运行中枢。它将一次用户输入封装为一个完整的生命周期：

1. 检查是否是对 pending action 的确认或取消；
2. 记录用户输入；
3. 调用意图路由器判断请求类型；
4. 根据配置决定是否走 Direct Tool Fast Path；
5. 检索长期记忆；
6. 调用 `run_agent()` 执行 Agent 推理；
7. 渲染最终回复；
8. 记录行为记忆；
9. 更新 workspace 智能上下文；
10. 写入会话；
11. 进行记忆门控、分类与存储；
12. 调度或播放 TTS；
13. 返回 `TurnResult`。

`TurnResult` 中包含：

- `reply`：用于显示的回答；
- `tts_reply`：用于语音播放的回答；
- `debug`：调试信息；
- `tool_calls`：工具调用记录；
- `rag_evidence`：RAG 证据；
- `memory_updates`：记忆更新；
- `pending_actions`：待用户确认的操作；
- `perf`：性能统计；
- `tts_status`：TTS 状态。

这个结构说明项目已经把“用户看到的内容”“TTS 朗读的内容”“调试信息”“工具执行过程”做了分离，这对于一个长期运行的桌面助手非常重要。

### 4.3 Intent Router：意图识别与快速路径

`app/agent/intent_router.py` 负责根据用户输入判断请求类型，例如：

- 记忆创建、更新、删除；
- 技能管理；
- 屏幕观察；
- 桌面窗口操作；
- 搜索；
- 天气；
- 系统信息；
- 一般聊天。

对于一些确定性任务，项目会绕过完整的 LLM Agent Loop，直接进入工具快速路径。这样做有两个好处：

1. 减少大模型调用次数，提高响应速度；
2. 降低模型误判工具参数的概率。

例如“现在几点”“查一下天气”“打开观察屏幕”等任务，不一定需要大模型多轮思考，路由器可以直接交给对应工具。

### 4.4 Agent Loop：复杂任务的规划与工具调用

复杂任务会进入 `app/agent/round_runner.py` 中的 `run_agent()`。其逻辑可以概括为：

1. 推断当前话题；
2. 构建上下文；
3. 再次路由意图；
4. 判断是否需要 Direct Tool；
5. 判断是否可以由 Skill Workflow Engine 执行；
6. 如果任务较复杂，生成动态计划；
7. 进入 LLM Action Loop；
8. 解析模型输出的工具调用 JSON；
9. 调用 Tool Registry 执行工具；
10. 观察工具结果；
11. 根据结果反思或重规划；
12. 生成最终回答。

它不是简单的一次性 `chat_completion`，而是一个包含“计划—行动—观察—反思—回答”的 Agent 循环。

配置文件中也限制了 Agent 的复杂度，例如：

```yaml
agent:
  max_steps: 4
  max_tool_calls: 3
  max_tool_retries: 1
```

这可以避免 Agent 在工具调用中无限循环。

## 5. Tool Registry 与安全策略

### 5.1 工具注册机制

项目中的工具系统位于 `app/tools`。核心文件包括：

```text
app/tools/core/schema.py
app/tools/core/registry.py
app/tools/core/policy.py
app/tools/core/aliases.py
app/tools/defaults.py
configs/tools.yaml
```

工具注册大致包含以下信息：

- 工具名称；
- 工具描述；
- 参数 schema；
- 执行函数 handler；
- 风险等级；
- 是否默认启用；
- 是否允许模型可见；
- 是否需要用户确认；
- 超时时间；
- 输出长度限制。

`ToolRegistry` 的职责不仅是“调用工具”，还包括：

- 判断工具是否启用；
- 判断模型是否可见；
- 修复或校验工具参数；
- 应用工具别名；
- 判断是否需要用户确认；
- 处理高风险操作；
- 控制工具超时；
- 压缩工具结果；
- 记录工具调用日志。

### 5.2 工具安全策略

`configs/tools.yaml` 中配置了工具权限。项目将工具分为低风险、中风险、高风险，并对高风险工具要求用户确认。

例如：

- 文件写入、文件编辑、补丁应用需要确认；
- 任务删除需要确认；
- 命令执行默认禁用；
- 消息发送默认禁用；
- `code_execution` 默认禁用；
- 屏幕观察需要显式开启；
- 私密数据清理脚本独立提供。

`app/tools/runtime/runtime_tools.py` 中的命令执行工具使用 `subprocess.run(..., shell=True)`，这本身是高风险设计。但项目通过如下方式降低风险：

1. 工具默认禁用；
2. 风险等级为 high；
3. 默认需要用户确认；
4. 不在常规模型可见工具中暴露。

如果二次开发时要启用命令执行，建议进一步加入：

- 命令白名单；
- 工作目录限制；
- 最大输出限制；
- 禁止网络敏感命令；
- 禁止删除类命令；
- 沙箱执行环境；
- 对执行命令进行二次确认展示。

## 6. Search 与 RAG 机制分析

### 6.1 搜索入口

搜索统一入口位于：

```text
app/search/engine.py
app/tools/search/__init__.py
```

项目没有保留多个分散的搜索工具，而是提供统一 `search` 工具。这个工具内部支持：

- Query rewriting；
- 搜索计划；
- SearXNG；
- DDGS；
- 网页抓取；
- 文档分块；
- BM25；
- Embedding；
- Reranker；
- 证据质量判断；
- 二次搜索；
- 回答缓存。

这是该项目比较工程化的部分。它不是把搜索结果 snippet 直接丢给模型，而是尽量构建“可引用、可排序、可判断质量”的证据链。

### 6.2 RAG 数据流

RAG 过程大致如下：

```text
用户问题
  ↓
查询改写 / 查询包生成
  ↓
SearXNG / DDGS 获取候选 URL
  ↓
网页抓取
  ↓
正文抽取与清洗
  ↓
文本分块
  ↓
BM25 初筛
  ↓
Embedding 向量召回
  ↓
Reranker 重排序
  ↓
证据质量判断
  ↓
必要时二次搜索
  ↓
将证据格式化加入 Prompt
  ↓
模型基于证据生成回答
```

其中 `app/rag/ranker.py` 是排序核心。它会综合：

- BM25 分数；
- Embedding 相似度；
- Reranker 分数；
- 来源质量；
- 片段质量；
- snippet 惩罚；
- 证据多样性。

最终会给证据分配类似 `S1`、`S2` 的来源编号，再交给模型。

### 6.3 搜索设计优点

该搜索系统的优点是：

1. **层次清晰**：搜索发现 URL，RAG 负责证据加工。
2. **具备降级能力**：Embedding 或 Reranker 不可用时，可回退到 BM25。
3. **避免纯 snippet 回答**：通过网页抓取和 chunk 提高证据质量。
4. **支持二次搜索**：当证据不足时继续补充。
5. **支持缓存**：降低重复搜索成本。

### 6.4 搜索设计不足

可能的问题包括：

1. 依赖外部网络和搜索服务，稳定性受环境影响；
2. SearXNG、DDGS、Embedding、Reranker 任一服务异常都可能影响效果；
3. 网页抓取不支持复杂 JS 渲染页面；
4. 证据质量判断仍可能受模型能力影响；
5. 缓存策略需要注意过期时间，避免回答过时信息。

## 7. Memory 长期记忆模块

长期记忆模块位于：

```text
app/memory/
workspace/memory/
data/memory/
```

主要文件包括：

- `manager.py`：记忆读写；
- `classifier.py`：记忆分类；
- `gate.py`：记忆写入门控；
- `conflict_resolver.py`：冲突处理；
- `metadata_generator.py`：记忆元数据生成；
- `memory_router.py`：记忆相关意图路由。

从配置看，项目支持：

```yaml
runtime:
  enable_memory: true
  memory_update_mode: "agent_gate"
```

这表示它不会盲目把所有聊天内容写进长期记忆，而是经过门控和分类后再写入。

工作区中还存在结构化记忆文件：

```text
workspace/memory/USER.md
workspace/memory/PROJECT.md
workspace/memory/TASKS.md
workspace/memory/KNOWLEDGE.md
```

这种设计适合桌面助手长期使用：

- `USER.md` 保存用户偏好；
- `PROJECT.md` 保存当前项目背景；
- `TASKS.md` 保存任务状态；
- `KNOWLEDGE.md` 保存长期知识。

不过，记忆系统也带来隐私风险。发布博客或开源示例时，应清理 `data/memory`、`workspace/memory`、`logs`、`data/sessions` 等目录，避免泄露真实聊天内容。

## 8. Skill Package 机制

Skill Package 是项目很重要的扩展机制。目录位于：

```text
workspace/skills/
```

本次源码中包含多个内置 Skill，例如：

- `blog_writer`：博客写作；
- `browser_video`：浏览器视频相关；
- `github_research`：GitHub 项目研究；
- `gptsovits`：语音合成相关；
- `healthcheck`：系统健康检查；
- `local_llm`：本地模型；
- `memory`：记忆管理；
- `model_deployment`：模型部署；
- `openclaw`：OpenClaw 集成；
- `paper_assistant`：论文助手；
- `planning`：任务规划；
- `ppt_master`：PPT 生成相关；
- `project_refactor`：项目重构；
- `rag_search`：RAG 搜索；
- `screen_observer`：屏幕观察；
- `search`：搜索；
- `summarize`：总结；
- `tts`：语音输出；
- `weather`：天气；
- `workspace`：工作区管理。

每个 Skill 一般可以包含：

```text
SKILL.md
workflow.yaml
scripts/
assets/
```

`app/skills/loader.py` 负责读取 Skill 元信息；`app/skills/selector.py` 负责根据用户意图选择合适 Skill；`app/skills/executor.py` 负责执行工作流。

Skill 工作流支持：

- 图结构工作流；
- 并行工具调用；
- 子工作流；
- 条件分支；
- 运行状态持久化；
- 中断后恢复；
- 用户确认后继续执行。

这说明项目并不满足于“LLM 随机决定调用哪个工具”，而是希望通过可配置工作流，把常见任务变成可复用、可维护的技能包。

## 9. 屏幕观察与桌面上下文

屏幕观察相关代码位于：

```text
app/screen/
app/desktop_context/
app/browser_context/
```

配置文件 `configs/screen.yaml` 中可以看到：

- 屏幕能力默认启用；
- 视觉模型 VLM 默认可配置；
- 截图缓存位于 `data/cache/screen`；
- 保留最近若干张截图；
- 屏幕观察需要显式开启；
- 默认不自动保存调试截图；
- 敏感文本可做脱敏；
- 禁止自动发送消息。

这部分设计非常重要。桌面 Agent 一旦具备屏幕感知，就可能接触聊天窗口、网页、文件路径、账号信息等敏感内容。因此项目在配置上提供了隐私保护策略：显式启动、限制缓存、脱敏、禁止自动发送消息。

从功能上看，屏幕模块主要支持：

1. 截图；
2. 窗口信息读取；
3. 屏幕状态缓存；
4. 调用 VLM 分析屏幕内容；
5. 主动观察与状态解释。

这让助手可以回答类似：

- “你看看我现在屏幕上这个报错是什么意思？”
- “帮我总结当前网页内容。”
- “我现在打开的是哪个应用？”

但实际使用时，需要谨慎控制权限和日志保存。

## 10. 配置系统设计

项目配置入口为 `config.yaml`，并通过 `include_configs` 引入多个子配置：

```yaml
include_configs:
  - configs/agent.yaml
  - configs/memory.yaml
  - configs/workspace.yaml
  - configs/environment.yaml
  - configs/skills.yaml
  - configs/tts.yaml
  - configs/rag.yaml
  - configs/tools.yaml
  - configs/screen.yaml
  - configs/voice_input.yaml
```

`app/config.py` 中实现了配置加载逻辑：

1. 读取主配置；
2. 读取 `include_configs`；
3. 深度合并 include 配置；
4. 再用主配置覆盖 include 配置；
5. 创建运行目录；
6. 提供 `get_config()`、`get_llm_api_key()` 等接口。

这种配置拆分方式的优点是：

- 不同能力独立配置，便于维护；
- 主配置保留全局覆盖能力；
- 适合本地用户按需打开/关闭能力；
- 便于排查问题。

潜在问题是：当前 `get_llm_api_key()` 的逻辑中，内联 `api_key` 优先于环境变量。对于纯本地模型这没有问题，因为 `api_key: local` 只是占位；但如果未来接入真实远程 API，更推荐环境变量优先，或者移除配置文件中的明文 key。

## 11. 部署流程

以下流程适合在博客中作为“复现指南”。

### 11.1 环境准备

推荐环境：

- Windows 10 / Windows 11；
- Python 3.10 或 3.11；
- NVIDIA GPU；
- CUDA 可用；
- 本地 `llama.cpp`；
- FunASR / ModelScope；
- GPT-SoVITS；
- 可选：SearXNG、Embedding 模型、Reranker 模型。

### 11.2 获取项目

```bash
git clone https://github.com/star031104/AI_voice_assistant.git
cd AI_voice_assistant
```

或者直接解压项目压缩包。

### 11.3 创建 Python 环境

```bash
conda create -n ai_voice_assistant python=3.10 -y
conda activate ai_voice_assistant
pip install -r requirements.txt
```

如果某些音频库在 Windows 下安装失败，可以优先检查：

- `sounddevice`；
- `pyaudio` 或系统音频依赖；
- `playsound`；
- `torch` CUDA 版本；
- ModelScope/FunASR 依赖。

### 11.4 启动本地大模型服务

项目提供了 `scripts/local_models/` 下的 `.bat` 脚本。使用前需要修改：

- `llama.cpp` 路径；
- GGUF 模型文件路径；
- GPU offload 参数；
- 上下文长度；
- 线程数；
- host 与 port。

示例逻辑如下：

```bash
llama-server \
  -m path/to/model.gguf \
  --host 127.0.0.1 \
  --port 8000 \
  -c 8192 \
  -t 10 \
  -ngl 99 \
  --jinja
```

如果只是个人本机使用，建议优先绑定：

```bash
--host 127.0.0.1
```

不要随意使用 `0.0.0.0`，否则同一局域网内的其他设备可能访问你的模型服务。

### 11.5 启动 GPT-SoVITS

确保 GPT-SoVITS 的 HTTP 服务监听：

```text
http://127.0.0.1:9880/tts
```

然后在 `configs/tts.yaml` 中检查：

```yaml
url: "http://127.0.0.1:9880/tts"
ref_audio_path: "assets/voices/1.wav"
```

### 11.6 配置搜索与 RAG

如果要使用搜索/RAG，建议启动或配置：

- SearXNG：`http://127.0.0.1:8080`；
- Embedding 服务：`http://127.0.0.1:8010/v1`；
- Reranker 服务：`http://127.0.0.1:8011/v1`。

如果暂时不启动这些服务，项目仍可部分运行，但搜索质量和 RAG 效果会下降。

### 11.7 启动项目

默认弹窗模式：

```bash
python main.py
```

CLI 模式：

```bash
python main.py --cli
```

语音服务模式：

```bash
python main.py --voice
```

WebUI 模式：

```bash
python webui.py
```

### 11.8 运行诊断

项目提供了多个诊断脚本：

```bash
python scripts/doctor.py
python scripts/check_local_search_stack.py
python scripts/check_tool_policy.py
```

建议部署后优先执行这些脚本，检查：

- 配置是否正确；
- 搜索服务是否可用；
- LLM 端口是否可用；
- 工具策略是否符合预期；
- RAG 依赖是否完整。

## 12. 代码质量评价

### 12.1 优点

#### 1. 架构拆分较清晰

项目将 Agent、Runtime、Tools、RAG、Voice、TTS、Memory、Skill、Screen 等模块拆开，避免了所有逻辑堆在一个脚本中。

#### 2. 多入口统一到同一 Runtime

Popup、CLI、WebUI、Voice 最终都进入 `SessionRunner`，这让核心逻辑复用度较高。

#### 3. 工具系统有安全意识

高风险工具不是直接暴露给模型，而是通过策略文件控制，并且需要用户确认。

#### 4. Search/RAG 设计比较完整

具备搜索计划、查询改写、网页抓取、分块、BM25、Embedding、Reranker、证据质量判断和二次搜索，不是简单搜索 API 拼接。

#### 5. 语音链路考虑了真实使用问题

项目考虑了 VAD、声纹验证、TTS 抑制、barge-in、流式 partial、最终识别等问题，这些都是语音助手从 Demo 走向可用所必须解决的问题。

#### 6. Skill Package 具备扩展潜力

把常见任务封装为技能包，可以减少核心代码膨胀，也便于后续新增“博客写作”“论文助手”“PPT 生成”等能力。

### 12.2 不足

#### 1. 部署链路较重

完整运行需要 LLM、VLM、Embedding、Reranker、GPT-SoVITS、SearXNG、FunASR 等多个组件，对新手不友好。

#### 2. 脚本中存在本地硬编码路径

`scripts/local_models/*.bat` 中包含本地模型路径和 llama.cpp 路径。其他用户部署时必须手动修改。

#### 3. 自动化测试不足

本次源码中未发现独立 `tests/` 测试目录。虽然 `compileall` 可以通过，但仍建议补充单元测试和集成测试。

#### 4. 命令执行工具需要更严格保护

虽然命令执行工具默认禁用且需要确认，但如果未来启用，建议增加白名单、沙箱、危险命令拦截。

#### 5. 配置文件中的模型名不适合公开演示

默认模型名包含 `Uncensored` 和 `Aggressive`，博客发布时建议说明这是本地实验模型，并建议生产或公开演示换成更稳妥的对齐模型。

#### 6. 隐私数据清理必须重视

桌面上下文、屏幕观察、语音输入、聊天日志、长期记忆都可能包含隐私信息。发布项目截图、日志、压缩包前应执行清理。

## 13. 推荐改进路线

### 13.1 第一阶段：提升可部署性

- 提供 `.env.example`；
- 提供 `config.example.yaml`；
- 将本地硬编码路径改为环境变量；
- 提供一键检查脚本；
- 将模型服务启动命令改成模板形式；
- README 中增加“最小启动模式”。

建议最小启动模式只依赖：

```text
Python Runtime + 主 LLM + CLI
```

然后再逐步开启：

```text
TTS → Voice Input → Search/RAG → Screen → Skill Workflow
```

### 13.2 第二阶段：补充测试体系

建议新增：

```text
tests/
├── test_config_loader.py
├── test_intent_router.py
├── test_tool_policy.py
├── test_tool_aliases.py
├── test_tts_gate.py
├── test_search_fallback.py
├── test_memory_gate.py
└── test_skill_loader.py
```

重点测试：

- 配置合并是否正确；
- 工具策略优先级是否正确；
- 高风险工具是否被拦截；
- TTS 是否过滤 debug 文本；
- 搜索依赖缺失时是否能降级；
- Skill 是否能正确加载；
- 记忆是否不会误写入。

### 13.3 第三阶段：提升安全性

建议：

- 命令执行工具加入命令白名单；
- 文件操作限制到 workspace；
- 屏幕观察增加醒目状态提示；
- 日志默认脱敏；
- 远程 API key 必须走环境变量；
- 模型服务默认绑定 `127.0.0.1`；
- 提供“隐私清理模式”。

### 13.4 第四阶段：优化用户体验

可以继续改进：

- 首次启动向导；
- 模型服务状态面板；
- 麦克风设备选择 UI；
- 声纹注册向导；
- TTS 参考音频管理；
- Skill Package 可视化管理；
- RAG 搜索过程可视化；
- 工具确认弹窗优化。
