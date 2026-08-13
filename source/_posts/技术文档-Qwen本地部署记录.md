---
title: Qwen 本地部署记录
date: 2026-05-07
categories:
  - 技术文档
tags:
  - Qwen
  - llama.cpp
  - 本地大模型
  - CUDA
cover: /img/covers/qwen-local.webp
top_img: /img/covers/qwen-local.webp
description: 基于 llama.cpp 在 RTX4060 Laptop 上部署 Qwen 本地大模型的完整记录。
---


最近开始正式折腾本地大模型。

相比直接使用在线 API，本地部署最大的优点其实是：

- 隐私可控
- 不受网络限制
- 响应速度稳定
- 可以自由改参数
- 能接各种 Agent 系统

这次主要使用：

```text
Qwen + llama.cpp + RTX4060 Laptop
```

进行本地部署。

## 一、设备环境

目前使用的设备：

- Honor MagicBook Pro 16
- RTX 4060 Laptop GPU（8GB）
- Windows 11
- WSL2 Ubuntu 22.04

## 二、为什么选择 Qwen

一开始其实对比过很多模型：

- DeepSeek
- Llama
- Mistral
- Qwen

最后还是选择了 Qwen。

主要原因：

### 1. 中文能力强

Qwen 的中文表现确实很好。

尤其：

- 长文本
- 中文逻辑
- 技术问题

明显比很多模型更自然。

### 2. 本地部署生态成熟

目前：

- GGUF
- llama.cpp
- Ollama

对 Qwen 支持都很好。

部署方便很多。

### 3. 参数规模适合 4060 Laptop

因为只有 8GB 显存。

所以：

- 70B 基本不现实
- 32B 边缘可跑
- 14B / 7B 更舒服

后面主要使用：

```text
Qwen3.5-27B-Q4_K_M.gguf
```

进行测试。

## 三、部署 llama.cpp

### 1. 克隆项目

```bash
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
```

### 2. 编译 CUDA 版本

使用：

```bash
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release
```

## 四、踩过的坑

### 1. CUDA 找不到

最开始：

```text
nvcc not found
```

后面发现：

CUDA 没正确配置环境变量。

### 2. Visual Studio 编译问题

还遇到：

```text
No CMAKE_ASM_COMPILER could be found
```

后来安装：

- Desktop development with C++
- MSVC
- Windows SDK

才正常。

## 五、模型下载

模型使用：

```text
Qwen3.5-27B-GGUF
```

下载：

- Q4_K_M
- Q5_K_M

两个量化版本。

## 六、启动参数

目前最常用：

```bash
llama-server ^
-m Qwen3.5-27B-Q4_K_M.gguf ^
-ngl 99 ^
-c 8192 ^
-t 22 ^
--host 0.0.0.0 ^
--port 8000
```

## 七、参数说明

### 1. ngl

GPU 层数。

```text
-ngl 99
```

代表尽量全部放 GPU。

### 2. c

上下文长度。

```text
-c 8192
```

代表：

8K 上下文。

### 3. t

CPU 线程数。

```text
-t 22
```

对应 CPU 线程数量。

## 八、关闭思考模式

后面发现：

Qwen 思考模式虽然强。

但：

- 输出慢
- token 消耗大
- 有时太啰嗦

后面默认关闭：

```bash
--chat-template-kwargs "{\"enable_thinking\":false}"
```

## 九、实际体验

目前：

- 日常聊天没问题
- 技术问答效果很好
- 中文体验优秀

但：

27B 在 8GB 显存下：

还是有一定压力。
