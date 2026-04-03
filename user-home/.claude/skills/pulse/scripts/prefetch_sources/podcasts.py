# /// script
# requires-python = ">=3.10"
# dependencies = ["aiohttp"]
# ///
"""小宇宙 podcast fetch."""

import asyncio
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    _scripts = Path(__file__).resolve().parent.parent
    if str(_scripts) not in sys.path:
        sys.path.insert(0, str(_scripts))

import aiohttp

from prefetch_sources.common import TIMEOUT, UA

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


async def fetch_single_podcast(
    session: aiohttp.ClientSession, name: str, url: str
) -> dict | None:
    """Fetch a single podcast page and extract latest episode from __NEXT_DATA__."""
    try:
        async with session.get(url, headers={"User-Agent": UA}) as resp:
            html = await resp.text()

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
        shownotes = re.sub(r"<[^>]+>", "", shownotes).strip()

        if not title or not eid:
            return None

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


async def _cli() -> None:
    async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
        items = await fetch_podcasts(session)
    print(json.dumps(items, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(_cli())
