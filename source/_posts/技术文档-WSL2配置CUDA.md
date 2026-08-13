---
title: WSL2 CUDA 配置记录
date: 2026-05-07
categories:
  - 技术文档
tags:
  - WSL2
  - CUDA
  - GPU
  - Windows
cover: /img/covers/wsl2-cuda.webp
top_img: /img/covers/wsl2-cuda.webp
description: Windows + WSL2 下配置 CUDA 与 GPU 加速环境的完整记录。
---


最近很多本地 AI 工具都开始依赖：

```text
Linux + CUDA
```

环境。

所以后面开始正式折腾：

```text
Windows + WSL2 + CUDA
```

这一套环境。

## 一、为什么使用 WSL2

相比虚拟机：

WSL2 最大的优点是：

- 更轻量
- GPU 支持更好
- Linux 兼容性强
- 开发方便

现在很多：

- OpenClaw
- Docker
- AI Agent
- Python 环境

都更适合 Linux。

## 二、安装 WSL2

管理员 PowerShell：

```powershell
wsl --install
```

安装完成后：

```powershell
wsl -l -v
```

查看版本。

## 三、安装 Ubuntu

安装：

```text
Ubuntu 22.04
```

作为主要开发环境。

## 四、检查 GPU

进入 WSL：

```bash
nvidia-smi
```

如果正常：

会显示 GPU 信息。

## 五、安装 CUDA Toolkit

下载：

```text
CUDA Toolkit
```

然后安装：

```bash
sudo apt install nvidia-cuda-toolkit
```

## 六、Python 环境

后面主要使用：

```text
conda
```

管理环境。

创建：

```bash
conda create -n llm python=3.11
```

## 七、PyTorch GPU 测试

测试：

```python
import torch

print(torch.cuda.is_available())
```

输出：

```text
True
```

说明 CUDA 正常。

## 八、遇到的问题

### 1. localhost 代理问题

WSL NAT 模式下：

```text
localhost 代理不互通
```

导致：

很多工具无法直接走代理。

后面需要：

- 手动设置 IP
- 或桥接模式

### 2. CUDA 版本不匹配

有时候：

- 驱动版本
- CUDA Toolkit
- PyTorch CUDA

版本不一致。

会导致：

```text
CUDA unavailable
```

## 九、实际效果

配置完成后：

目前已经能够正常：

- 跑 llama.cpp
- 跑 PyTorch
- 跑 OpenClaw
- 使用 GPU 推理

整体体验比 Windows 原生稳定很多。

## 十、总结

WSL2 现在已经基本成为：

Windows 本地 AI 开发的核心环境之一。

尤其：

- CUDA
- Docker
- Python
- Agent

这一整套生态。

在 Linux 下体验明显更完整。
