---
name: pulse
description: >
  📡 Pulse — Henry's twice-daily briefing.
  Designed to be triggered by cronjob at morning and evening, or manually.
  Use this skill only when the user says "pulse" or "/pulse".
---

# 📡 Pulse

A comprehensive twice-daily briefing combining product launches, open-source trends, curated news, and weather forecasts. Designed to run at morning and evening, but can also be triggered manually at any time.

## Locale

The final output should be in the user's preferred language which is `zh-CN` simplified Chinese.

## Workflow Overview

Execute the following steps in order. Step 1.5 runs a Python prefetch script that fetches most data sources in parallel (~1-3s). Steps 2-6 read from this prefetch data — **do NOT call `web_fetch`/`web_search` for sources already covered by prefetch** unless the prefetch errored. Only Steps 4b, 4c, and 7 still need `web_search`.

---

### Step 1: Determine Date & Time Context

1. Note today's date and current time.
2. Determine if this is a **morning** (before 14:00) or **evening** (14:00+) run — this affects the emoji in the header:
   - Morning → 🌅
   - Evening → 🌆
3. Determine the day of the week — needed for Nanjing weekend weather.
4. Product Hunt launches happen Mon–Fri (Pacific Time). If today is Saturday/Sunday, use the most recent Friday's leaderboard and note this.

---

### Step 1.5: Run Prefetch Script

```bash
cd .claude/skills/pulse && uv run scripts/prefetch.py 2>/dev/null
```

Returns a JSON blob with `producthunt`, `github_trending`, `google_news`, `podcasts`, `weather`, `stock` data — all fetched in parallel (~1-3s).
- **Directly use prefetch data** for Steps 2, 3, 4a, 4e, 5, 6 below — do NOT call `web_fetch` for these sources.
- If a source's `errors` entry is not null, fall back to the original `web_fetch`/`web_search` approach for that source only.
- Steps 4b (Alibaba/ByteDance news), 4c (AI health news), and 7 (dedup) still use `web_search` as before.

---

### Step 2: Product Hunt (AI-focused, Top 3–5)

Goal: Get the **top 3–5 AI-related products** from today's Product Hunt leaderboard.

**Data source**: Use `prefetch.producthunt.markdown` directly. Fallback: `web_fetch` on `https://www.producthunt.com/feed` only if prefetch errored.

1. From the markdown, pick the **top 3–5 products that are AI-related** (AI tools, LLM wrappers, ML infra, AI agents, AIGC, etc.). If fewer than 3 AI products exist, include top overall products to fill the gap.
2. For each product, collect: product name, one-line tagline, upvote count (if available), direct link `https://www.producthunt.com/posts/{slug}`.
3. Write a brief personal note (1 sentence) on why it matters.

---

### Step 3: GitHub Trending (Top 5)

Goal: Get the **top 5 repositories** from GitHub Trending (daily).

**Data source**: Use `prefetch.github_trending` array directly. Each item has `name`, `description`, `language`, `stars_today`, `total_stars`, `url`. Fallback: `web_fetch` on `https://github.com/trending?since=daily` only if prefetch errored.

1. Use the top 5 repos from prefetch data.
2. Add a brief note on relevance to the user's interests (AI agents, TypeScript, Python, LangChain, medical tech, etc.) if applicable.

---

### Step 4: Fetch & Curate News and Podcasts

This is the most editorial step. Gather news from multiple sources, then apply strict curation rules.

#### 4a: Google News — Breaking / Must-Know Stories

**Data source**: Use `prefetch.google_news` array directly (each item has `title`, `link`, `published`). Fallback: `web_fetch` on `https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans` only if prefetch errored.

1. Scan the titles for **major domestic and international events** that a tech professional in China should know about. Think: geopolitical shifts, major policy changes, natural disasters, significant economic events, landmark tech regulations.
2. Only include stories that are genuinely significant — skip routine political coverage and soft news.

#### 4b: Alibaba & ByteDance Corporate News

