---
name: daily-ai-digest
description: 每日 AI 资讯追踪 — 自动汇总 AI builders 的 X 推文、顶级 AI 播客、GitHub 热门开源项目（含「前沿思路」新范式项目 + 「Vibe Coding 灵感」成品型小项目）、Hacker News Show HN、Product Hunt 每日新品、Hugging Face Daily Papers，生成中英双语 Markdown，帮你第一时间窥见 AI 行业趋势、给自己的 vibe coding 找灵感。当用户想要每日 AI 资讯、AI 行业动态、builder 言论、GitHub AI 热门项目、前沿思路追踪、vibe coding 灵感、Show HN、Product Hunt，或说「整理一版」「今天的 AI 资讯」「AI digest」「更新咨询」时触发。基于 Zara Zhang 的 follow-builders skill 扩展。无需任何 API key。
---

# Daily AI Digest · 每日 AI 资讯追踪

每天自动汇总 **AI builders 言论 + AI 播客 + GitHub 热门开源项目（含前沿思路 + Vibe Coding 灵感）
+ Hacker News Show HN + Product Hunt 新品 + Hugging Face Papers**，
生成一份中英双语 Markdown，帮你窥见 AI 行业趋势、打开用 AI 的思路、给自己的 vibe coding 找灵感。

**理念**：follow builders, not influencers —— 只追真正在做产品/做研究的人，不追搬运观点的网红。

**两类核心目标**（对应用户的两条收集线）：
- **① 有设计理念的 AI 框架/工具** → 看「🧠 前沿思路」「🌟 AI 新星」「🔥 Trending」「📄 HF Papers」
- **② Vibe Coding 项目灵感** → 看「🛠️ Vibe Coding 灵感」「🚀 Product Hunt」「🟧 Show HN」

