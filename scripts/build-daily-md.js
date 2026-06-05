#!/usr/bin/env node

// ============================================================================
// Daily AI Digest — Markdown Builder（无人值守版）
// ============================================================================
// 由 cron 每天定时调用。流程：
//   1. 调用 prepare-digest.js 抓中心 feed（X 推文 / 播客 / 博客）
//   2. 调用 fetch-github.js 抓 GitHub（前沿思路 / AI 新星 / Trending，无需 key）
//   3. 组装成中英双语 Markdown，每条带原始链接，给跨天新出现的内容打 🆕
//   4. 按日期保存到输出目录：YYYY-MM-DD.md
//
// 本脚本不经过 LLM，中文为脚本化对照（保证真实、无幻觉）。
// 想要带「趋势洞察」的精读版，请让带 LLM 的 AI 助手按 SKILL.md 的规则 remix。
//
// 输出目录优先级：环境变量 DIGEST_OUTPUT_DIR > config.json 的 outputDir > 默认值
// 默认值：skill 目录的上一级 / 每日咨询
//
// Usage: node build-daily-md.js
// ============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const execFileAsync = promisify(execFile);

// -- 路径与配置 --------------------------------------------------------------

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = join(scriptDir, '..');
const PREPARE_SCRIPT = join(scriptDir, 'prepare-digest.js');
const GITHUB_SCRIPT = join(scriptDir, 'fetch-github.js');
const EXTRA_SCRIPT = join(scriptDir, 'fetch-extra.js');

const TIMEZONE = process.env.DIGEST_TIMEZONE || 'Asia/Shanghai';

// 解析输出目录：环境变量 > config.json > 默认（skill 上一级 / 每日咨询）
function resolveOutputDir() {
  if (process.env.DIGEST_OUTPUT_DIR) return process.env.DIGEST_OUTPUT_DIR;
  const configPath = join(homedir(), '.daily-ai-digest', 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.outputDir) return config.outputDir;
    } catch {
      // 忽略损坏的 config，落到默认值
    }
  }
  return join(skillDir, '..', '每日咨询');
}

const OUTPUT_DIR = resolveOutputDir();

// 跨天去重：记录历史出现过的内容 ID（推文 url / 仓库 fullName / 播客 url）。
// 当天某项 ID 不在历史里，就标 🆕，方便一眼识别新增。
const HISTORY_PATH = join(homedir(), '.daily-ai-digest', 'seen-history.json');
const NEW_TAG = ' 🆕';
const HISTORY_MAX = 2000;

// -- 工具函数 ----------------------------------------------------------------

function todayString() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

