# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "aiohttp",
#     "akshare",
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

Single-source debugging (from pulse/):

    uv run scripts/prefetch_sources/weather.py [City]
    uv run scripts/prefetch_sources/news.py
    uv run scripts/prefetch_sources/stock.py
    uv run scripts/prefetch_sources/github.py
    uv run scripts/prefetch_sources/producthunt.py
    uv run scripts/prefetch_sources/podcasts.py
"""

import asyncio
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import aiohttp

from prefetch_sources.common import TIMEOUT
from prefetch_sources.github import fetch_agentara_github_stars, fetch_github_trending
from prefetch_sources.news import fetch_google_news_rss
from prefetch_sources.podcasts import fetch_podcasts
from prefetch_sources.producthunt import fetch_producthunt
from prefetch_sources.stock import fetch_stock_sync, generate_stock_chart
from prefetch_sources.weather import fetch_weather


async def main():
    t0 = time.time()
    errors = {}

    async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
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

        github_token = os.environ.get("GITHUB_OAUTH_TOKEN")
        stars_future = None
        if github_token:
            stars_future = fetch_agentara_github_stars(session, github_token)

        loop = asyncio.get_event_loop()
        stock_future = loop.run_in_executor(ThreadPoolExecutor(1), fetch_stock_sync)

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

        agentara_stars = None
        if stars_future is not None:
            try:
                agentara_stars = await stars_future
            except Exception:
                pass

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
        "agentara_stars": agentara_stars,
        "errors": errors,
    }

    stock_output = []
    for entry in stock_results:
        data = entry.get("data", {})
        if isinstance(data, dict) and "error" not in data:
            all_rows = data.pop("_all_rows", [])
            chart_path = generate_stock_chart(entry["symbol"], entry["name"], all_rows)
            data["chart"] = chart_path
        stock_output.append(entry)
    output["stock"] = stock_output

    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    asyncio.run(main())