1. `web_search` for `阿里巴巴 新闻 today {YYYY-MM-DD}` or similar time-scoped query.
2. `web_search` for `字节跳动 新闻 today {YYYY-MM-DD}` or similar time-scoped query.
3. Look for: earnings reports, major product launches, leadership changes, regulatory actions, acquisitions, layoffs, stock-moving events.
4. If nothing material, skip this sub-section entirely — do NOT pad with trivial news.

#### 4c: AI Health News

1. `web_search` for `AI coding news today` and `AI healthcare latest` in English.
2. Look for: new FDA approvals for AI medical devices, major research breakthroughs (e.g., new foundation models for clinical data), notable funding rounds in digital health AI, regulatory developments.

#### 4d: Curation Rules (MUST follow)

Before finalizing the news list, apply these filters strictly:

- **Timeliness**: The event MUST have happened today or be about to happen imminently. Do not include stories from yesterday or earlier unless they broke overnight and are still developing.
- **Significance**: Would the user want to be interrupted to learn about this? If not, skip it.
- **Deduplication**: Check against the user's recent Pulse outputs (use `conversation_search` with keyword "Pulse" to find recent briefings). Do NOT include a story that appeared in a recent Pulse. If unsure, include it but note it as a developing story.
- **Result**: Aim for **3–8 news items total** across all sub-categories. Fewer is better than padding.

#### 4e: Podcasts

**Data source**: Use `prefetch.podcasts` array directly (already filtered to 48h updates, each item has `name`, `url`, `episode_title`, `episode_url`, `episode_date`, `shownotes`). Prefetch now contains full episode details — no need to `web_fetch` individual episodes. Fallback: `web_fetch` each podcast URL only if prefetch errored.

Podcast list (maintained in `prefetch.py`):
硅谷101, 罗永浩的十字路口, 十字路口 Crossing, 晚点聊, 锦供参考, elsewhere别处发生, 张小珺Jùn｜商业访谈录

> To add a new podcast: `web_search` "{podcast name} site:xiaoyuzhoufm.com", find the URL, then add it to both `prefetch.py` PODCAST_URLS and this list.

---

### Step 5: Stock Data

**Data source**: Use `prefetch.stock.BABA` directly (`latest.price`, `latest.change`, `latest.change_pct`, `latest.date`, `chart`). The `chart` field contains the absolute path to a 90-day line chart PNG saved at `workspace/outputs/stock-{code}/{YYYY-MM-DD}.png`. Fallback: `python3 scripts/stock.py` only if prefetch errored.

If change_pct > 2% or < -2%, `web_search` for related news and report to the user.

---

### Step 6: Weather Data

**Data source**: Use `prefetch.weather` directly. Each city (Beijing/Shanghai/Nanjing) has `today` and `tomorrow` with `high`, `low`, `desc`, `emoji`. Fallback: `web_fetch` wttr.in only if prefetch errored.

Format: list (not table), per city show today + tomorrow with emoji, desc, low°C ~ high°C.

---

### Step 7: Check for Deduplication Against Recent Pulses

Before assembling the final output:

1. Use `conversation_search` with query `Pulse` to retrieve recent Pulse briefings.
2. Compare the news items you've gathered against those recent outputs.
3. Remove any duplicate stories. If a story is a meaningful UPDATE to a previous story, include it with a note like "🔄 进展更新".

---

### Step 8: Assemble Output

> **CRITICAL — OUTPUT STARTS WITH THE TITLE, NOTHING ELSE.**
> Your very first character of output MUST be `#`. No preamble, no status updates, no "数据已收集完毕", no "正在整理", no "以下是今日Pulse", no transition sentences of any kind. The Pulse title IS the start of your response.

Use the following template. All section titles and product/repo/news names MUST be hyperlinked directly — no separate "sources" section.

