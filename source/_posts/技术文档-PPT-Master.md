---
title: PPT-Master
date: 2026-05-09 23:30:00
categories:
  - AI工具
cover: /img/技术文档.png
top_img: /img/index.png
description: 从项目原理、系统架构、SVG 渲染、DrawingML 到 Windows 本地部署，完整解析 PPT-Master 技术实现与运行流程
---

# PPT-Master

# 一、项目介绍

随着大语言模型的发展，AI 自动生成 PPT 已经成为一种非常热门的应用方向。

传统 AI PPT 工具虽然可以快速生成内容，但大多数都存在一个问题：

## “生成后无法继续编辑”

很多工具最终导出的：

- 实际上只是截图
- 或者整页图片
- 无法修改布局
- 无法编辑图形
- 无法继续二次设计

而 PPT-Master 最大的特点：

就是：

# “生成真正可编辑的 PPT”

项目地址：

https://github.com/hugohe3/ppt-master

# 二、PPT-Master 能干什么？

PPT-Master 本质上：

是一个：

```text
LLM + SVG + PowerPoint DrawingML
```

组合而成的 AI PPT 自动生成系统。

它不仅能：

- 自动生成 PPT 内容
- 自动设计页面布局
- 自动生成图表
- 自动生成 SVG 页面

还可以：

# 将 SVG 转换为真正可编辑的 PPTX 文件

最终生成的 PPT：

支持：

- 文本编辑
- 图形编辑
- 元素拖动
- 配色修改
- 动画
- 转场

而不是单纯的图片。

# 三、项目核心原理

很多人以为：

PPT-Master 是：

```text
AI → 直接生成 PPT
```

实际上并不是。

真正流程：

```text
Prompt
 ↓
LLM 生成内容
 ↓
HTML / SVG 页面
 ↓
SVG 渲染
 ↓
svg_to_pptx.py
 ↓
DrawingML
 ↓
PPTX
```

# 四、什么是 SVG？

SVG：

全称：

```text
Scalable Vector Graphics
```

即：

# 矢量图形

与普通 PNG/JPG 最大区别：

## SVG 是“图形描述”

例如：

```xml
<rect x="0" y="0" width="100" height="100"/>
```

表示：

绘制一个矩形。

因此：

SVG：

- 可以无限缩放
- 不失真
- 元素独立
- 更适合转换为 PPT 图形

# 五、为什么 SVG 非常适合 PPT？

因为：

PPT 本质上：

也是：

```text
矢量图形系统
```

所以：

SVG 与 PowerPoint：

天然兼容。

# 六、什么是 DrawingML？

这是 PPT-Master 最关键的技术之一。

DrawingML：

是：

```text
Microsoft Office 的图形描述语言
```

即：

PPT 中：

所有：

- 文字
- 图形
- 线条
- 形状

本质上：

都是 DrawingML。

# 七、为什么很多 AI PPT 无法编辑？

因为：

它们：

实际上：

只是：

```text
截图 → 放进 PPT
```

例如：

```text
PNG
JPG
Canvas 截图
```

所以：

无法：

- 修改单独文字
- 修改图形
- 修改布局

# 八、PPT-Master 为什么能编辑？

因为：

它：

不是插图片。

而是：

```text
SVG → DrawingML → PowerPoint Shape
```

因此：

生成的是：

真正 Office 原生元素。

# 九、项目适合什么场景？

PPT-Master 非常适合：

## 1. 学术场景

例如：

- 论文汇报
- 毕设答辩
- 研究生开题
- 技术演示

## 2. 企业场景

例如：

- 产品汇报
- 周报
- 商业演示
- 数据分析

## 3. AI Agent 自动办公

例如：

```text
OpenClaw
+
Qwen
+
PPT-Master
```

自动：

```text
读取数据
↓
总结内容
↓
生成 PPT
↓
导出汇报
```

# 十、下载项目

## Git Clone

```bash
git clone https://github.com/hugohe3/ppt-master.git
```

## 或下载 ZIP

GitHub：

```text
Code
↓
Download ZIP
```

# 十一、创建 Conda 环境

推荐：

单独创建环境。

## 创建环境

```bash
conda create -n pptmaster python=3.10
```

## 激活环境

```bash
conda activate pptmaster
```

# 十二、安装项目依赖

进入项目目录：

```bash
cd ppt-master
```

安装依赖：

```bash
pip install -r requirements.txt
```

## 国内推荐清华源

```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

# 十三、如何修改 PPT 风格？

这是很多人最关心的问题。

# 方法 1：修改模板

项目中：

```text
templates/
```

目录：

控制：

- 字体
- 配色
- 页面布局
- 标题样式

# 方法 2：Prompt 控制风格

例如：

```text
生成科技感学术 PPT：

要求：
- 深蓝配色
- 极简风格
- 卡片式布局
- 动态感图形
```

# 方法 3：模仿论文风格

甚至可以：

上传论文截图。

让 AI：

模仿：

- 配色
- 字体
- 图表
- 布局

# 十四、如何接入 API？

PPT-Master 本质：

是：

```text
LLM + SVG + PPT
```

因此：

支持：

- OpenAI
- DeepSeek
- Qwen
- Claude
- Ollama
- llama.cpp

# 十五、如何提高生成质量？

# 1. 使用更强模型

推荐：

- GPT-4.1
- Claude
- Qwen3
- DeepSeek

# 2. 强化 Prompt

例如：

```text
生成 Apple 发布会风格 PPT：
- 极简白色背景
- 大标题
- 超大留白
- 动态渐变
```

# 3. 使用参考图片

上传：

- PPT
- 论文
- UI 截图

让 AI：

模仿风格。

# 十六、项目最大优点

最大的优点：

# “真正适合二次编辑”

这是很多 AI PPT：

做不到的。

# 十七、适合什么人？

非常适合：

- 学生
- 毕设
- 研究生
- AI 开发者
- 企业演示
- 自动办公

# 十八、未来玩法

我现在正在尝试：

```text
OpenClaw
+
Qwen
+
PPT-Master
```

实现：

```text
自动读取内容
↓
自动总结
↓
自动生成 PPT
↓
自动导出
```

# 十九、总结

PPT-Master 并不是：

普通 AI PPT 工具。

它更像：

```text
AI
+
SVG 渲染系统
+
DrawingML
+
Office 自动化
```

构成的一整套：

# AI 自动演示文稿生成系统

其真正强大的地方：

不是：

“一键生成”。

而是：

# “生成后还能继续编辑”

这一点：

对于：

- 毕设
- 学术汇报
- 企业 PPT

都非常重要。

### [PPT-Master 保姆教程，如何在 windows 系统下安装使用及如何配置生图模型](https://www.bilibili.com/video/BV1g59CB3Esj?vd_source=1ca5bb8c4551fd6e13f5aa490c154a33)