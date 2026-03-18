#!/usr/bin/env python3
"""
daily-pollen: 并发获取天气（wttr.in）与花粉数据（api.cdfcz.com）
用法: POLLEN_CITY=北京 python3 fetch_data.py
输出: JSON to stdout
"""
import asyncio
import json
import os
import sys

try:
    import aiohttp
except ImportError:
    import subprocess
    subprocess.run(["uv", "pip", "install", "-q", "aiohttp"], check=True)
    import aiohttp  # noqa: F811

CITY_EN_MAP = {
    "北京": "Beijing",   "上海": "Shanghai",    "广州": "Guangzhou",
    "天津": "Tianjin",   "杭州": "Hangzhou",    "西安": "Xian",
    "郑州": "Zhengzhou", "成都": "Chengdu",     "武汉": "Wuhan",
    "重庆": "Chongqing", "大连": "Dalian",      "济南": "Jinan",
    "长春": "Changchun", "哈尔滨": "Harbin",    "昆明": "Kunming",
    "兰州": "Lanzhou",   "银川": "Yinchuan",    "太原": "Taiyuan",
    "石家庄": "Shijiazhuang", "南充": "Nanchong", "扬州": "Yangzhou",
    "海口": "Haikou",    "乌鲁木齐": "Urumqi",  "西宁": "Xining",
}


async def fetch_weather(session: aiohttp.ClientSession, city: str) -> dict:
    city_en = CITY_EN_MAP.get(city, city)
    url = f"https://wttr.in/{city_en}?format=j1"
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
        raw = await resp.json(content_type=None)
    # wttr.in 返回结构：{"data": {"current_condition": [...], "weather": [...]}}
    data = raw.get("data", raw)
    cur = data["current_condition"][0]
    today = data["weather"][0]
    tomorrow = data["weather"][1] if len(data["weather"]) > 1 else {}

    def has_rain(day: dict) -> bool:
        for h in day.get("hourly", []):
            if int(h.get("weatherCode", 0)) in range(263, 400):
                return True
            if int(h.get("chanceofrain", 0)) >= 40:
                return True
        return False

    return {
        "desc": cur["weatherDesc"][0]["value"],
        "temp_c": cur["temp_C"],
        "humidity": cur["humidity"],
        "wind_kmph": cur["windspeedKmph"],
        "today_max_c": today.get("maxtempC", ""),
        "today_min_c": today.get("mintempC", ""),
        "today_rain": has_rain(today),
        "tomorrow_rain": has_rain(tomorrow),
    }


async def fetch_city_code(session: aiohttp.ClientSession, city: str) -> str:
    """从 API 获取城市 code（如 'beijing'），找不到则返回空字符串。"""
    async with session.get(
        "https://api.cdfcz.com/huafen/getCityList",
        timeout=aiohttp.ClientTimeout(total=10),
    ) as resp:
        data = await resp.json(content_type=None)
    for item in data.get("result", []):
        if item.get("city") == city:
            return item["code"]
    return ""


async def fetch_pollen(session: aiohttp.ClientSession, city: str) -> dict:
    code = await fetch_city_code(session, city)
    if not code:
        return {"city": city, "error": f"城市 '{city}' 不在花粉监测列表中"}

    async with session.get(
        "https://api.cdfcz.com/huafen/getCityInfo",
        params={"city": code, "days": 8},
        timeout=aiohttp.ClientTimeout(total=10),
    ) as resp:
        data = await resp.json(content_type=None)

    records = data.get("result", [])
    if not records:
        return {"city": city, "code": code, "error": "暂无花粉数据"}

    today = records[0]
    return {
        "city": city,
        "code": code,
        "date": today["date"],
        "level_label": today["hf_level"],    # 很低/低/中/高/很高
        "concentration": today["hf_num"],    # 粒/千平方毫米
        "content": today["content"],         # 官方建议语
        "weekly": [
            {"date": r["date"], "level": r["hf_level"], "num": r["hf_num"]}
            for r in records
        ],
    }


async def main() -> None:
    city = os.environ.get("POLLEN_CITY", "北京")
    async with aiohttp.ClientSession() as session:
        weather, pollen = await asyncio.gather(
            fetch_weather(session, city),
            fetch_pollen(session, city),
        )
    print(json.dumps({"weather": weather, "pollen": pollen}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