Language: Chinese (full-width punctuation: ，、：！？。）for prose; English for product names, repo names, and technical terms.

```markdown
# <font color="orange">📡 Pulse | {🌅 or 🌆} — {YYYY年M月D日}</font>

## <font color="orange">🚀 Product Hunts</font>

- **[Product Name](https://www.producthunt.com/posts/slug)** {upvotes if available}
简短介绍与点评（简体中文）。

- **[Product Name](URL)**
...

(5-10 items)

---

## <font color="orange">🔥 GitHub Trending</font>

- **[owner/repo](https://github.com/owner/repo)** ⭐ {total stars} (+{today})
Description。{Language}。简短点评（简体中文）。

- **[owner/repo](URL)** ⭐ ...
...

(5 items)

---

## <font color="orange">📰 News</font>

- **[Headline](URL)**
1–2 sentence summary（简体中文）。

- **[Headline](URL)**
...

(3–8 items, or fewer if it's a quiet day)

---

## <font color="orange">🎙️ Podcasts</font> (If exists updates)

- **[Channel Name - Episode Title](episode_url)** — Podcast Name
shownotes 摘要（不要原文，1-2 句简体中文重点总结，以及我为什么需要关注）。

- **[Episode Title](episode_url)** — Podcast Name
...

(1-3 items)

---

## <font color="orange">💰 Stock Market</font>

**{公司名} · {市场} {代码}**

- 最新价：<font color='red/green'>**{price} {货币}**</font>
- 涨跌：{emoji} <font color='red/green'>**{chg:+.2f} / {pct:+.2f}%**</font>
- 最新交易日：{date}
> Color red if change is positive, green if negative.

![BABA 90-Day](chart_path)
> **Don't forget** to **include the chart image**!
> The path of the image is in the `chart` field of the `prefetch.stock.BABA` object.

{if_anomaly}
⚠️ {abnormal_description}
- {news_link_list}
{/if_anomaly}

---

## <font color="orange">🌤️ Weather</font>

**🧱 北京**
- 今天：{emoji} {type}，{low}°C ~ {high}°C
- 明天：{emoji} {type}，{low}°C ~ {high}°C

**🏙️ 上海（徐汇）**
- 今天：{emoji} {type}，{low}°C ~ {high}°C
- 明天：{emoji} {type}，{low}°C ~ {high}°C

**🌿 南京**
- 今天：{emoji} {type}，{low}°C ~ {high}°C
- 明天：{emoji} {type}，{low}°C ~ {high}°C

{综合三座城市天气，带雨伞、洗车等建议}

---

> 本 Pulse 由 [Agentara](https://github.com/MagicCube/agentara) 生成
> [创建属于你的 Pulse](https://github.com/MagicCube/agentara)，别忘了 Star 哟！
```

### Formatting Rules

- **No preamble** ⚠️: Your response MUST start directly with `# 📡 Pulse | ...`. The `#` character must be literally the first character you output. Do NOT output any text before the title — no "数据已收集完毕", no "正在组装", no "以下是", no introductory sentences whatsoever. Violation of this rule is a critical formatting error.
- **Headings**: Use `#` for top-level, `##` for sections, and list for individual items. This maps well to Feishu / Word export.
- **Links**: Every product, repo, and news headline MUST be a clickable link in the `###` heading itself. Never put URLs in a footnote or "sources" block.
- **Weather emojis**: Use appropriate weather emojis inline with the weather type.
- **Brevity**: Each item's commentary should be 1–2 sentences max. The entire Pulse should be scannable in under 2 minutes.
- **No filler**: If a section has nothing noteworthy, include a one-liner like "今天暂无重大新闻" rather than padding.
- **Chinese punctuation**: All Chinese prose uses full-width punctuation (，。：！？、）。
- **Do NOT use citations or `` tags**: Pulse is a briefing, not a research report. Source attribution is handled by the hyperlinks in headings.
- **No duplication**: Do not include the same news item in the same day.
- **Stock section**: No tables, no charts. Plain text list format only. If market is closed (pre-market / weekend), note the last closing price and state "（已收盘）".
