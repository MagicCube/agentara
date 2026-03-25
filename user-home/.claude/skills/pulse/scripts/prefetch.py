# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "aiohttp",
#     "feedparser",
#     "requests",
#     "readability-lxml",
#     "markdownify",
#     "matplotlib",
# ]
# ///
"""
Pulse Prefetch — parallel data fetching for all scriptable sources.
Outputs a single JSON blob to stdout.

Usage:
    uv run scripts/prefetch.py
"""

import asyncio
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import aiohttp
import feedparser
import requests
from markdownify import markdownify as md
from readability import Document

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
TIMEOUT = aiohttp.ClientTimeout(total=15)

WEATHER_EMOJI = {
    "Sunny": "☀️",
    "Clear": "☀️",
    "Partly Cloudy": "⛅",
    "Partly cloudy": "⛅",
    "Cloudy": "☁️",
    "Overcast": "☁️",
    "Light rain": "🌧️",
    "Light rain shower": "🌧️",
    "Moderate rain": "🌧️🌧️",
    "Heavy rain": "🌧️🌧️",
    "Moderate or heavy rain shower": "🌧️🌧️",
    "Patchy light rain": "🌦️",
    "Light drizzle": "🌦️",
    "Patchy rain possible": "🌦️",
    "Patchy rain nearby": "🌦️",
    "Light snow": "❄️",
    "Moderate snow": "❄️",
    "Heavy snow": "🌨️",
    "Blizzard": "🌨️",
    "Thundery outbreaks possible": "⛈️",
    "Thunderstorm": "⛈️",
    "Moderate or heavy rain with thunder": "⛈️",
    "Fog": "🌫️",
    "Mist": "🌫️",
    "Haze": "🌫️",
}

PODCAST_URLS = [
    ("硅谷101", "https://www.xiaoyuzhoufm.com/podcast/5e5c52c9418a84a04625e6cc"),
    (
        "罗永浩的十字路口",
        "https://www.xiaoyuzhoufm.com/podcast/68981df29e7bcd326eb91d88",
    ),
    (
        "十字路口 Crossing",
        "https://www.xiaoyuzhoufm.com/podcast/60502e253c92d4f62c2a9577",
    ),
    ("晚点聊", "https://www.xiaoyuzhoufm.com/podcast/61933ace1b4320461e91fd55"),
    ("锦供参考", "https://www.xiaoyuzhoufm.com/podcast/69a6aba3de6dd3793a39e06b"),
    (
        "elsewhere别处发生",
        "https://www.xiaoyuzhoufm.com/podcast/68ff657d9c745a6e69da8fcf",
    ),
    (
        "张小珺Jùn｜商业访谈录",
        "https://www.xiaoyuzhoufm.com/podcast/626b46ea9cbbf0451cf5a962",
    ),
]


# ---------------------------------------------------------------------------
# Fetchers
# ---------------------------------------------------------------------------


async def fetch_weather(session: aiohttp.ClientSession, city: str) -> dict:
    """Fetch weather from wttr.in and extract minimal fields."""
    url = f"https://wttr.in/{city}?format=j1"
    async with session.get(url) as resp:
        data = await resp.json(content_type=None)

    result = {}
    for i, label in enumerate(["today", "tomorrow"]):
        day = data["weather"][i]
        # Use midday (index 4 = 12:00) for representative description
        desc = day["hourly"][4]["weatherDesc"][0]["value"].strip()
        emoji = WEATHER_EMOJI.get(desc, "🌡️")
        result[label] = {
            "high": int(day["maxtempC"]),
            "low": int(day["mintempC"]),
            "desc": desc,
            "emoji": emoji,
        }
    return result


async def fetch_producthunt(session: aiohttp.ClientSession) -> dict:
    """Fetch Product Hunt feed and extract readable markdown."""
    url = "https://www.producthunt.com/feed"
    headers = {"User-Agent": UA}
    async with session.get(url, headers=headers) as resp:
        html = await resp.text()
        status = resp.status

    try:
        doc = Document(html)
        readable_html = doc.summary()
        markdown = md(readable_html, strip=["img", "script", "style"])
        # Trim excessive whitespace
        markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()
        # Cap at ~8000 chars to avoid bloating JSON
        if len(markdown) > 8000:
            markdown = markdown[:8000] + "\n\n... (truncated)"
    except Exception:
        markdown = html[:8000] if html else ""

    return {"markdown": markdown, "status": status}


