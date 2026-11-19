# Antigravity HTML Preview

一个面向 Google Antigravity 客户端的 UI 扩展插件：打开本地 `.html` / `.htm` 文件时直接在右侧辅助面板展示，**默认进入渲染预览**，支持一键切换 **预览 / 代码** 视图。

## 功能特性

- **默认实时预览**：通过隔离 `iframe` 直接渲染本地 HTML 页面
- **预览 / 代码切换**：顶部一键切换渲染预览与带行号的源码视图，支持一键复制源码
- **文件关联**：通过 `file_extensions: [".html", ".htm"]` 绑定到右侧辅助面板（`SIDECAR_UI_ENTRYPOINT_AUX_PANE`）
- **快捷打开**：自动扫描当前工作区与会话 Artifact 中的 HTML 文件，也支持直接输入或粘贴任意本地 `.html` 路径并刷新

## 目录结构

```text
antigravity-html-preview/
├── plugin.json
├── assets/
│   └── logo.svg
└── sidecars/
    └── html_preview/
        ├── package.json
        ├── sidecar.json
        ├── main.mjs
        └── ui.html
```

## 安装方式

将本仓库克隆到 Antigravity 全局插件目录 `~/.gemini/config/plugins/html-preview`：

```bash
git clone https://github.com/pika-66/antigravity-html-preview.git ~/.gemini/config/plugins/html-preview
```

Windows PowerShell：

```powershell
git clone https://github.com/pika-66/antigravity-html-preview.git "$env:USERPROFILE\.gemini\config\plugins\html-preview"
```

安装后重启 Antigravity 客户端（或在自定义插件管理页重新启用一次）即可生效。