async function loadSeenHistory() {
  if (!existsSync(HISTORY_PATH)) return new Set();
  try {
    const raw = await readFile(HISTORY_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return new Set(Array.isArray(data.ids) ? data.ids : []);
  } catch {
    return new Set();
  }
}

async function saveSeenHistory(seenSet) {
  const ids = Array.from(seenSet).slice(-HISTORY_MAX);
  const payload = { updatedAt: new Date().toISOString(), ids };
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await writeFile(HISTORY_PATH, JSON.stringify(payload, null, 2), 'utf-8');
}

// 标记器：用 oldSeen 判断"新 vs 旧"，用 collected 收集本次所有 ID（结束后写回）。
function createMarker(oldSeen) {
  const collected = new Set();
  function tagIfNew(id) {
    if (!id) return '';
    collected.add(id);
    return oldSeen.has(id) ? '' : NEW_TAG;
  }
  return { tagIfNew, collected };
}

async function fetchDigestData() {
  try {
    const { stdout } = await execFileAsync('node', [PREPARE_SCRIPT], {
      maxBuffer: 32 * 1024 * 1024
    });
    return JSON.parse(stdout);
  } catch (err) {
    console.error(`[daily-ai-digest] feed fetch failed (skipped): ${err.message}`);
    return { stats: {}, x: [], podcasts: [], blogs: [] };
  }
}

async function fetchGithubData() {
  try {
    const { stdout } = await execFileAsync('node', [GITHUB_SCRIPT], {
      maxBuffer: 16 * 1024 * 1024
    });
    return JSON.parse(stdout);
  } catch (err) {
    console.error(`[daily-ai-digest] GitHub fetch failed (skipped): ${err.message}`);
    return null;
  }
}

// 抓额外资讯源（Hacker News Show HN / Product Hunt / Hugging Face Papers）。
// 任一源失败都被 fetch-extra.js 内部隔离，这里整体失败也只是跳过，不阻断主流程。
async function fetchExtraData() {
  try {
    const { stdout } = await execFileAsync('node', [EXTRA_SCRIPT], {
      maxBuffer: 16 * 1024 * 1024
    });
    return JSON.parse(stdout);
  } catch (err) {
    console.error(`[daily-ai-digest] extra sources fetch failed (skipped): ${err.message}`);
    return null;
  }
}

function cleanTweetText(text) {
  if (!text) return '';
  return text
    .replace(/https?:\/\/t\.co\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function describeAuthor(builder) {
  const name = builder.name || builder.handle || 'Unknown';
  const bio = (builder.bio || '').trim();
  if (!bio) return { en: name, zh: name };
  const shortBio = bio.length > 80 ? bio.slice(0, 80) + '…' : bio;
  return {
    en: `${name} — ${shortBio}`,
    zh: `${name}（${shortBio}）`
  };
}

// -- Markdown 组装 -----------------------------------------------------------

function buildTweetSection(builders, marker) {
  if (!builders || builders.length === 0) return '';
  const lines = ['## X / Twitter\n'];
  for (const builder of builders) {
    const substantiveTweets = (builder.tweets || []).filter(
      (tweet) => cleanTweetText(tweet.text).length > 0 && tweet.url
    );
    if (substantiveTweets.length === 0) continue;
    const author = describeAuthor(builder);
    lines.push(`### ${author.en}`);
    lines.push(`> ${author.zh}\n`);
    for (const tweet of substantiveTweets) {
      const text = cleanTweetText(tweet.text);
      const tag = marker.tagIfNew(tweet.url);
      lines.push(`- ${text}${tag}`);
      lines.push(`  - 链接 / Link: ${tweet.url}\n`);
    }
  }
  return lines.length > 1 ? lines.join('\n') + '\n' : '';
}

function buildPodcastSection(podcasts, marker) {
  if (!podcasts || podcasts.length === 0) return '';
  const lines = ['## Podcasts / 播客\n'];
  for (const podcast of podcasts) {
    if (!podcast.url) continue;
    const transcript = podcast.transcript || '';
    const excerpt = transcript
      .replace(/Speaker \d+ \| [\d:]+ - [\d:]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
    const tag = marker.tagIfNew(podcast.url);
    lines.push(`### ${podcast.name || 'Podcast'} — ${podcast.title || ''}${tag}`);
    lines.push(`- 视频 / Video: ${podcast.url}`);
    if (excerpt) {
      lines.push(`- 字幕节选 / Transcript excerpt:`);
      lines.push(`  > ${excerpt}…`);
    }
    lines.push('');
  }
  return lines.length > 1 ? lines.join('\n') + '\n' : '';
}

function buildBlogSection(blogs, marker) {
  if (!blogs || blogs.length === 0) return '';
  const lines = ['## Official Blogs / 官方博客\n'];
  for (const blog of blogs) {
    if (!blog.url) continue;
    const tag = marker.tagIfNew(blog.url);
    lines.push(`### ${blog.name || blog.title || 'Blog'}${tag}`);
    if (blog.title && blog.name) lines.push(`- ${blog.title}`);
    if (blog.author) lines.push(`- 作者 / Author: ${blog.author}`);
    lines.push(`- 原文 / Article: ${blog.url}\n`);
  }
  return lines.length > 1 ? lines.join('\n') + '\n' : '';
}

function buildGithubSection(github, marker) {
  if (!github || github.status !== 'ok') return '';
  const aiRising = github.aiRising || [];
  const frontierIdeas = github.frontierIdeas || [];
  const vibeIdeas = github.vibeIdeas || [];
  const trendingAI = github.trendingAI || [];
  const trendingAll = github.trendingAll || [];
  if (
    aiRising.length === 0 &&
    frontierIdeas.length === 0 &&
    vibeIdeas.length === 0 &&
    trendingAll.length === 0
  ) {
    return '';
  }
  const lines = [`## GitHub 热门项目 / Hot Repos\n`];

  if (frontierIdeas.length > 0) {
    lines.push(`### 🧠 前沿思路（打开认知 · 非功能型）`);
    lines.push(`> Frontier ideas — new paradigms like memory layers, knowledge graphs, second brain, self-evolving agents\n`);
    for (const repo of frontierIdeas.slice(0, 8)) {
      const lang = repo.language ? ` \`${repo.language}\`` : '';
      const desc = repo.description ? ` — ${repo.description}` : '';
      const tag = marker.tagIfNew(repo.fullName);
      lines.push(`- **${repo.fullName}** ⭐${repo.stars} \`#${repo.topic}\`${lang}${tag}${desc}`);
      lines.push(`  - ${repo.url}\n`);
    }
  }

  if (vibeIdeas.length > 0) {
    lines.push(`### 🛠️ Vibe Coding 灵感（独立开发者的成品型小项目）`);
    lines.push(`> Vibe coding inspiration — small polished apps / boilerplates / AI products to spark your own builds\n`);
    for (const repo of vibeIdeas.slice(0, 8)) {
      const lang = repo.language ? ` \`${repo.language}\`` : '';
      const desc = repo.description ? ` — ${repo.description}` : '';
      const tag = marker.tagIfNew(repo.fullName);
      lines.push(`- **${repo.fullName}** ⭐${repo.stars} \`#${repo.topic}\`${lang}${tag}${desc}`);
      lines.push(`  - ${repo.url}\n`);
    }
  }

  if (aiRising.length > 0) {
    lines.push(`### 🌟 AI 新星（近 ${github.windowDays || 7} 天创建 · star 排序）`);
    lines.push(`> AI rising stars created in the last ${github.windowDays || 7} days, ranked by stars\n`);
    for (const repo of aiRising.slice(0, 10)) {
      const lang = repo.language ? ` \`${repo.language}\`` : '';
      const desc = repo.description ? ` — ${repo.description}` : '';
      const tag = marker.tagIfNew(repo.fullName);
      lines.push(`- **${repo.fullName}** ⭐${repo.stars}${lang}${tag}${desc}`);
      lines.push(`  - ${repo.url}\n`);
    }
  }

  const trendingToShow = trendingAI.length > 0 ? trendingAI : trendingAll;
  const trendingLabel = trendingAI.length > 0
    ? '### 🔥 今日 Trending 中的 AI 项目'
    : '### 🔥 今日 GitHub Trending';
  if (trendingToShow.length > 0) {
    lines.push(trendingLabel);
    lines.push(`> Today's GitHub trending repositories\n`);
    for (const repo of trendingToShow.slice(0, 10)) {
      const lang = repo.language ? ` \`${repo.language}\`` : '';
      const todayStars = repo.starsToday != null ? ` (+${repo.starsToday} today)` : '';
      const desc = repo.description ? ` — ${repo.description}` : '';
      const tag = marker.tagIfNew(repo.fullName);
      lines.push(`- **${repo.fullName}**${todayStars}${lang}${tag}${desc}`);
      lines.push(`  - ${repo.url}\n`);
    }
  }

  return lines.length > 1 ? lines.join('\n') + '\n' : '';
}

function buildShowHNSection(extra, marker) {
  const items = (extra && extra.showHN) || [];
  if (items.length === 0) return '';
  const lines = ['## 🟧 Hacker News · Show HN\n'];
  lines.push('> 开发者首发小项目的主阵地 / Where builders launch their projects first\n');
  for (const item of items) {
    const tag = marker.tagIfNew(item.discussionUrl || item.url);
    const heat = `▲${item.points} · 💬${item.comments}`;
    lines.push(`- **${item.title}** (${heat})${tag}`);
    lines.push(`  - 项目 / Project: ${item.url}`);
    if (item.discussionUrl && item.discussionUrl !== item.url) {
      lines.push(`  - 讨论 / Discussion: ${item.discussionUrl}`);
    }
    lines.push('');
  }
  return lines.length > 2 ? lines.join('\n') + '\n' : '';
}

function buildProductHuntSection(extra, marker) {
  const items = (extra && extra.productHunt) || [];
  if (items.length === 0) return '';
  const lines = ['## 🚀 Product Hunt · 每日新品\n'];
  lines.push("> 每天上线的新产品（含大量 AI / 独立开发者作品）/ Today's launches\n");
  for (const item of items) {
    const tag = marker.tagIfNew(item.url);
    const desc = item.description ? ` — ${item.description}` : '';
    lines.push(`- **${item.title}**${tag}${desc}`);
    lines.push(`  - ${item.url}\n`);
  }
  return lines.length > 2 ? lines.join('\n') + '\n' : '';
}

function buildHfPapersSection(extra, marker) {
  const items = (extra && extra.hfPapers) || [];
  if (items.length === 0) return '';
  const lines = ['## 📄 Hugging Face · Daily Papers\n'];
  lines.push('> 当日精选论文（看新范式的源头）/ Curated papers of the day\n');
  for (const item of items) {
    const tag = marker.tagIfNew(item.url);
    lines.push(`- **${item.title}**${tag}`);
    lines.push(`  - HF: ${item.url}`);
    if (item.arxivUrl) lines.push(`  - arXiv: ${item.arxivUrl}`);
    lines.push('');
  }
  return lines.length > 2 ? lines.join('\n') + '\n' : '';
}

function buildMarkdown(data, dateStr, github, extra, marker) {
  const { stats = {}, x = [], podcasts = [], blogs = [] } = data;

  const header = [
    `# AI Builders Digest — ${dateStr}`,
    '',
    `> 每日 AI Builders 资讯 + GitHub 热门项目 · 中英双语`,
    `> 本日数据：${stats.xBuilders || 0} 位 builder / ${stats.totalTweets || 0} 条推文 / ${stats.podcastEpisodes || 0} 个播客 / ${stats.blogPosts || 0} 篇博客${github && github.stats ? ` / GitHub ${github.stats.frontierCount || 0} 前沿 + ${github.stats.vibeCount || 0} vibe + ${github.stats.aiRisingCount || 0} 新星 + ${github.stats.trendingTotal || 0} trending` : ''}${extra && extra.stats ? ` / ${extra.stats.showHNCount || 0} ShowHN + ${extra.stats.productHuntCount || 0} PH + ${extra.stats.hfPapersCount || 0} papers` : ''}`,
    `> 🆕 标记 = 相比往日首次出现的新内容`,
    `> Feed 生成时间 / Feed generated at: ${stats.feedGeneratedAt || 'N/A'}`,
    ''
  ].join('\n');

  const sections = [
    buildTweetSection(x, marker),
    buildBlogSection(blogs, marker),
    buildPodcastSection(podcasts, marker),
    buildGithubSection(github, marker),
    buildShowHNSection(extra, marker),
    buildProductHuntSection(extra, marker),
    buildHfPapersSection(extra, marker)
  ].filter(Boolean);

  const footer = [
    '---',
    '',
    'Generated by the daily-ai-digest skill · 数据线基于 Zara Zhang 的 follow-builders（https://github.com/zarazhangrui/follow-builders）'
  ].join('\n');

  if (sections.length === 0) {
    return `${header}\n_今日暂无新内容 / No new updates today._\n\n${footer}\n`;
  }

  return `${header}\n${sections.join('\n')}\n${footer}\n`;
}

// -- Main --------------------------------------------------------------------

async function main() {
  const dateStr = todayString();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const [data, github, extra, oldSeen] = await Promise.all([
    fetchDigestData(),
    fetchGithubData(),
    fetchExtraData(),
    loadSeenHistory()
  ]);

  const marker = createMarker(oldSeen);
  const markdown = buildMarkdown(data, dateStr, github, extra, marker);

  const outputPath = join(OUTPUT_DIR, `${dateStr}.md`);
  await writeFile(outputPath, markdown, 'utf-8');

  const merged = new Set([...oldSeen, ...marker.collected]);
  await saveSeenHistory(merged);

  const newCount = [...marker.collected].filter((id) => !oldSeen.has(id)).length;
  console.log(`[daily-ai-digest] Saved daily digest: ${outputPath} (new items: ${newCount})`);
}

main().catch((err) => {
  console.error(`[daily-ai-digest] Failed to build daily md: ${err.message}`);
  process.exit(1);
});