async def fetch_github_trending(session: aiohttp.ClientSession) -> list:
    """Parse GitHub Trending page for top 5 repos."""
    url = "https://github.com/trending?since=daily"
    async with session.get(url, headers={"User-Agent": UA}) as resp:
        html = await resp.text()

    repos = []
    # Each repo is in an <article class="Box-row">
    articles = re.split(r'<article\s+class="Box-row"', html)
    for article in articles[1:6]:  # top 5
        # Repo name: extract from stargazers/forks link (/owner/repo/stargazers)
        name_matches = re.findall(r'<a\s+href="(/[^"]+)"', article)
        full_name = ""
        for href in name_matches:
            parts = href.strip("/").split("/")
            # Match /owner/repo/stargazers or /owner/repo/forks
            if len(parts) == 3 and parts[2] in ("stargazers", "forks"):
                full_name = f"{parts[0]}/{parts[1]}"
                break
        if not full_name:
            # Fallback: look for /owner/repo pattern (2 segments, no special paths)
            for href in name_matches:
                parts = href.strip("/").split("/")
                if (
                    len(parts) == 2
                    and "?" not in href
                    and parts[0] not in ("login", "sponsors", "settings", "features")
                ):
                    full_name = "/".join(parts)
                    break
        if not full_name:
            continue

        # Description
        desc_match = re.search(
            r'<p\s+class="[^"]*">\s*(.*?)\s*</p>', article, re.DOTALL
        )
        desc = re.sub(r"<[^>]+>", "", desc_match.group(1)).strip() if desc_match else ""
        desc = desc.replace("&amp;", "&")

        # Language
        lang_match = re.search(r'itemprop="programmingLanguage">(.*?)<', article)
        lang = lang_match.group(1).strip() if lang_match else ""

        # Stars today
        stars_today_match = re.search(r"([\d,]+)\s+stars\s+today", article)
        stars_today = (
            stars_today_match.group(1).replace(",", "") if stars_today_match else "0"
        )

        # Total stars — look for stargazers link with count
        total_match = re.findall(
            r'href="/[^"]+/stargazers"[^>]*>\s*(?:<[^>]*>\s*)*([\d,]+)\s*', article
        )
        if not total_match:
            total_match = re.findall(
                r'class="Link[^"]*"[^>]*>\s*([\d,]+)\s*</a>', article
            )
        total_stars = total_match[0].replace(",", "") if total_match else ""

        repos.append(
            {
                "name": full_name,
                "description": desc,
                "language": lang,
                "stars_today": int(stars_today),
                "total_stars": total_stars,
                "url": f"https://github.com/{full_name}",
            }
        )

    return repos


async def fetch_google_news_rss(session: aiohttp.ClientSession) -> list:
    """Fetch Google News RSS and parse with feedparser."""
    url = "https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans"
    async with session.get(url, headers={"User-Agent": UA}) as resp:
        text = await resp.text()

    feed = feedparser.parse(text)
    entries = []
    for entry in feed.entries[:20]:
        entries.append(
            {
                "title": entry.get("title", ""),
                "link": entry.get("link", ""),
                "published": entry.get("published", ""),
            }
        )
    return entries


async def fetch_single_podcast(
    session: aiohttp.ClientSession, name: str, url: str
) -> dict | None:
    """Fetch a single podcast page and extract latest episode from __NEXT_DATA__."""
    try:
        async with session.get(url, headers={"User-Agent": UA}) as resp:
            html = await resp.text()

        # Extract __NEXT_DATA__ JSON blob
        nd_match = re.search(r"__NEXT_DATA__[^>]*>(.*?)</script>", html)
        if not nd_match:
            return None

        next_data = json.loads(nd_match.group(1))
        podcast_data = (
            next_data.get("props", {}).get("pageProps", {}).get("podcast", {})
        )
        episodes = podcast_data.get("episodes", [])
        if not episodes:
            return None

        ep = episodes[0]
        title = ep.get("title", "").strip()
        eid = ep.get("eid", "")
        pub_date_str = ep.get("pubDate", "")
        shownotes = ep.get("shownotes") or ep.get("description") or ""
        shownotes = re.sub(r"<[^>]+>", "", shownotes).strip()  # strip HTML tags

        if not title or not eid:
            return None

        # Check if within 48 hours
        if pub_date_str:
            try:
                pub_date = datetime.fromisoformat(pub_date_str.replace("Z", "+00:00"))
                if pub_date < datetime.now(timezone.utc) - timedelta(hours=48):
                    return None
            except (ValueError, TypeError):
                pass

        episode_url = f"https://www.xiaoyuzhoufm.com/episode/{eid}"

        return {
            "name": name,
            "url": url,
            "episode_title": title,
            "episode_url": episode_url,
            "episode_date": pub_date_str,
            "shownotes": shownotes[:500],
        }
    except Exception:
        return None


