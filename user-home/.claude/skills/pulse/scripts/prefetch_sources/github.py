# /// script
# requires-python = ">=3.10"
# dependencies = ["aiohttp"]
# ///
"""GitHub Trending and optional Agentara star count."""

import json
import os
import re
import sys
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    _scripts = Path(__file__).resolve().parent.parent
    if str(_scripts) not in sys.path:
        sys.path.insert(0, str(_scripts))

import aiohttp

from prefetch_sources.common import TIMEOUT, UA


async def fetch_github_trending(session: aiohttp.ClientSession) -> list:
    """Parse GitHub Trending page for top 5 repos."""
    url = "https://github.com/trending?since=daily"
    async with session.get(url, headers={"User-Agent": UA}) as resp:
        html = await resp.text()

    repos = []
    articles = re.split(r'<article\s+class="Box-row"', html)
    for article in articles[1:6]:
        name_matches = re.findall(r'<a\s+href="(/[^"]+)"', article)
        full_name = ""
        for href in name_matches:
            parts = href.strip("/").split("/")
            if len(parts) == 3 and parts[2] in ("stargazers", "forks"):
                full_name = f"{parts[0]}/{parts[1]}"
                break
        if not full_name:
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

        desc_match = re.search(
            r'<p\s+class="[^"]*">\s*(.*?)\s*</p>', article, re.DOTALL
        )
        desc = re.sub(r"<[^>]+>", "", desc_match.group(1)).strip() if desc_match else ""
        desc = desc.replace("&amp;", "&")

        lang_match = re.search(r'itemprop="programmingLanguage">(.*?)<', article)
        lang = lang_match.group(1).strip() if lang_match else ""

        stars_today_match = re.search(r"([\d,]+)\s+stars\s+today", article)
        stars_today = (
            stars_today_match.group(1).replace(",", "") if stars_today_match else "0"
        )

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


async def fetch_agentara_github_stars(
    session: aiohttp.ClientSession, token: str
) -> int | None:
    """Fetch Agentara GitHub star count. Returns None on failure."""
    try:
        url = "https://api.github.com/repos/MagicCube/agentara"
        headers = {"Authorization": f"token {token}", "User-Agent": UA}
        async with session.get(url, headers=headers) as resp:
            data = await resp.json(content_type=None)
            return data.get("stargazers_count")
    except Exception:
        return None


async def _cli() -> None:
    out: dict = {}
    async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
        out["trending"] = await fetch_github_trending(session)
        token = os.environ.get("GITHUB_OAUTH_TOKEN")
        if token:
            out["agentara_stars"] = await fetch_agentara_github_stars(session, token)
        else:
            out["agentara_stars"] = None
            out["agentara_stars_note"] = "Set GITHUB_OAUTH_TOKEN to fetch star count."
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import asyncio

    asyncio.run(_cli())
