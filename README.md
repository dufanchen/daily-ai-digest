# daily-ai-digest · 每日 AI 资讯追踪 skill

每天自动汇总 **AI builders 言论 + AI 播客 + GitHub 热门开源项目（含前沿思路）**，
生成一份中英双语 Markdown，帮你第一时间窥见 AI 行业趋势。

> 数据线说明：X 推文 / 播客复用 [Zara Zhang 的 follow-builders](https://github.com/zarazhangrui/follow-builders)
> 公开中心 feed；GitHub 三路为本 skill 自研抓取。**全程无需任何 API key。**

---

## 前置要求

- **Node.js 18+**（脚本用了原生 `fetch`，18 以下不支持）。`node -v` 检查。

---

## 安装（3 步）

### 1. 把 skill 放到你的 skills 目录

把整个 `daily-ai-digest/` 文件夹拷到你的 agent skills 目录，例如 Claude Code：

```bash
cp -r daily-ai-digest ~/.claude/skills/
```

> 也可以放任意位置，只要脚本能用 `node` 跑即可。

### 2. 配置输出目录（可选，三选一）

每天的 md 存到哪，按以下优先级决定：

- **方式 A（推荐）环境变量**：
  ```bash
  export DIGEST_OUTPUT_DIR="/你的/目标/文件夹"
  ```
- **方式 B 配置文件**：把 `config.example.json` 复制为 `~/.daily-ai-digest/config.json` 并改 `outputDir`：
  ```bash
  mkdir -p ~/.daily-ai-digest
  cp config.example.json ~/.daily-ai-digest/config.json
  # 然后编辑 outputDir 为你的绝对路径
  ```
- **方式 C 默认**：不配则存到 skill 上一级的 `每日咨询/` 文件夹。

### 3. 先手动跑一次验证

```bash
node ~/.claude/skills/daily-ai-digest/scripts/build-daily-md.js
```

成功会打印 `Saved daily digest: .../YYYY-MM-DD.md (new items: N)`。

---

## 设置每天自动运行（cron）

```bash
crontab -e
```

加一行（每天 10:30 跑，**node 必须用绝对路径**，cron 没有 nvm 的 PATH）：

```cron
30 10 * * * /绝对路径/node /绝对路径/daily-ai-digest/scripts/build-daily-md.js >> ~/.daily-ai-digest/cron.log 2>&1
```

- 用 `which node` 查 node 绝对路径
- 若用环境变量配输出目录，在命令前加 `DIGEST_OUTPUT_DIR=/你的/路径 `
- 日志看 `~/.daily-ai-digest/cron.log`

> macOS 注意：cron 往某些目录（如桌面）写文件需要权限，若没生成，去
> 「系统设置 → 隐私与安全性 → 完全磁盘访问权限」把 `/usr/sbin/cron` 加进去。

---

## 要带「趋势洞察」的精读版？

自动版是纯脚本（无 LLM），只做结构化清单。
想要**双语 remix + 前沿思路深度对比 + 趋势洞察**的精读版，
对你的 AI 助手（装了本 skill）说一句「**整理一版**」即可。
AI 会按 `SKILL.md` 里的【整理规则】实时生成。

---

## 目录结构

```
daily-ai-digest/
├── SKILL.md              # skill 入口：触发词 + 整理规则 + 前沿思路总结方案
├── README.md             # 本文件：安装与使用
├── config.example.json   # 配置示例（输出目录、时区）
└── scripts/
    ├── prepare-digest.js # 拉 follow-builders 中心 feed（X/播客/博客），无 key
    ├── fetch-github.js   # 抓 GitHub 三路（前沿/新星/Trending），匿名无 key
    └── build-daily-md.js # 合并两路数据 + 🆕 去重 + 组装当天 md
```

---

## 每日 md 有哪几块

| 板块 | 内容 | 更新频率 |
|---|---|---|
| X / Twitter | AI builder 新推文 | 每天 |
| Podcasts 播客 | 顶级 AI 播客新单集 + 字幕摘要 | 有新单集才有 |
| 🧠 前沿思路 | 记忆 / 知识图谱 / 第二大脑 / 自进化 等新范式 | 慢（90 天窗口） |
| 🌟 AI 新星 | 近 7 天创建的 AI 项目（star 排序） | 每天滚动 |
| 🔥 GitHub Trending | 当日趋势榜里的 AI 项目 | 每天 |
| 📈 趋势洞察 | 结合言论 + 热项的趋势点评 | 仅精读版有 |

---

## 自定义关注方向

编辑 `scripts/fetch-github.js` 顶部：
- `AI_TOPICS`：AI 新星关键词（默认 `llm / agent / rag / mcp / ai-agent / llmops`）
- `FRONTIER_TOPICS`：前沿思路关键词（默认 `memory / knowledge-graph / second-brain / self-evolving / agent-memory / world-model`）

---

## 常见问题

- **偶发 403**：GitHub 匿名 Search API 有限流，个别关键词某次抓取可能报 403，脚本已容错（单个失败不影响其他），下次跑会恢复。
- **🆕 标记没出现**：第一次跑时历史库为空，所有项都会标 🆕；第二天起只标新出现的。历史库在 `~/.daily-ai-digest/seen-history.json`。
- **X/播客是空的**：可能是 follow-builders 中心 feed 暂时不可达，GitHub 板块不受影响。

---

致谢：X / 播客数据线基于 [Zara Zhang](https://github.com/zarazhangrui) 的开源 skill
[follow-builders](https://github.com/zarazhangrui/follow-builders)。