async def fetch_podcasts(session: aiohttp.ClientSession) -> list:
    """Fetch all podcasts in parallel, return those updated within 48h."""
    tasks = [fetch_single_podcast(session, name, url) for name, url in PODCAST_URLS]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return [r for r in results if r and not isinstance(r, Exception)]


STOCK_INDICES = [
    {"symbol": "sh000001", "name": "SSE Composite", "name_cn": "上证指数", "market": "SSE", "source": "sina"},
    {"symbol": "sz399001", "name": "SZSE Component", "name_cn": "深证成指", "market": "SZSE", "source": "sina"},
    {"symbol": "^ndq", "name": "NASDAQ Composite", "name_cn": "纳斯达克综合", "market": "NASDAQ", "source": "stooq"},
    {"symbol": "^dji", "name": "Dow Jones", "name_cn": "道琼斯工业", "market": "NYSE", "source": "stooq"},
]


def _fetch_sina_index(s: requests.Session, symbol: str) -> dict:
    """Fetch Chinese index historical data via Sina Finance K-line API."""
    url = (
        "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/"
        f"CN_MarketData.getKLineData?symbol={symbol}&scale=240&ma=no&datalen=45"
    )
    last_err = None
    for attempt in range(3):
        try:
            r = s.get(url, timeout=12)
            r.raise_for_status()
            data = json.loads(r.text)
            if not data:
                raise ValueError(f"No data returned for {symbol}")

            rows = []
            for item in data:
                try:
                    rows.append(
                        {
                            "date": item["day"][:10],
                            "open": float(item["open"]),
                            "high": float(item["high"]),
                            "low": float(item["low"]),
                            "close": float(item["close"]),
                            "vol": float(item.get("volume", 0)),
                        }
                    )
                except (ValueError, KeyError):
                    continue

            if not rows:
                raise ValueError(f"No rows parsed for {symbol}")

            _compute_changes(rows)
            latest = rows[-1]
            return {
                "latest": {
                    "price": latest["close"],
                    "change": latest["chg"],
                    "change_pct": latest["pct"],
                    "date": latest["date"],
                },
                "rows": rows[-2:],
                "_all_rows": rows,
            }
        except Exception as e:
            last_err = e
            time.sleep(2 * (attempt + 1))

    return {"error": str(last_err)}


def _fetch_stooq_index(s: requests.Session, symbol: str) -> dict:
    """Fetch US index historical data via stooq.com."""
    end = datetime.today().strftime("%Y%m%d")
    start = (datetime.today() - timedelta(days=90)).strftime("%Y%m%d")
    url = f"https://stooq.com/q/d/l/?s={symbol}&d1={start}&d2={end}&i=d"

    last_err = None
    for attempt in range(3):
        try:
            r = s.get(url, timeout=12)
            r.raise_for_status()
            lines = r.text.strip().split("\n")
            if len(lines) < 2 or "No data" in r.text:
                raise ValueError(f"No data returned for {symbol}")

            rows = []
            for line in lines[1:]:
                parts = line.strip().split(",")
                if len(parts) < 5:
                    continue
                try:
                    rows.append(
                        {
                            "date": parts[0],
                            "open": float(parts[1]),
                            "high": float(parts[2]),
                            "low": float(parts[3]),
                            "close": float(parts[4]),
                            "vol": (
                                float(parts[5]) if len(parts) > 5 and parts[5] else 0.0
                            ),
                        }
                    )
                except ValueError:
                    continue

            if not rows:
                raise ValueError(f"No rows parsed for {symbol}")

            _compute_changes(rows)
            latest = rows[-1]
            return {
                "latest": {
                    "price": latest["close"],
                    "change": latest["chg"],
                    "change_pct": latest["pct"],
                    "date": latest["date"],
                },
                "rows": rows[-2:],
                "_all_rows": rows,
            }
        except Exception as e:
            last_err = e
            time.sleep(2 * (attempt + 1))

    return {"error": str(last_err)}