**数据线说明**：
- X 推文 / 播客 / 博客复用 [Zara Zhang 的 follow-builders](https://github.com/zarazhangrui/follow-builders) 公开中心 feed（无需 key）
- GitHub 四路（前沿思路 / Vibe / AI 新星 / Trending）为本 skill 自研抓取（GitHub 官方 API + Trending，匿名无 key）
- Show HN / Product Hunt / HF Papers 由 `fetch-extra.js` 抓取（HN Algolia API + PH Atom feed + HF 页面，均无 key）

---

## 两种用法

### 1. 自动版（cron 每天定时跑，无人值守）

```bash
node scripts/build-daily-md.js
```

- 产出当天 `YYYY-MM-DD.md`，含：X / 博客 / 播客 / 前沿思路 / Vibe Coding / AI 新星 / Trending / Show HN / Product Hunt / HF Papers
- 给跨天首次出现的内容打 🆕 标记
- **不含趋势洞察**（纯脚本无 LLM，生成不了深度分析）
- 中文为脚本化对照（真实、无幻觉，但偏直译）

### 2. 手动精读版（用户说「整理一版」时，由你这个 AI 来 remix）

当用户要精读版时，你（AI 助手）应：
1. 跑 `scripts/prepare-digest.js` 拿 X/播客数据，跑 `scripts/fetch-github.js` 拿 GitHub 数据，跑 `scripts/fetch-extra.js` 拿 Show HN / Product Hunt / HF Papers 数据
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
| **🧠 前沿思路** | 重头戏（对应目标①），按下方【前沿思路总结方案】深度总结。 |
| **🛠️ Vibe Coding 灵感** | 对应目标②，按下方【Vibe Coding 总结方案】总结：突出"这个产品 vibe 出了什么、可借鉴的玩法"。 |
| **🌟 AI 新星** | 近 7 天新建的 AI 项目，简洁列出 + 一句中文说明。 |
| **🔥 GitHub Trending** | 当日趋势榜里的 AI 项目，名称 + 当日新增 star + 一句说明。 |
| **🟧 Hacker News · Show HN** | 开发者首发的小项目，挑点赞高、有巧思的，一句话说清"它解决什么/有什么巧思"。 |
| **🚀 Product Hunt** | 当日上线新品，挑 AI / 独立开发者作品，一句话说清产品定位。 |
| **📄 HF Daily Papers** | 当日精选论文，列标题 + 链接；精读版可一句话点出论文的核心创新点。 |
| **📈 趋势洞察** | 仅精读版有。把当天 builder 言论 + 播客 + GitHub 热项 + Show HN/PH 叠在一起，提炼"AI 行业在往哪走"的判断，不是复述而是归纳。 |

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

### D. 🛠️ Vibe Coding 总结方案（精读版，目标②）

Vibe 板块的目的是给"自己做 vibe coding 项目"找灵感，所以总结角度和前沿思路不同：

1. **聚焦"做了什么 + 怎么 vibe 出来的"**：用一两句大白话说清这个产品是什么、面向谁。
   GitHub 项目看 README 有没有写技术栈 / 模板出处；Product Hunt / Show HN 看产品定位。
2. **提炼"可借鉴的玩法"**：比如某个产品是"一个 AI 套壳 + 漂亮落地页"、某个是"Next.js 模板快速起一个 SaaS"、
   某个是"把某个枯燥工具加了 AI 交互"。点出"这种套路你也能复用"的部分。
3. **不追大厂大项目**：vibe 板块要的是个人/独立开发者那种"小而美、周末能做出来"的项目，
   大而全的框架放前沿思路 / AI 新星即可。
4. **可跨源串联**：同一个产品如果在 Show HN 和 Product Hunt 都出现，合并讲，并说明它的热度。

**为什么这样做**：用户明确说要"给自己做 vibe coding 项目找灵感"，关注点是"玩法和套路可不可复用"，
而非项目的技术深度——所以总结要落到"我能怎么抄这个思路"。

---

## 配置

**GitHub 抓取关键词**在 `scripts/fetch-github.js` 顶部：
- `AI_TOPICS`：AI 新星关键词（`llm / agent / rag / mcp / ai-agent / llmops`），7 天窗口
- `FRONTIER_TOPICS`：前沿思路关键词（`memory / knowledge-graph / second-brain / self-evolving / agent-memory / world-model`），90 天窗口
- `VIBE_TOPICS`：Vibe Coding 关键词（`vibe-coding / ai-app / saas-boilerplate / nextjs / side-project / indie-hacker`），30 天窗口 + star ≥ 30 过滤噪声

**额外源参数**在 `scripts/fetch-extra.js` 顶部：
- `HN_MIN_POINTS`：Show HN 帖子点赞下限（默认 10），过滤掉刚发布没人看的
- `PRODUCT_HUNT_LIMIT` / `HF_PAPERS_LIMIT`：各源条数上限

输出目录优先级：环境变量 `DIGEST_OUTPUT_DIR` > `~/.daily-ai-digest/config.json` 的 `outputDir` > 默认（skill 上一级的 `每日咨询/`）。

> **注意**：Hugging Face Papers 这条线依赖能访问 `huggingface.co`，若本地网络无法直连该域名，
> 该板块会自动留空（不影响其他源），等网络可达时自动恢复。

---

## 你自己手动刷的渠道清单（脚本抓不到、值得收藏）

以下是脚本难以稳定抓取、但信噪比高、建议手动定期扫的源（每天 15-20 分钟即可）：

**① AI 框架 / 设计理念型**
- `star-history.com`、`trendshift.io` — 看 star 曲线异常陡的项目
- 几个 awesome 列表的 commit history（关注新加入项，而非整张表）：`awesome-llm-apps`、`awesome-ai-agents`、`awesome-generative-ai`
- Newsletter：Latent Space、Simon Willison's Weblog、The Batch (Andrew Ng)
- X：`@swyx`、`@simonw`、`@hwchase17`、`@jerryjliu0`

**② Vibe Coding 灵感型**
- X 标签 `#buildinpublic`、`#vibecoding`；人：`@levelsio`、`@theo`、`@nutlope`、`@rauchg`
- 直接看成品：`v0.dev` community、Cursor Directory、`bolt.new` gallery
- Indie Hackers 的 milestone 帖；YouTube：Theo / Fireship / Matt Pocock
- GitHub 高级搜索：`topic:nextjs created:>YYYY-MM-DD stars:>50`

> 这些源里筛"框架设计理念型"项目时，重点看 README 有没有 **"why" + 架构图**，借此筛掉纯工具型 repo。

详细安装与定时配置见 `README.md`。