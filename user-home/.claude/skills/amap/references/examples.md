# Examples

## Geocode
```bash
AMAP_MAPS_API_KEY=your_key bun scripts/amap.ts geocode --address "北京市朝阳区阜通东大街6号" --city 北京
```

## Reverse Geocode
```bash
AMAP_MAPS_API_KEY=your_key bun scripts/amap.ts reverse-geocode --location 116.481488,39.990464
```

## Bike Route by Address
```bash
AMAP_MAPS_API_KEY=your_key bun scripts/amap.ts bike-route-address \
  --origin-address "北京市朝阳区阜通东大街6号" \
  --destination-address "北京市海淀区上地十街10号" \
  --origin-city 北京 --destination-city 北京
```

## Transit Route by Coordinates
```bash
AMAP_MAPS_API_KEY=your_key bun scripts/amap.ts transit-route-coords \
  --origin 116.481488,39.990464 \
  --destination 116.315613,39.998935 \
  --city 北京 --cityd 北京
```

## POI Text Search
```bash
AMAP_MAPS_API_KEY=your_key bun scripts/amap.ts poi-text --keywords "咖啡" --city 110108 --citylimit true
```

## Distance
```bash
AMAP_MAPS_API_KEY=your_key bun scripts/amap.ts distance \
  --origins 116.481488,39.990464\|116.434307,39.90909 \
  --destination 116.315613,39.998935 \
  --type 1
```