def _compute_changes(rows: list[dict]) -> None:
    """Compute day-over-day change and percentage for each row in place."""
    for i, row in enumerate(rows):
        if i == 0:
            row["pct"] = 0.0
            row["chg"] = 0.0
        else:
            prev = rows[i - 1]["close"]
            row["pct"] = round((row["close"] - prev) / prev * 100, 4) if prev else 0.0
            row["chg"] = round(row["close"] - prev, 4)


def fetch_stock_sync() -> list:
    """Fetch all indices: Sina for Chinese, stooq for US."""
    s = requests.Session()
    s.trust_env = False
    s.headers["User-Agent"] = UA

    results = []
    for idx in STOCK_INDICES:
        if idx["source"] == "sina":
            data = _fetch_sina_index(s, idx["symbol"])
        else:
            data = _fetch_stooq_index(s, idx["symbol"])
        results.append({
            "symbol": idx["symbol"],
            "name": idx["name"],
            "name_cn": idx["name_cn"],
            "market": idx["market"],
            "data": data,
        })
    return results


WORKSPACE = Path.home() / ".agentara" / "workspace"


def generate_stock_chart(symbol: str, name: str, rows: list[dict]) -> str | None:
    """Generate a 45-day line chart (3:2 aspect). Gradient fill: green=down, red=up."""
    import matplotlib
    import numpy as np

    matplotlib.use("Agg")
    import matplotlib.colors as mcolors
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap

    if len(rows) < 2:
        return None

    dates = [datetime.strptime(r["date"], "%Y-%m-%d") for r in rows]
    closes = [r["close"] for r in rows]
    latest = rows[-1]
    prev = rows[-2]["close"]
    change_pct = (latest["close"] - prev) / prev * 100 if prev else 0
    is_up = latest["close"] >= prev

    accent = "#2ECC71" if not is_up else "#E74C3C"
    fig, ax = plt.subplots(figsize=(7.5, 5), facecolor="white")
    ax.set_facecolor("white")

    y_base = min(closes) * 0.998
    y_max = max(closes)
    xlims = mdates.date2num([dates[0], dates[-1]])
    yv = np.linspace(0, 1, 80)
    zv = np.tile(yv.reshape(-1, 1), (1, 50))
    rgb = mcolors.to_rgba(accent)[:3]
    cmap = LinearSegmentedColormap.from_list(
        "stock_grad", [(*rgb, 0.02), (*rgb, 0.38)], N=256
    )
    ax.imshow(
        zv,
        cmap=cmap,
        aspect="auto",
        origin="lower",
        extent=[xlims[0], xlims[1], y_base, y_max],
        zorder=0,
    )
    ax.fill_between(dates, closes, y_max, color="white", linewidth=0, zorder=1)
    ax.plot(
        dates, closes, color=accent, linewidth=1.8, solid_capstyle="round", zorder=2
    )

    ax.scatter(
        [dates[-1]],
        [closes[-1]],
        color=accent,
        s=50,
        zorder=5,
        edgecolors="white",
        linewidths=1.5,
    )

    # Annotate latest price — no currency prefix for indices
    ax.annotate(
        f"{latest['close']:,.2f}  ({change_pct:+.2f}%)",
        xy=(dates[-1], closes[-1]),
        xytext=(-12, 14),
        textcoords="offset points",
        fontsize=11,
        fontweight="bold",
        color=accent,
        ha="right",
    )

    # Title
    ax.set_title(
        f"{name}  ·  45-Day",
        fontsize=14,
        fontweight="bold",
        color="#2C3E50",
        loc="left",
        pad=14,
    )

    ax.xaxis.set_major_locator(mdates.WeekdayLocator(byweekday=mdates.MO, interval=2))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
    ax.xaxis.set_minor_locator(mdates.WeekdayLocator(byweekday=mdates.MO))
    ax.tick_params(axis="x", labelsize=9, colors="#7F8C8D")
    ax.tick_params(axis="y", labelsize=9, colors="#7F8C8D")
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{x:,.0f}"))

    ax.grid(axis="y", linestyle="--", linewidth=0.5, alpha=0.4, color="#BDC3C7")
    ax.grid(axis="x", linestyle="--", linewidth=0.3, alpha=0.2, color="#BDC3C7")

    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("bottom", "left"):
        ax.spines[spine].set_color("#ECF0F1")

    y_min, y_max = min(closes), max(closes)
    margin = (y_max - y_min) * 0.12 or 1
    ax.set_ylim(y_min - margin, y_max + margin * 1.5)

    plt.tight_layout()

    today = datetime.today().strftime("%Y-%m-%d")
    safe_symbol = symbol.lstrip("^")
    out_dir = WORKSPACE / "outputs" / "stock"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{safe_symbol}-{today}.png"
    fig.savefig(out_path, dpi=180, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return str(out_path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


async def main():
    t0 = time.time()
    errors = {}

    async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
        # Launch all fetchers in parallel
        tasks = {
            "producthunt": fetch_producthunt(session),
            "github_trending": fetch_github_trending(session),
            "google_news": fetch_google_news_rss(session),
            "podcasts": fetch_podcasts(session),
            "weather_beijing": fetch_weather(session, "Beijing"),
            "weather_shanghai": fetch_weather(session, "Shanghai"),
            "weather_guangzhou": fetch_weather(session, "Guangzhou"),
            "weather_shenzhen": fetch_weather(session, "Shenzhen"),
            "weather_hangzhou": fetch_weather(session, "Hangzhou"),
            "weather_nanjing": fetch_weather(session, "Nanjing"),
        }

        # Stock is sync — run in executor
        loop = asyncio.get_event_loop()
        stock_future = loop.run_in_executor(ThreadPoolExecutor(1), fetch_stock_sync)

        # Gather async tasks
        keys = list(tasks.keys())
        results_list = await asyncio.gather(*tasks.values(), return_exceptions=True)
        async_results = {}
        for key, result in zip(keys, results_list):
            if isinstance(result, Exception):
                async_results[key] = None
                errors[key] = str(result)
            else:
                async_results[key] = result
                errors[key] = None

        # Await stock (now returns a list)
        try:
            stock_results = await stock_future
            stock_errors = [
                f"{r['symbol']}: {r['data']['error']}"
                for r in stock_results
                if isinstance(r.get("data"), dict) and "error" in r["data"]
            ]
            errors["stock"] = "; ".join(stock_errors) if stock_errors else None
        except Exception as e:
            stock_results = []
            errors["stock"] = str(e)

    # Assemble output
    output = {
        "fetched_at": datetime.now(timezone.utc).isoformat() + "Z",
        "duration_seconds": round(time.time() - t0, 2),
        "producthunt": async_results.get("producthunt"),
        "github_trending": async_results.get("github_trending"),
        "google_news": async_results.get("google_news"),
        "podcasts": async_results.get("podcasts"),
        "weather": {
            "Beijing": async_results.get("weather_beijing"),
            "Shanghai": async_results.get("weather_shanghai"),
            "Guangzhou": async_results.get("weather_guangzhou"),
            "Shenzhen": async_results.get("weather_shenzhen"),
            "Hangzhou": async_results.get("weather_hangzhou"),
            "Nanjing": async_results.get("weather_nanjing"),
        },
        "stock": {},
        "errors": errors,
    }

    # Generate stock charts for each index, then strip full rows from JSON
    stock_output = []
    for entry in stock_results:
        data = entry.get("data", {})
        if isinstance(data, dict) and "error" not in data:
            all_rows = data.pop("_all_rows", [])
            # Use English name for chart title (avoids CJK font issues)
            chart_path = generate_stock_chart(
                entry["symbol"], entry["name"], all_rows
            )
            data["chart"] = chart_path
        stock_output.append(entry)
    output["stock"] = stock_output

    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    print()  # trailing newline


if __name__ == "__main__":
    asyncio.run(main())
