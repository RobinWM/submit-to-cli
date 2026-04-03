# ship

一键提交 URL 到 [aidirs.org](https://aidirs.org) 和 [backlinkdirs.com](https://backlinkdirs.com) 的命令行工具。

## 安装

**优选：** 通过 npm 安装，最快也最方便后续升级。

### npm 安装

```bash
npm install -g @brenn/ship
```

安装后运行：

```bash
ship --help
```

### 备选：macOS / Linux / WSL 安装脚本

```bash
curl -fsSL https://raw.githubusercontent.com/RobinWM/ship-cli/main/install.sh | bash
```

### 备选：Windows PowerShell 安装脚本

```powershell
irm https://raw.githubusercontent.com/RobinWM/ship-cli/main/install.ps1 | iex
```

### 备选：Windows CMD 安装脚本

```cmd
curl -fsSL https://raw.githubusercontent.com/RobinWM/ship-cli/main/install.cmd -o install.cmd && install.cmd && del install.cmd
```

或从源码安装：

```bash
git clone https://github.com/RobinWM/ship-cli.git
cd ship-cli
bash install.sh
```

## 登录

> **注意：** 提交 URL 需要订阅计划。

```bash
ship login
```

也可以显式指定站点：

```bash
ship login --site aidirs.org
ship login --site backlinkdirs.com
```

选择站点 → 自动打开浏览器 → 在浏览器里完成登录 → Token 会按站点自动保存。
如果还没有 API Token，系统会自动创建一个。

## 使用

### 提交 URL
```bash
ship submit https://example.com
ship submit https://example.com --site backlinkdirs.com
ship submit https://example.com --json
ship submit https://example.com --quiet
```

### 预览（不产生记录）
```bash
ship fetch https://example.com
ship fetch https://example.com --site aidirs.org
ship fetch https://example.com --json
```

### 查看帮助
```bash
ship --help
```

## 命令

| 命令 | 说明 |
|------|------|
| `login` | 浏览器授权登录（支持 aidirs.org 和 backlinkdirs.com） |
| `submit <url>` | 提交 URL 到当前选中的站点 |
| `fetch <url>` | 预览网站元数据，不产生提交记录 |
| `--json` | 输出机器可读 JSON |
| `--quiet` | 只输出响应内容 |
| `--help` | 显示帮助 |

## 配置文件

`~/.config/ship/config.json`

```json
{
  "currentSite": "aidirs.org",
  "sites": {
    "aidirs.org": {
      "token": "your-token-here",
      "baseUrl": "https://aidirs.org"
    },
    "backlinkdirs.com": {
      "token": "your-other-token",
      "baseUrl": "https://backlinkdirs.com"
    }
  }
}
```

旧版单站点配置会在下次使用/登录时自动兼容读取。

## 环境变量

多站点场景下，**推荐使用配置文件**。

环境变量仍然可用，但更适合作为**当前命令的单站点覆盖/兜底方案**：

```bash
export DIRS_TOKEN="your-token-here"
export DIRS_BASE_URL="https://aidirs.org"
ship submit https://example.com
```

使用环境变量时，`DIRS_TOKEN` 会应用到 `DIRS_BASE_URL` 指向的站点（如果未提供 `DIRS_BASE_URL`，则落到默认站点）。如果需要长期管理多个站点，建议使用 `ship login`，把 token 按站点写入配置文件。

## 开发

```bash
npm install
npm run build
npm test
```

## 发布到 npm

```bash
npm login
npm run build
npm test
npm pack --dry-run
npm publish
```

发布时通过 `package.json` 的 `files` 字段控制内容，npm 包会包含 `dist/` 构建产物。

GitHub Release 预期会发布这些资产：
- `ship-linux-x64`
- `ship-linux-arm64`
- `ship-darwin-x64`
- `ship-darwin-arm64`
- `ship-windows-x64.exe`
- `ship-latest.tgz`
