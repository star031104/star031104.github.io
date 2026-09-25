---
title: WSL2 CUDA 配置记录
date: 2026-05-07
updated: 2026-09-14 12:00:00
categories:
  - 技术文档
tags:
  - WSL2
  - CUDA
  - GPU
  - Windows
cover: /img/generated-covers/wsl2-cuda-image25.webp
top_img: /img/generated-covers/wsl2-cuda-image25.webp
description: Windows 11 与 WSL2 下配置 NVIDIA CUDA 开发环境：安装顺序、GPU 验证、PyTorch 测试和常见故障排查。
---

很多本地 AI 工具天然以 Linux 为第一运行环境，但我的日常设备仍然是 Windows。WSL2 刚好提供了一条折中路径：保留 Windows 桌面体验，同时获得 Linux、Docker、Python 和 CUDA 工具链。

这篇文章记录一套更稳妥的安装顺序，并特别说明最容易踩坑的一点：**WSL2 使用 Windows 宿主机提供的 NVIDIA 驱动映射，不应在 WSL 内再次安装 Linux 显卡驱动。**

## 一、最终环境

```text
Windows 11
└─ WSL2
   └─ Ubuntu 22.04
      ├─ NVIDIA CUDA
      ├─ Python / Conda
      ├─ PyTorch
      └─ llama.cpp / AI Agent
```

适合这套方案的场景包括本地模型推理、CUDA 开发、Docker 服务和需要 Linux 依赖的 Agent 项目。如果只是运行一个已有的 Windows 程序，则未必需要额外引入 WSL2。

## 二、安装并更新 WSL2

在管理员 PowerShell 中执行：

```powershell
wsl --install
wsl --update
```

重启后检查发行版和虚拟化版本：

```powershell
wsl --list --verbose
```

目标是让 Ubuntu 的 `VERSION` 显示为 `2`。如果仍是 WSL1，可以执行：

```powershell
wsl --set-version Ubuntu-22.04 2
```

## 三、先在 Windows 安装 NVIDIA 驱动

CUDA on WSL 的驱动来自 Windows。先在宿主机安装与显卡兼容的 NVIDIA 驱动，再进入 Ubuntu 验证：

```bash
nvidia-smi
```

只要命令能看到 GPU、驱动版本和显存信息，说明 WSL 已经获得计算设备访问权限。

> 不要在 WSL 中安装 `cuda-drivers` 或 Linux NVIDIA 显示驱动。这样可能覆盖 WSL 的驱动映射，反而让 CUDA 失效。

## 四、按需要安装 CUDA Toolkit

如果只运行带有 CUDA 运行时的预编译软件，通常不必安装完整 Toolkit；只有需要 `nvcc`、编译 CUDA 项目或构建 CUDA 版 llama.cpp 时才需要安装。

应按照 NVIDIA 的 WSL-Ubuntu 安装页面配置仓库，并选择仅包含工具链的包，例如：

```bash
sudo apt update
sudo apt install cuda-toolkit-12-x
```

其中 `12-x` 要替换成当前仓库提供且与你的项目兼容的版本。不要在 WSL2 中选择会连带安装 Linux 驱动的 `cuda`、`cuda-12-x` 或 `cuda-drivers` 元包。

安装后验证：

```bash
nvcc --version
nvidia-smi
```

`nvidia-smi` 展示的是驱动支持能力，`nvcc --version` 展示的是本地编译工具链版本，两者数字不完全一致并不一定代表故障。

## 五、建立独立 Python 环境

我习惯用 Conda 隔离本地 AI 项目：

```bash
conda create -n llm python=3.11
conda activate llm
```

安装 PyTorch 时，应从官方安装选择器复制与当前 CUDA 运行时匹配的命令。完成后执行最小验证：

```python
import torch

print("CUDA available:", torch.cuda.is_available())
print("Device:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")
print("PyTorch CUDA:", torch.version.cuda)
```

只有 `torch.cuda.is_available()` 返回 `True`，并且设备名称正确，才算 Python 侧的链路真正打通。

## 六、进一步验证计算链路

仅能运行 `nvidia-smi` 还不够，最好再做一次实际张量计算：

```python
import torch

x = torch.randn(4096, 4096, device="cuda")
y = x @ x
print(y.shape, y.device)
```

同时可以在另一个终端运行：

```bash
watch -n 1 nvidia-smi
```

如果计算时能看到显存与 GPU 利用率变化，说明从 Windows 驱动、WSL2 到 PyTorch 的完整路径已经工作。

## 七、常见问题

### 1. WSL 内看不到 GPU

按顺序检查：Windows NVIDIA 驱动是否正常、WSL 是否已更新、发行版是否运行在 WSL2，以及系统重启后 `nvidia-smi` 是否可用。不要先通过安装 Linux 驱动“碰运气”。

### 2. CUDA 版本不匹配

区分三个概念：Windows 驱动支持的 CUDA 上限、WSL 中的 Toolkit 版本、PyTorch 自带或需要的 CUDA 运行时。排障时分别记录它们，而不是只看一个“CUDA 版本”。

### 3. localhost 与代理不通

WSL 网络模式和代理软件配置会影响宿主机与 Linux 子系统的互访。先用 `curl` 测试目标地址，再根据实际网络模式设置宿主机 IP、`HTTP_PROXY`、`HTTPS_PROXY` 和 `NO_PROXY`。本地模型服务如果只供本机使用，应优先绑定 `127.0.0.1`，不要无意暴露到局域网。

### 4. 重启后环境变量失效

把确实需要的路径写入 `~/.bashrc` 或对应 shell 配置，并避免同时保留多套互相冲突的 CUDA 路径。修改后重新打开终端，再检查 `which nvcc` 和 `nvcc --version`。

## 八、我的使用结果

配置完成后，这套环境可以稳定承担 llama.cpp、PyTorch、Docker 与本地 Agent 项目的开发和推理。它的价值不只是“让 GPU 能用”，而是让 Windows 上的 AI 开发获得一套更接近 Linux 生产环境的工具链。

## 九、检查清单

- `wsl --list --verbose` 显示目标发行版为 WSL2；
- Windows 和 WSL 中的 `nvidia-smi` 均能识别显卡；
- 需要编译时，`nvcc --version` 正常；
- Python 环境彼此隔离；
- PyTorch 能创建 CUDA 张量并完成实际计算；
- 本地服务没有无意绑定到公网或局域网地址。

相关资料：[Microsoft WSL 安装说明](https://learn.microsoft.com/windows/wsl/install) · [NVIDIA CUDA on WSL 指南](https://docs.nvidia.com/cuda/wsl-user-guide/)
