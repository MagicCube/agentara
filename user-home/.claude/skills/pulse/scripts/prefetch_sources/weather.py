# /// script
# requires-python = ">=3.10"
# dependencies = ["aiohttp"]
# ///
"""Weather fetch (QWeather / 和风天气 v7 daily 3d)."""

import json
import os
import sys
from pathlib import Path

if __name__ == "__main__" and __package__ is None:
    _scripts = Path(__file__).resolve().parent.parent
    if str(_scripts) not in sys.path:
        sys.path.insert(0, str(_scripts))

import aiohttp
from prefetch_sources.common import TIMEOUT, UA

QWEATHER_API_BASE = "https://mf5huu93q3.re.qweatherapi.com"
QWEATHER_API_KEY = os.environ.get("QWEATHER_API_KEY")

# LocationID — same scheme as https://dev.qweather.com/docs/resource/glossary/#locationid
CITY_LOCATION_ID = {
    "Beijing": "101010100",
    "Shanghai": "101020100",
    "Guangzhou": "101280101",
    "Shenzhen": "101280601",
    "Hangzhou": "101210101",
    "Nanjing": "101190101",
}

_WEATHER_EMOJI_EXACT = {
    # English (legacy / mixed)
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
    # Chinese (QWeather textDay)
    "晴": "☀️",
    "多云": "⛅",
    "少云": "⛅",
    "阴": "☁️",
    "阵雨": "🌦️",
    "雷阵雨": "⛈️",
    "雷阵雨伴有冰雹": "⛈️",
    "小雨": "🌧️",
    "中雨": "🌧️🌧️",
    "大雨": "🌧️🌧️",
    "暴雨": "🌧️🌧️",
    "大暴雨": "🌧️🌧️",
    "特大暴雨": "🌧️🌧️",
    "冻雨": "🌧️",
    "雪": "❄️",
    "阵雪": "❄️",
    "小雪": "❄️",
    "中雪": "🌨️",
    "大雪": "🌨️",
    "暴雪": "🌨️",
    "雨雪天气": "🌨️",
    "雨夹雪": "🌨️",
    "阵雨夹雪": "🌨️",
    "雾": "🌫️",
    "浓雾": "🌫️",
    "强浓雾": "🌫️",
    "霾": "🌫️",
    "中度霾": "🌫️",
    "重度霾": "🌫️",
    "严重霾": "🌫️",
    "浮尘": "🌫️",
    "扬沙": "🌫️",
    "沙尘暴": "🌫️",
    "强沙尘暴": "🌫️",
    "大风": "💨",
    "飓风": "🌀",
    "热带风暴": "🌀",
    "龙卷风": "🌪️",
}

# Longer phrases first for substring match
_WEATHER_EMOJI_PARTIAL: list[tuple[str, str]] = [
    ("雷暴", "⛈️"),
    ("雷阵雨", "⛈️"),
    ("暴雨", "🌧️🌧️"),
    ("大雪", "🌨️"),
    ("暴雪", "🌨️"),
    ("冰雹", "🌨️"),
    ("雨夹雪", "🌨️"),
    ("沙尘暴", "🌫️"),
    ("雾霾", "🌫️"),
    ("浓雾", "🌫️"),
    ("小雪", "❄️"),
    ("中雪", "🌨️"),
    ("大雨", "🌧️🌧️"),
    ("中雨", "🌧️🌧️"),
    ("小雨", "🌧️"),
    ("阵雨", "🌦️"),
    ("阵雪", "❄️"),
    ("多云", "⛅"),
    ("阵雨夹雪", "🌨️"),
    ("雨雪", "🌨️"),
    ("霾", "🌫️"),
    ("雾", "🌫️"),
    ("雪", "❄️"),
    ("雨", "🌧️"),
    ("阴", "☁️"),
    ("云", "☁️"),
]


def _emoji_for_desc(desc: str) -> str:
    if not desc:
        return "🌡️"
    if desc in _WEATHER_EMOJI_EXACT:
        return _WEATHER_EMOJI_EXACT[desc]
    for needle, emoji in _WEATHER_EMOJI_PARTIAL:
        if needle in desc:
            return emoji
    return "🌡️"


async def fetch_weather(session: aiohttp.ClientSession, city: str) -> dict:
    """Fetch 3-day forecast from QWeather; return today + tomorrow summary."""
    location = CITY_LOCATION_ID.get(city)
    if location is None:
        raise ValueError(f"Unknown city for weather: {city!r}")

    url = f"{QWEATHER_API_BASE}/v7/weather/3d"
    headers = {
        "User-Agent": UA,
        "X-QW-Api-Key": QWEATHER_API_KEY,
    }
    async with session.get(url, params={"location": location}, headers=headers) as resp:
        resp.raise_for_status()
        data = await resp.json(content_type=None)

    code = data.get("code")
    if str(code) != "200":
        raise RuntimeError(f"QWeather API code={code!r} body={data!r}")

    daily = data.get("daily") or []
    if len(daily) < 2:
        raise RuntimeError(f"QWeather 3d response too short: {daily!r}")

    result: dict = {}
    for i, label in enumerate(["today", "tomorrow"]):
        day = daily[i]
        desc = (day.get("textDay") or "").strip()
        emoji = _emoji_for_desc(desc)
        result[label] = {
            "high": int(day["tempMax"]),
            "low": int(day["tempMin"]),
            "desc": desc,
            "emoji": emoji,
        }
    return result


async def _cli() -> None:
    city = sys.argv[1] if len(sys.argv) > 1 else "Beijing"
    if city not in CITY_LOCATION_ID:
        print(
            json.dumps(
                {"error": f"Unknown city {city!r}; known: {sorted(CITY_LOCATION_ID)}"},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        sys.exit(1)
    async with aiohttp.ClientSession(timeout=TIMEOUT) as session:
        data = await fetch_weather(session, city)
    print(json.dumps({"city": city, "weather": data}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    import asyncio

    asyncio.run(_cli())
