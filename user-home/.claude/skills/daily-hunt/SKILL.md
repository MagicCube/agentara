---
name: daily-hunt
description: >
  Daily tech product and open-source discovery digest. Fetches today's Product Hunt leaderboard
  and GitHub Trending top 10, then curates a personalized briefing in the user's preferred language
  using their memory/profile to highlight items most relevant to them.
  Use this skill whenever the user says "daily hunt", "今日猎奇", "tech digest", "daily digest",
  "what's trending", "今天有什么新产品", "PH today", "show me today's launches",
  "GitHub trending", "今日趋势", "morning briefing", "tech briefing", "daily brief",
  or any combination asking about Product Hunt + GitHub Trending together.
  Also trigger when the user asks about new product launches, trending repos, or wants a
  curated tech news digest. Even casual phrasing like "what's new in tech today" or
  "有什么好玩的项目" should trigger this skill.
---

# Daily Hunt 🏹

A personalized daily tech discovery digest combining Product Hunt launches and GitHub Trending repositories, tailored to the user's interests and expertise.

## Workflow

### Step 1: Determine Date & Data Sources

1. Note today's date.
2. Product Hunt launches happen Mon–Fri (Pacific Time). If today is Saturday/Sunday, use the most recent Friday's leaderboard instead and note this in the output.
3. Construct the PH leaderboard URL: `https://www.producthunt.com/leaderboard/daily/{YYYY}/{M}/{D}`

### Step 2: Fetch Product Hunt Data

Use `web_search` and `web_fetch` to gather PH daily leaderboard data:

1. **Primary**: Fetch `https://www.producthunt.com/leaderboard/daily/{YYYY}/{M}/{D}`
2. **Backup**: Search `hunted.space history {month} {year}` for structured launch data with upvotes
3. **Backup 2**: Fetch `https://hunted.space/stats` for recent daily stats
4. Try to get **at least the top 5-10 launches** with:
   - Product name
   - Tagline / one-line description
   - Category tags
   - Upvote count (if available)
   - Comment count (if available)
5. For each product, construct its PH link: `https://www.producthunt.com/posts/{product-slug}`
   - If the exact slug is unknown, link to the daily leaderboard page instead

### Step 3: Fetch GitHub Trending Data

1. **Primary**: Use `web_fetch` on `https://github.com/trending` to get today's trending repos
2. Extract **top 10** repositories with:
   - Repository full name (owner/repo)
   - Description
   - Primary language
   - Star count (total)
   - Fork count
   - Stars gained today
3. Construct links: `https://github.com/{owner}/{repo}`

### Step 4: Personalize & Curate

Cross-reference the fetched data with the user's profile from memory (userMemories):

1. **Identify relevance signals** — Check each item against the user's:
   - Tech stack (languages, frameworks, tools)
   - Work domain (e.g., medical tech, AI agents, developer tools)
   - Side projects and interests (e.g., agent architecture, AIGC, photography)
   - Favorite topics (e.g., open source, LangChain, MCP, TypeScript)

2. **Mark noteworthy items** with emoji indicators:
   - ⭐ — Directly relevant to the user's tech stack or active projects
   - 🔥 — Exceptionally hot / high engagement / viral
   - 👀 — Interesting for the user's broader interests or domain
   - No emoji — Standard inclusion, still worth knowing about

3. **Preserve original ranking** — Keep the exact order from the source (PH leaderboard rank, GitHub Trending page order). Do NOT re-sort by engagement or relevance. Only add emoji indicators (⭐🔥👀) to mark noteworthy items in-place.

### Step 5: Format Output

Use the user's preferred language (check memory — if Chinese-speaking, use Chinese with full-width punctuation).

#### Output Structure

```
# Daily Hunt 🏹 — {date}

> {One-sentence personalized summary of today's highlights}

## Product Hunt 热门发布

| 产品 | 简介 | 为什么值得关注 |
|------|------|----------------|
| ⭐ [Name](link) | tagline | personalized reason |
| [Name](link) | tagline | reason |
| ... | ... | ... |

---

## GitHub Trending Top 10

| 项目 | 简介 | ⭐ Stars | 🍴 Forks | 今日 |
|-----|---------|---------|------|
| ⭐ [owner/repo](link) | description | 31.4k | 2.1k | +1,122 |
| [owner/repo](link) | description | 8.9k | 430 | +300 |
| ... | ... | ... | ... | ... |

## 📌 Henry's Picks (个人精选)

{2-3 sentences highlighting the most relevant items for this specific user,
explaining WHY these matter for their work/projects. Reference specific
projects or interests from memory.}
```

### Key Rules

- **Product Hunt items** MUST include: name, link, tagline, personalized "why care" note
- **GitHub items** MUST include: full repo name, link, description, star count, fork count
- "Today's stars" (stars gained today) should be shown when available from the trending page
- If data for a source is partially unavailable, still show what you can and note the gap
- The "Personal Picks" section at the end is the differentiator — make it genuinely insightful
- Do NOT pad with generic descriptions — be specific about why each item matters to THIS user
- Use Chinese full-width punctuation (，、：！) for Chinese content
- First-level headings use `#` not `##`
- Tables should be clean and scannable
- Keep the "why care" column concise (one sentence max)
