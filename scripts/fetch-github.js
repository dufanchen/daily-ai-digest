#!/usr/bin/env node

// ============================================================================
// GitHub 热门 AI 开源项目抓取器
// ============================================================================
// 仿照 follow-builders 的 prepare-digest 思路：脚本确定性地抓数据，输出 JSON。
//
// 两路数据源（均无需 token）：
//   1. AI 新星：GitHub Search API，按 AI 关键词 + 最近 N 天创建 + star 排序
//   2. 当下风口：GitHub Trending 页面（daily），解析仓库列表
//
// Usage:
//   node fetch-github.js            # 输出 JSON 到 stdout
//   node fetch-github.js --days 7   # 自定义新星的时间窗口（默认 7 天）
// ============================================================================

// -- 配置 --------------------------------------------------------------------

// AI 相关 topic 关键词，用于 Search API 过滤
const AI_TOPICS = ['llm', 'agent', 'rag', 'mcp', 'ai-agent', 'llmops'];

// 「前沿思路」topic：聚焦能打开认知的新范式方向，而非功能型工具。
// 对应 LLM Wiki / GBrain 这类：记忆层、知识图谱、第二大脑、自进化 agent。
const FRONTIER_TOPICS = [
  'memory',
  'knowledge-graph',
  'second-brain',
  'self-evolving',
  'agent-memory',
  'world-model'
];

// Trending 里只保留命中这些 AI 关键词的项目（描述或名字里出现）
const AI_HINTS = [
  'ai', 'llm', 'agent', 'gpt', 'rag', 'mcp', 'model', 'prompt',
  'diffusion', 'neural', 'machine learning', 'deep learning', 'transformer',
  'embedding', 'vector', 'chatbot', 'inference', 'fine-tun', 'openai',
  'anthropic', 'claude', 'gemini', 'mistral', 'multimodal'
];

const SEARCH_PER_TOPIC = 5;
const TRENDING_LIMIT = 15;

// -- 参数解析 ----------------------------------------------------------------

function parseDays() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--days');
  if (idx !== -1 && args[idx + 1]) {
    const n = parseInt(args[idx + 1], 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 7;
}

function dateNDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// -- 数据源 1：Search API 抓新星（按给定 topic 列表）------------------------

// 按 topic 列表搜索「最近 N 天创建 + star 排序」的仓库，去重后返回。
async function fetchRisingByTopics(topics, days, limit) {
  const since = dateNDaysAgo(days);
  const seen = new Set();
  const repos = [];
  const errors = [];

  for (const topic of topics) {
    const url =
      `https://api.github.com/search/repositories` +
      `?q=created:>${since}+topic:${topic}&sort=stars&order=desc&per_page=${SEARCH_PER_TOPIC}`;
    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'follow-builders-github-tracker'
        }
      });
      if (!res.ok) {
        errors.push(`Search topic:${topic} HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      for (const item of data.items || []) {
        if (seen.has(item.full_name)) continue;
        seen.add(item.full_name);
        repos.push({
          fullName: item.full_name,
          url: item.html_url,
          description: item.description || '',
          stars: item.stargazers_count,
          language: item.language || '',
          createdAt: item.created_at,
          topic
        });
      }
    } catch (err) {
      errors.push(`Search topic:${topic} ${err.message}`);
    }
  }

  repos.sort((a, b) => b.stars - a.stars);
  return { repos: repos.slice(0, limit), errors };
}

// -- 数据源 2：Trending 页面 ------------------------------------------------

function looksLikeAI(text) {
  const lower = (text || '').toLowerCase();
  return AI_HINTS.some((hint) => lower.includes(hint));
}

async function fetchTrending() {
  const errors = [];
  try {
    const res = await fetch('https://github.com/trending?since=daily', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    if (!res.ok) {
      return { repos: [], errors: [`Trending HTTP ${res.status}`] };
    }
    const html = await res.text();

    // 每个 trending 仓库块以 <h2 class="h3 lh-condensed"> 开头，
    // 紧跟 <a href="/owner/repo">；随后块里有描述 <p> 和当日 star 数。
    const blockRe = /<article class="Box-row">([\s\S]*?)<\/article>/g;
    const repos = [];
    let block;
    while ((block = blockRe.exec(html)) !== null) {
      const segment = block[1];
      const nameMatch = segment.match(
        /<h2 class="h3 lh-condensed">[\s\S]*?href="\/([^\/"]+)\/([^"]+)"/
      );
      if (!nameMatch) continue;
      const owner = nameMatch[1];
      const repo = nameMatch[2];
      const fullName = `${owner}/${repo}`;

      const descMatch = segment.match(
        /<p class="col-9 color-fg-muted my-1 pr-4">([\s\S]*?)<\/p>/
      );
      const description = descMatch
        ? descMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        : '';

      const langMatch = segment.match(
        /<span itemprop="programmingLanguage">([^<]+)<\/span>/
      );
      const language = langMatch ? langMatch[1].trim() : '';

      const todayStarsMatch = segment.match(
        /([\d,]+)\s*stars today/
      );
      const starsToday = todayStarsMatch
        ? parseInt(todayStarsMatch[1].replace(/,/g, ''), 10)
        : null;

      repos.push({
        fullName,
        url: `https://github.com/${fullName}`,
        description,
        language,
        starsToday,
        isAI: looksLikeAI(`${fullName} ${description}`)
      });
    }

    return { repos: repos.slice(0, TRENDING_LIMIT), errors };
  } catch (err) {
    return { repos: [], errors: [`Trending ${err.message}`] };
  }
}

// -- Main --------------------------------------------------------------------

async function main() {
  const days = parseDays();
  // 前沿方向迭代慢、增量少，用更长的时间窗口（90 天）才抓得到有分量的新项目。
  const frontierDays = Math.max(days, 90);

  const [aiRising, frontier, trending] = await Promise.all([
    fetchRisingByTopics(AI_TOPICS, days, 15),
    fetchRisingByTopics(FRONTIER_TOPICS, frontierDays, 12),
    fetchTrending()
  ]);

  const errors = [...aiRising.errors, ...frontier.errors, ...trending.errors];

  const aiTrending = trending.repos.filter((r) => r.isAI);

  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    windowDays: days,
    frontierDays,
    aiRising: aiRising.repos,
    frontierIdeas: frontier.repos,
    trendingAll: trending.repos,
    trendingAI: aiTrending,
    stats: {
      aiRisingCount: aiRising.repos.length,
      frontierCount: frontier.repos.length,
      trendingTotal: trending.repos.length,
      trendingAICount: aiTrending.length
    },
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
