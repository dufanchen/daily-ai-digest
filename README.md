# daily-ai-digest · 每日 AI 资讯追踪 skill

每天自动汇总 **AI builders 言论 + AI 播客 + GitHub 热门开源项目（含前沿思路 + Vibe Coding 灵感）
+ Hacker News Show HN + Product Hunt 新品 + Hugging Face Daily Papers**，
生成一份中英双语 Markdown，帮你第一时间窥见 AI 行业趋势、给自己的 vibe coding 找灵感。

**两类核心目标**：
- **① 有设计理念的 AI 框架/工具** → 看「🧠 前沿思路」「🌟 AI 新星」「🔥 Trending」「📄 HF Papers」
- **② Vibe Coding 项目灵感** → 看「🛠️ Vibe Coding 灵感」「🚀 Product Hunt」「🟧 Show HN」

> 数据线说明：
> - X 推文 / 播客 / 博客复用 [Zara Zhang 的 follow-builders](https://github.com/zarazhangrui/follow-builders) 公开中心 feed
> - GitHub 四路（前沿/Vibe/新星/Trending）+ Show HN / Product Hunt / HF Papers 为本 skill 自研抓取
> - **全程无需任何 API key。**

> ⚠️ 关于"信息一致性"：资讯类内容是**活数据**——同一天、同样的源，不同人跑结果一致；
> 但隔天再跑内容会刷新（这正是它的价值）。所以"装了就和你拿到一样的信息"成立于"同一天同源"，
> 而非"永远复现某一天的快照"。要留存某天结果，请保存生成的 `YYYY-MM-DD.md` 文件本身。

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
├── SKILL.md              # skill 入口：触发词 + 整理规则 + 前沿/Vibe 总结方案
├── README.md             # 本文件：安装与使用
├── config.example.json   # 配置示例（输出目录、时区）
└── scripts/
    ├── prepare-digest.js # 拉 follow-builders 中心 feed（X/播客/博客），无 key
    ├── fetch-github.js   # 抓 GitHub 四路（前沿/Vibe/新星/Trending），匿名无 key
    ├── fetch-extra.js    # 抓 Show HN（HN Algolia API）/ Product Hunt（Atom）/ HF Papers，无 key
    └── build-daily-md.js # 合并三路数据 + 🆕 去重 + 组装当天 md
```

---

## 每日 md 有哪几块

| 板块 | 内容 | 更新频率 |
|---|---|---|
| X / Twitter | AI builder 新推文 | 每天 |
| Official Blogs 官方博客 | AI 公司工程博客新文 | 有新文才有 |
| Podcasts 播客 | 顶级 AI 播客新单集 + 字幕摘要 | 有新单集才有 |
| 🧠 前沿思路 | 记忆 / 知识图谱 / 第二大脑 / 自进化 等新范式（目标①） | 慢（90 天窗口） |
| 🛠️ Vibe Coding 灵感 | 独立开发者成品型小项目 / boilerplate / AI 套壳（目标②） | 30 天窗口滚动 |
| 🌟 AI 新星 | 近 7 天创建的 AI 项目（star 排序） | 每天滚动 |
| 🔥 GitHub Trending | 当日趋势榜里的 AI 项目 | 每天 |
| 🟧 Hacker News · Show HN | 开发者首发的小项目（点赞过线） | 每天 |
| 🚀 Product Hunt | 当日上线新品（AI / 独立开发者作品） | 每天 |
| 📄 HF Daily Papers | Hugging Face 当日精选论文 | 每天（需能访问 huggingface.co） |
| 📈 趋势洞察 | 结合言论 + 热项的趋势点评 | 仅精读版有 |

---

## 自定义关注方向

编辑 `scripts/fetch-github.js` 顶部：
- `AI_TOPICS`：AI 新星关键词（默认 `llm / agent / rag / mcp / ai-agent / llmops`）
- `FRONTIER_TOPICS`：前沿思路关键词（默认 `memory / knowledge-graph / second-brain / self-evolving / agent-memory / world-model`）
- `VIBE_TOPICS`：Vibe Coding 关键词（默认 `vibe-coding / ai-app / saas-boilerplate / nextjs / side-project / indie-hacker`，30 天窗口 + star ≥ 30）

编辑 `scripts/fetch-extra.js` 顶部：
- `HN_MIN_POINTS`：Show HN 帖子点赞下限（默认 10）
- `PRODUCT_HUNT_LIMIT` / `HF_PAPERS_LIMIT`：各源条数上限

> 还想手动刷的高信噪比渠道（脚本抓不稳，建议收藏）见 `SKILL.md` 末尾的「手动渠道清单」：
> star-history / trendshift、awesome 列表 commit、Latent Space / Simon Willison newsletter、
> v0.dev / Cursor Directory / bolt.new gallery、Indie Hackers 等。

---

## 常见问题

- **偶发 403**：GitHub 匿名 Search API 有限流，个别关键词某次抓取可能报 403，脚本已容错（单个失败不影响其他），下次跑会恢复。
- **🆕 标记没出现**：第一次跑时历史库为空，所有项都会标 🆕；第二天起只标新出现的。历史库在 `~/.daily-ai-digest/seen-history.json`。
- **X/播客是空的**：可能是 follow-builders 中心 feed 暂时不可达，其他板块不受影响。该数据线依赖第三方仓库 [follow-builders](https://github.com/zarazhangrui/follow-builders) 存活，若其下线/改结构，这条线会失效，GitHub / Show HN / Product Hunt 三路不受影响。
- **📄 HF Papers 板块空白**：Hugging Face Papers 需要能直连 `huggingface.co`。若你的网络无法访问该域名，此板块自动留空、不报错、不影响其他源；网络恢复后自动有数据。
- **🛠️ Vibe / 🚀 Product Hunt / 🟧 Show HN 没内容**：当天确实没命中过线项目时会自动隐藏该板块（属正常）。可调低 `fetch-extra.js` 的 `HN_MIN_POINTS` 或 `fetch-github.js` 的 vibe star 阈值放宽。

---

致谢：X / 播客数据线基于 [Zara Zhang](https://github.com/zarazhangrui) 的开源 skill
[follow-builders](https://github.com/zarazhangrui/follow-builders)。
