---
title: Qwen 本地部署记录
date: 2026-05-07
updated: 2026-09-14 12:00:00
categories:
  - 技术文档
tags:
  - Qwen
  - llama.cpp
  - 本地大模型
  - CUDA
cover: /img/generated-covers/qwen-local-image25.webp
top_img: /img/generated-covers/qwen-local-image25.webp
description: 在 RTX 4060 Laptop 上使用 llama.cpp 部署 Qwen GGUF 模型：从 CUDA 编译、模型选择到启动参数与显存取舍。
---

相比在线 API，本地模型最大的吸引力不是“免费”，而是数据留在本机、参数可控、服务接口稳定，并且能够直接接入自己的 Agent 与自动化系统。

这次使用 `llama.cpp + Qwen GGUF + RTX 4060 Laptop` 搭建本地推理服务。下面保留我的设备与参数记录，同时把显存、上下文和网络暴露这些容易忽略的取舍说清楚。

## 一、设备与目标

| 项目 | 配置 |
| --- | --- |
| 设备 | Honor MagicBook Pro 16 |
| GPU | RTX 4060 Laptop，8 GB 显存 |
| 系统 | Windows 11 / WSL2 Ubuntu 22.04 |
| 推理框架 | llama.cpp |
| 模型格式 | GGUF |

我的目标不是追求最大参数量，而是在有限显存下获得稳定的中文问答和本地 API。8 GB 显存更适合较小模型或较低量化；运行 27B 量级模型通常需要部分 CPU 卸载，速度和上下文长度都要做取舍。

## 二、为什么选择 Qwen 与 llama.cpp

Qwen 的中文表达、技术问答和 GGUF 生态比较适合本地使用。llama.cpp 则提供 CUDA 加速、量化模型支持、命令行工具和 OpenAI 兼容服务接口，既能直接聊天，也能作为其他程序的模型后端。

这套组合的优势是依赖相对克制、部署方式多、参数透明；代价是需要自己处理模型量化、显存预算、提示模板与服务安全。

## 三、编译 CUDA 版本

```bash
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release -j 8
```

Windows 使用 Visual Studio 工具链时，需要安装“使用 C++ 的桌面开发”、CMake 工具、MSVC 与 Windows SDK，并从 Developer PowerShell 运行编译命令。

构建完成后，先确认 `llama-cli` 或 `llama-server` 位于 `build/bin` 对应的配置目录中。项目更新较快，实际可执行文件路径应以当前构建输出为准。

## 四、选择模型与量化

GGUF 文件名中的 `Q4`、`Q5` 等通常代表量化精度和体积等级。量化越低，显存与内存压力通常越小，但模型质量也可能下降。

我的测试模型包括 `Q4_K_M` 与 `Q5_K_M`。选择时不能只看文件能否装进显存，还要为 KV Cache、上下文和运行开销留空间。建议先从较短上下文启动，再观察实际占用：

```bash
nvidia-smi
```

如果启动时已经接近显存上限，应减少 GPU 层数或上下文，而不是等待运行中随机报错。

## 五、启动本地服务

Windows 下可以先用一行命令减少转义问题：

```powershell
llama-server.exe -m Qwen3.5-27B-Q4_K_M.gguf --n-gpu-layers 99 --ctx-size 8192 --threads 22 --host 127.0.0.1 --port 8000
```

常用参数含义：

| 参数 | 作用 | 调整建议 |
| --- | --- | --- |
| `-m` | GGUF 模型路径 | 使用绝对路径可减少工作目录问题 |
| `--n-gpu-layers` | 尝试卸载到 GPU 的层数 | 显存不足时逐步降低 |
| `--ctx-size` | 上下文长度 | 越大越占 KV Cache |
| `--threads` | CPU 推理线程 | 不必机械等于全部逻辑线程 |
| `--host` | 监听地址 | 仅本机使用时绑定 `127.0.0.1` |
| `--port` | 服务端口 | 与调用端配置保持一致 |

`99` 表示尽量卸载更多层，并不保证 27B 模型能完整驻留在 8 GB 显存中。最终应以启动日志、生成速度和显存占用为准。

## 六、验证服务

先检查健康状态：

```bash
curl http://127.0.0.1:8000/health
```

再调用 OpenAI 兼容接口：

```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"local","messages":[{"role":"user","content":"用三句话解释本地模型的优势"}]}'
```

如果其他 Agent 能调用接口但返回异常，优先检查模型的 chat template、上下文预算与请求格式，而不是只调整温度。

## 七、思考模式与生成速度

部分 Qwen 模型或提示模板支持思考开关。是否可用、参数名称如何，应以对应模型卡和当前 llama.cpp 模板为准。我的使用场景更偏向日常问答和工具调用，因此通常关闭长思考，以减少首字延迟和 token 消耗。

如果当前模板支持，可以尝试：

```bash
--chat-template-kwargs "{\"enable_thinking\":false}"
```

这不是所有 Qwen GGUF 的通用保证；启动日志和一次实际请求比参数是否被接受更有参考价值。

## 八、常见问题

### CUDA 未启用

确认使用 CUDA 构建、运行的确实是新生成的二进制，并检查日志中是否识别 GPU。若 `nvcc` 不可用或 CMake 没有启用 `GGML_CUDA`，程序仍可能以 CPU 方式运行。

### Visual Studio 编译失败

`No CMAKE_ASM_COMPILER could be found` 一类错误通常与 C++ 工作负载、MSVC、Windows SDK 或终端环境有关。补齐组件后，清理旧的 `build` 目录再重新配置。

### 显存不足或速度过慢

依次尝试降低上下文、降低 GPU 层数、改用更小量化或更小模型。盲目追求参数量，往往会让交互体验比一个更小但能完整加速的模型更差。

## 九、结论

这套部署已经可以满足中文问答、本地开发和 Agent 后端的基本需要。真正决定体验的不是某一个启动参数，而是模型规模、量化、GPU 卸载、上下文与响应速度之间的平衡。

相关资料：[llama.cpp 项目](https://github.com/ggml-org/llama.cpp) · [CUDA 构建说明](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md) · [llama-server 使用说明](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
