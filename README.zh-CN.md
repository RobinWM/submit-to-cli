# submit-to-cli

一键提交 URL 到 [aidirs.org](https://aidirs.org) 和 [backlinkdirs.com](https://backlinkdirs.com) 的命令行工具。

## 安装

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/RobinWM/submit-to-cli/main/install.sh)
```

或从源码安装：

```bash
git clone https://github.com/RobinWM/submit-to-cli.git
cd submit-to-cli
bash install.sh
```

## 登录

> **注意：** 提交 URL 需要订阅计划。

```bash
submit-to-cli login
```

选择站点 → 自动打开浏览器 → 在浏览器里完成登录 → Token 自动保存。
如果还没有 API Token，系统会自动创建一个（名为 "CLI Token"）。

## 使用

### 提交 URL
```bash
submit-to-cli submit https://example.com
```

### 预览（不产生记录）
```bash
submit-to-cli fetch https://example.com
```

### 查看帮助
```bash
submit-to-cli --help
```

## 命令

| 命令 | 说明 |
|------|------|
| `login` | 浏览器授权登录（支持 aidirs.org 和 backlinkdirs.com） |
| `submit <url>` | 提交 URL 到 aidirs |
| `fetch <url>` | 预览网站元数据，不产生提交记录 |
| `--help` | 显示帮助 |

## 配置文件

`~/.config/submit-to-cli/config.json`

```json
{
  "DIRS_TOKEN": "your-token-here",
  "DIRS_BASE_URL": "https://aidirs.org"
}
```

## 环境变量

配置文件优先，环境变量作为备用：

```bash
export DIRS_TOKEN="your-token-here"
export DIRS_BASE_URL="https://aidirs.org"
submit-to-cli submit https://example.com
```
