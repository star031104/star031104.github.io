---
title: 技术文档
date: 2026-05-07 12:00:00
top_img: /img/index.webp
description: 本地大模型、Windows、WSL2、CUDA 与 AI 工具的部署教程和工程实践记录。
---

从本地模型到工程工具链，这里整理可复现的配置记录、操作步骤和问题排查。

<div class="docs-grid">

  <div class="docs-section">
  <h2>本地 AI 与模型</h2>
  <p>从模型选择、GGUF 格式到 llama.cpp 启动参数，记录本地推理的实际取舍。</p>

  <a href="/2026/05/07/qwen-local-deployment/" class="docs-item">
      Qwen 本地部署记录 <span>部署实践 · RTX 4060 Laptop</span>
  </a>
  </div>

  <div class="docs-section">
  <h2>Windows 与 GPU 开发环境</h2>
  <p>围绕 WSL2、CUDA、NVIDIA 驱动与 PyTorch 验证，减少环境配置中的反复试错。</p>

  <a href="/2026/05/07/wsl2-cuda-setup/" class="docs-item">
      WSL2 CUDA 配置记录 <span>Windows 11 · CUDA · PyTorch</span>
  </a>
  </div>

  <div class="docs-section">
  <h2>生成式演示与文件格式</h2>
  <p>聚焦 SVG、DrawingML 与 PowerPoint 的可编辑对象，而非只生成静态页面。</p>

  <a href="/2026/05/09/ppt-master-svg-to-pptx/" class="docs-item">
      PPT-Master：从 SVG 到可编辑 PowerPoint <span>SVG · DrawingML · PPTX</span>
  </a>
  </div>

</div>

<div class="docs-footer-note">
  <strong>阅读建议</strong>
  <span>环境类文章按步骤操作前，请先核对系统、驱动和依赖版本；模型部署参数也会随硬件与后端版本变化。</span>
  <a href="/reports/">想了解这些工具如何组合成完整产品？查看开发报告 →</a>
</div>
