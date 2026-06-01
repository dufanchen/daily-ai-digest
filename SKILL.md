---
name: daily-ai-digest
description: 每日 AI 资讯追踪 — 自动汇总 AI builders 的 X 推文、顶级 AI 播客、GitHub 热门开源项目（含「前沿思路」新范式项目），生成中英双语 Markdown，帮你第一时间窥见 AI 行业趋势。当用户想要每日 AI 资讯、AI 行业动态、builder 言论、GitHub AI 热门项目、前沿思路追踪，或说「整理一版」「今天的 AI 资讯」「AI digest」「更新咨询」时触发。基于 Zara Zhang 的 follow-builders skill 扩展。无需任何 API key。
---

# Daily AI Digest · 每日 AI 资讯追踪

每天自动汇总 **AI builders 言论 + AI 播客 + GitHub 热门开源项目（含前沿思路）**，
生成一份中英双语 Markdown，帮你窥见 AI 行业趋势、打开用 AI 的思路。

**理念**：follow builders, not influencers —— 只追真正在做产品/做研究的人，不追搬运观点的网红。

**数据线说明**：X 推文 / 播客这条线复用 [Zara Zhang 的 follow-builders](https://github.com/zarazhangrui/follow-builders)
公开中心 feed（无需 key）；GitHub 三路为本 skill 自研抓取（GitHub 官方 API + Trending，匿名无 key）。

---

## 两种用法

### 1. 自动版（cron 每天定时跑，无人值守）

```bash
node scripts/build-daily-md.js
```

- 产出当天 `YYYY-MM-DD.md`，含：X / 播客 / 前沿思路 / AI 新星 / Trending
- 给跨天首次出现的内容打 🆕 标记
- **不含趋势洞察**（纯脚本无 LLM，生成不了深度分析）
- 中文为脚本化对照（真实、无幻觉，但偏直译）

### 2. 手动精读版（用户说「整理一版」时，由你这个 AI 来 remix）

当用户要精读版时，你（AI 助手）应：
1. 跑 `scripts/prepare-digest.js` 拿 X/播客数据，跑 `scripts/fetch-github.js` 拿 GitHub 数据
2. 按下面【整理规则】remix 成中英双语精读版，**额外产出「趋势洞察」**
3. 写入输出目录的当天 md（覆盖自动版）

---

## 📋 整理规则（自动版与精读版都遵循 A/B，精读版额外做趋势洞察）

### A. 通用规则（所有板块）

1. **只 remix，不捏造**：内容必须来自真实抓到的数据。绝不编造推文、项目、star 数或链接。抓不到就不写。
2. **中英双语**：英文原文 + 中文翻译。精读版追求"信达雅"意译，自动版是脚本化对照。
3. **每条都带可点击的原始链接**（推文 / 仓库 / 视频），方便溯源。
4. **🆕 标记**：相比往日首次出现的内容打 🆕。系统维护历史 ID 库
   （`~/.daily-ai-digest/seen-history.json`），推文按 url、GitHub 按仓库全名、播客按 url 判断。
5. **按重要性 / 热度排序**：GitHub 项目按 star 或当日新增 star 排序。

### B. 各板块规则

| 板块 | 规则 |
|---|---|
| **X / Twitter** | 按 builder 分组，挑有信息量的推文（观点、数据、产品动态），跳过纯情绪内容。 |
| **Podcasts 播客** | 取新单集，附标题 + 字幕摘要，精读版提炼核心观点。 |
| **🧠 前沿思路** | 重头戏，按下方【前沿思路总结方案】深度总结。 |
| **🌟 AI 新星** | 近 7 天新建的 AI 项目，简洁列出 + 一句中文说明。 |
| **🔥 GitHub Trending** | 当日趋势榜里的 AI 项目，名称 + 当日新增 star + 一句说明。 |
| **📈 趋势洞察** | 仅精读版有。把当天 builder 言论 + 播客 + GitHub 热项叠在一起，提炼"AI 行业在往哪走"的判断，不是复述而是归纳。 |

### C. 🧠 前沿思路总结方案（精读版的核心，必须遵守）

前沿思路板块不做平铺列表，按以下方案深度总结：

1. **按"它们在解决的根本问题"归类**，而非按 GitHub topic 平铺。
   分类必须**随当天实际抓到的项目动态决定，绝不套固定标签**。
   "让 AI 记住东西 / 让知识变成 AI 能用的网 / 让 AI 自进化"只是举例的常见类别，不是限定；
   若当天冒出"AI 评估、多 agent 协作、可解释性"等新方向，就现场新开对应类别；
   某类只有一个项目就单独讲、不硬凑。分类的变化本身能反映行业注意力的转移。
2. **每个项目用最朴素的大白话讲"思路是什么"**，避免术语堆砌，必要时打比方。
3. **逐项对比区别**：同一类里不同项目的切入点差异要点出来
   （如同样"知识成网"，A 织个人笔记网、B 织工程全景网、C 织交互学习网、D 是底层引擎）。
4. **每类给一句"一句话抓住这类"，最后把几类串起来揭示整体趋势**。

**为什么这样做**：这个每日资讯的目的是"窥见 AI 行业趋势、打开用 AI 的思路"，
纯列表 + 一句话描述满足不了，需要细到讲清不同项目思路的区别。

---

## 配置

抓取关键词在 `scripts/fetch-github.js` 顶部：
- `AI_TOPICS`：AI 新星关键词（`llm / agent / rag / mcp / ai-agent / llmops`），7 天窗口
- `FRONTIER_TOPICS`：前沿思路关键词（`memory / knowledge-graph / second-brain / self-evolving / agent-memory / world-model`），90 天窗口

输出目录优先级：环境变量 `DIGEST_OUTPUT_DIR` > `~/.daily-ai-digest/config.json` 的 `outputDir` > 默认（skill 上一级的 `每日咨询/`）。

详细安装与定时配置见 `README.md`。