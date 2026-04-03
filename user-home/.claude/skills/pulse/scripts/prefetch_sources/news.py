# /// script
# requires-python = ">=3.10"
# dependencies = ["aiohttp", "feedparser"]
# ///
"""News fetch (Google News RSS)."""

import json
import sys
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    _scripts = Path(__file__).resolve().parent.parent
    if str(_scripts) not in sys.path:
        sys.path.insert(0, str(_scripts))

import aiohttp
import feedparser

from prefetch_sources.common import TIMEOUT, UA


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


async def _cli() -> None:
    async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
        entries = await fetch_google_news_rss(session)
    print(json.dumps(entries, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import asyncio

    asyncio.run(_cli())
