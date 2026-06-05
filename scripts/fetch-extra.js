#!/usr/bin/env node

// ============================================================================
// 额外资讯源抓取器（Hacker News / Product Hunt / Hugging Face Papers）
// ============================================================================
// 与 fetch-github.js 同思路：脚本确定性地抓数据，输出 JSON。三路均无需 key：
//   1. Hacker News「Show HN」：官方 Algolia API，最近发布、按时间倒序
//   2. Product Hunt 每日榜：公开 Atom feed，解析当天上榜产品
//   3. Hugging Face Daily Papers：抓 huggingface.co/papers 页面，解析当日论文
//
// Usage:
//   node fetch-extra.js            # 输出 JSON 到 stdout
// ============================================================================

// -- 配置 --------------------------------------------------------------------

const HN_LIMIT = 12;
// Show HN 帖子点赞下限：过滤掉刚发布还没人看的，留下已被社区验证的。
const HN_MIN_POINTS = 10;

const PRODUCT_HUNT_LIMIT = 12;
const HF_PAPERS_LIMIT = 10;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// -- 工具 --------------------------------------------------------------------

function stripHtml(text) {
  return (text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Product Hunt 的 content 经实体解码后是 HTML 富文本（首段简介 + 后续 utm 链接）。
// 先解码实体，取第一个 <p>…</p> 作为简介，去标签后返回；取不到段落则退回整体去标签。
function extractFirstParagraph(rawContent) {
  const decoded = (rawContent || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const paragraphMatch = decoded.match(/<p>([\s\S]*?)<\/p>/i);
  const target = paragraphMatch ? paragraphMatch[1] : decoded;
  return stripHtml(target).slice(0, 160);
}

async function fetchJSON(url, label) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });
    if (!res.ok) return { data: null, error: `${label} HTTP ${res.status}` };
    return { data: await res.json(), error: null };
  } catch (err) {
    return { data: null, error: `${label} ${err.message}` };
  }
}

async function fetchText(url, label) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return { text: null, error: `${label} HTTP ${res.status}` };
    return { text: await res.text(), error: null };
  } catch (err) {
    return { text: null, error: `${label} ${err.message}` };
  }
}

// -- 数据源 1：Hacker News「Show HN」----------------------------------------

// 用 Algolia 的 HN Search API 抓最近的 Show HN 帖子（开发者首发小项目的主阵地）。
async function fetchShowHN() {
  const url =
    'https://hn.algolia.com/api/v1/search_by_date' +
    `?tags=show_hn&hitsPerPage=${HN_LIMIT * 2}`;
  const { data, error } = await fetchJSON(url, 'ShowHN');
  if (!data) return { items: [], errors: error ? [error] : [] };

  const items = (data.hits || [])
    .filter((hit) => (hit.points || 0) >= HN_MIN_POINTS && hit.title)
    .map((hit) => ({
      title: hit.title.replace(/^Show HN:\s*/i, '').trim(),
      // 项目本身链接（外链优先），没有外链就指向 HN 讨论页。
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      discussionUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      points: hit.points || 0,
      comments: hit.num_comments || 0,
      author: hit.author || ''
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, HN_LIMIT);

  return { items, errors: [] };
}

// -- 数据源 2：Product Hunt 每日榜（Atom feed）------------------------------

// Product Hunt 的 /feed 是 Atom 格式：每个产品是一个 <entry>，
// 标题在 <title>，产品页链接在 <link rel="alternate" href=...>，简介在 <content>。
async function fetchProductHunt() {
  const { text, error } = await fetchText(
    'https://www.producthunt.com/feed',
    'ProductHunt'
  );
  if (!text) return { items: [], errors: error ? [error] : [] };

  const items = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRe.exec(text)) !== null && items.length < PRODUCT_HUNT_LIMIT) {
    const segment = match[1];
    const titleMatch = segment.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = segment.match(
      /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/
    );
    const contentMatch = segment.match(/<content[^>]*>([\s\S]*?)<\/content>/);
    if (!titleMatch || !linkMatch) continue;

    const title = stripHtml(titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ''));
    const url = linkMatch[1].trim();
    // content 里第一段 <p> 是产品简介，后面跟的是 utm 跟踪链接，只保留首段简介。
    const description = contentMatch
      ? extractFirstParagraph(contentMatch[1].replace(/<!\[CDATA\[|\]\]>/g, ''))
      : '';

    if (title && url) items.push({ title, url, description });
  }

  return { items, errors: [] };
}

// -- 数据源 3：Hugging Face Daily Papers -------------------------------------

// 抓 huggingface.co/papers 页面，解析当日精选论文（标题 + arXiv id）。
async function fetchHuggingFacePapers() {
  const { text, error } = await fetchText(
    'https://huggingface.co/papers',
    'HFPapers'
  );
  if (!text) return { items: [], errors: error ? [error] : [] };

  const seen = new Set();
  const items = [];

  // 论文卡片链接形如 /papers/<arxivId>，标题在同块的 <h3>。
  const cardRe = /<a[^>]+href="\/papers\/([0-9.]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = cardRe.exec(text)) !== null && items.length < HF_PAPERS_LIMIT) {
    const arxivId = match[1];
    if (seen.has(arxivId)) continue;
    const title = stripHtml(match[2]);
    // 过滤掉空标题或明显不是论文标题的短碎片。
    if (!title || title.length < 12) continue;
    seen.add(arxivId);
    items.push({
      title,
      url: `https://huggingface.co/papers/${arxivId}`,
      arxivUrl: `https://arxiv.org/abs/${arxivId}`
    });
  }

  return { items, errors: [] };
}

// -- Main --------------------------------------------------------------------

async function main() {
  // 三路同源不同站，可并行抓取。
  const [showHN, productHunt, hfPapers] = await Promise.all([
    fetchShowHN(),
    fetchProductHunt(),
    fetchHuggingFacePapers()
  ]);

  const errors = [
    ...showHN.errors,
    ...productHunt.errors,
    ...hfPapers.errors
  ];

  const output = {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    showHN: showHN.items,
    productHunt: productHunt.items,
    hfPapers: hfPapers.items,
    stats: {
      showHNCount: showHN.items.length,
      productHuntCount: productHunt.items.length,
      hfPapersCount: hfPapers.items.length
    },
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ status: 'error', message: err.message }));
  process.exit(1);
});
