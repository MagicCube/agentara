# Command Map

| Command | Endpoint | Required Flags | Optional Flags |
| --- | --- | --- | --- |
| `reverse-geocode` | `GET /v3/geocode/regeo` | `--location` | - |
| `geocode` | `GET /v3/geocode/geo` | `--address` | `--city` |
| `ip-location` | `GET /v3/ip` | `--ip` | - |
| `weather` | `GET /v3/weather/weatherInfo` | `--city` | `--extensions` (`base`/`all`) |
| `bike-route-coords` | `GET /v4/direction/bicycling` | `--origin`, `--destination` | - |
| `bike-route-address` | geocode x2 + bicycling | `--origin-address`, `--destination-address` | `--origin-city`, `--destination-city` |
| `walk-route-coords` | `GET /v3/direction/walking` | `--origin`, `--destination` | - |
| `walk-route-address` | geocode x2 + walking | `--origin-address`, `--destination-address` | `--origin-city`, `--destination-city` |
| `drive-route-coords` | `GET /v3/direction/driving` | `--origin`, `--destination` | - |
| `drive-route-address` | geocode x2 + driving | `--origin-address`, `--destination-address` | `--origin-city`, `--destination-city` |
| `transit-route-coords` | `GET /v3/direction/transit/integrated` | `--origin`, `--destination`, `--city`, `--cityd` | - |
| `transit-route-address` | geocode x2 + transit integrated | `--origin-address`, `--destination-address`, `--origin-city`, `--destination-city` | - |
| `distance` | `GET /v3/distance` | `--origins`, `--destination` | `--type` (`0`/`1`/`3`) |
| `poi-text` | `GET /v3/place/text` | `--keywords` | `--city`, `--citylimit` (`true`/`false`) |
| `poi-around` | `GET /v3/place/around` | `--location` | `--radius`, `--keywords` |
| `poi-detail` | `GET /v3/place/detail` | `--id` | - |

## Exit Codes
- `0`: success
- `2`: input or config error
- `3`: network / timeout / HTTP transport error
- `4`: AMap business error
- `5`: unexpected internal error

## API Key
- Required env var: `AMAP_MAPS_API_KEY`
