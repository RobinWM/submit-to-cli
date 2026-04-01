---
name: submit-to-cli
description:
  A CLI tool wrapping the aidirs.org submission API. Use when the user needs to submit a URL to aidirs or preview
  site metadata via the CLI. Supports three commands: login (store credentials), submit (send URL), and fetch
  (preview without submitting).
---

# submit-to-cli

## Overview

`submit-to-cli` 封装 aidirs.org 的提交 API，提供三个命令：

- `login` — 交互式存储 API Token 和 Base URL
- `submit <url>` — 提交 URL 到 aidirs
- `fetch <url>` — 仅获取/预览网站元数据，不提交

凭证默认存储在 `~/.config/submit-to-cli/config.json`。

## Workflow

### 1. Login — 配置凭证

```bash
submit-to-cli login
```

交互式提示输入：

- **Base URL**：aidirs 实例地址，如 `https://aidirs.org`
- **API Token**：32 位小写 hex 格式的 Bearer Token

凭证保存到 `~/.config/submit-to-cli/config.json`。

也可通过环境变量覆盖：

- `DIRS_BASE_URL`
- `DIRS_TOKEN`

### 2. Submit — 提交 URL

```bash
submit-to-cli submit <url>
```

示例：

```bash
submit-to-cli submit https://example.com
```

内部调用：

```http
POST /api/submit
Authorization: Bearer <token>
Content-Type: application/json

{ "link": "https://example.com" }
```

成功响应包含 `status: "success"`、`id` 和 `nextPath`。

常见错误：

| 状态码 | 含义 |
|--------|------|
| 400 | link 参数缺失或格式错误、重复站点 |
| 401 | Token 无效或未授权 |
| 500 | 服务器错误 |

### 3. Fetch — 预览元数据

```bash
submit-to-cli fetch <url>
```

仅调用 `POST /api/fetch-website` 获取网站元数据，不创建提交记录。返回 AI 抓取的站点信息（标题、描述、图片等）。

## Scripts

如需在其他脚本中调用，使用环境变量：

```bash
export DIRS_BASE_URL="https://aidirs.org"
export DIRS_TOKEN="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
submit-to-cli submit https://example.com
```

## Environment / Config Reference

| 来源 | 键 | 说明 |
|------|----|------|
| 环境变量 | `DIRS_BASE_URL` | API Base URL（优先级最高） |
| 环境变量 | `DIRS_TOKEN` | Bearer Token |
| 配置文件 | `~/.config/submit-to-cli/config.json` | 本地存储的凭证 |
| CLI 默认 | Base URL | `https://aidirs.org` |
| CLI 默认 | Token | 需通过 login 或环境变量提供 |

配置文件格式：

```json
{
  "DIRS_BASE_URL": "https://aidirs.org",
  "DIRS_TOKEN": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```
