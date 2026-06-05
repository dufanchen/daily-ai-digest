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

// 「Vibe Coding 灵感」topic：聚焦个人/独立开发者 vibe 出来的成品型项目，
// 给自己做 vibe coding 项目找灵感（小而美的 app、boilerplate、AI 套壳产品）。
const VIBE_TOPICS = [
  'vibe-coding',
  'ai-app',
  'saas-boilerplate',
  'nextjs',
  'side-project',
  'indie-hacker'
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
// 相邻 topic 搜索之间的节流间隔（毫秒），降低匿名 Search API 限流概率。
const SEARCH_THROTTLE_MS = 800;

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

// -- 重试 / 退避（确定性逻辑）------------------------------------------------

// GitHub 匿名 Search API 容易被限流（403/429）。这里用指数退避 + jitter 重试，
// 并尊重服务端返回的 Retry-After 头，尽量把高 star 新项目抓全。
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1500;
const RETRY_MAX_MS = 12000;
// 被限流时立刻重试也没用（速率窗口未过），所以重试要等够时间。
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 计算第 attempt 次重试前应等待的毫秒数：指数退避 + 满抖动；
// 若服务端给了合理的 Retry-After（秒），优先采用它。
function computeBackoffMs(attempt, retryAfterHeader) {
  const retryAfterSec = parseInt(retryAfterHeader || '', 10);
  if (!Number.isNaN(retryAfterSec) && retryAfterSec > 0 && retryAfterSec <= 60) {
    return retryAfterSec * 1000;
  }
  const exponential = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
  const jitter = Math.random() * RETRY_BASE_MS;
  return exponential + jitter;
}

// 带重试的 fetch：成功（res.ok）直接返回；遇到可重试状态码则退避后再试；
// 网络异常同样重试。重试耗尽后返回最后一次结果或抛出最后一次异常。
async function fetchWithRetry(url, options, label) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_RETRIES) {
        return res;
      }
      const waitMs = computeBackoffMs(attempt, res.headers.get('retry-after'));
      console.error(
        `[github] ${label} HTTP ${res.status}, retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(waitMs)}ms`
      );
      await sleep(waitMs);
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) throw err;
      const waitMs = computeBackoffMs(attempt, null);
      console.error(
        `[github] ${label} error "${err.message}", retry ${attempt + 1}/${MAX_RETRIES} after ${Math.round(waitMs)}ms`
      );
      await sleep(waitMs);
    }
  }
  if (lastError) throw lastError;
  // 理论不可达：循环要么 return，要么 throw。
  throw new Error(`${label}: exhausted retries with no response`);
}

// -- 数据源 1：Search API 抓新星（按给定 topic 列表）------------------------

// 按 topic 列表搜索「最近 N 天创建 + star 排序」的仓库，去重后返回。
// minStars：可选的 star 下限，热门 topic（如 nextjs）量大噪声多，用它过滤掉无人问津的脚手架。
async function fetchRisingByTopics(topics, days, limit, minStars = 0) {
  const since = dateNDaysAgo(days);
  const seen = new Set();
  const repos = [];
  const errors = [];

  for (const topic of topics) {
    const starQuery = minStars > 0 ? `+stars:>=${minStars}` : '';
    const url =
      `https://api.github.com/search/repositories` +
      `?q=created:>${since}+topic:${topic}${starQuery}&sort=stars&order=desc&per_page=${SEARCH_PER_TOPIC}`;
    try {
      const res = await fetchWithRetry(
        url,
        {
          headers: {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'follow-builders-github-tracker'
          }
        },
        `Search topic:${topic}`
      );
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
    // 相邻 topic 请求之间留间隔，降低匿名 Search API 触发限流的概率。
    await sleep(SEARCH_THROTTLE_MS);
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

  // Trending 走 github.com 网页，与 Search API 不同源，可并行；
  // 两批 Search 都打 api.github.com，串行执行避免并发加剧限流。
  // Vibe 项目偏成品 app，迭代节奏比前沿研究快，但热门 topic（nextjs 等）噪声大，
  // 用 30 天窗口 + star 下限过滤，确保抓到的是真有人用的小而美项目。
  const vibeDays = Math.max(days, 30);

  const trendingPromise = fetchTrending();
  const aiRising = await fetchRisingByTopics(AI_TOPICS, days, 15);
  const frontier = await fetchRisingByTopics(FRONTIER_TOPICS, frontierDays, 12);
  const vibe = await fetchRisingByTopics(VIBE_TOPICS, vibeDays, 12, 30);
  const trending = await trendingPromise;

  const errors = [...aiRising.errors, ...frontier.errors, ...vibe.errors, ...trending.errors];

  const aiTrending = trending.repos.filter((r) => r.isAI);

  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    windowDays: days,
    frontierDays,
    vibeDays,
    aiRising: aiRising.repos,
    frontierIdeas: frontier.repos,
    vibeIdeas: vibe.repos,
    trendingAll: trending.repos,
    trendingAI: aiTrending,
    stats: {
      aiRisingCount: aiRising.repos.length,
      frontierCount: frontier.repos.length,
      vibeCount: vibe.repos.length,
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
