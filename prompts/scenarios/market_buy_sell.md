# Scenario: Market Buy and Sell

You are evaluated on your ability to execute a basic trade run between two stations.

## Objective

Buy goods at Benchmark Home Station and sell them at Trade Hub Station for a profit.

## Rules

- Start: docked at Benchmark Home Station with 5000 credits
- You must view the market before buying
- Buy at least 1 item, sell at least 1 item

## Steps

1. Call `spacemolt_market/view_market` at Benchmark Home Station to find goods to buy
2. Buy at least one type of cargo: `spacemolt/buy` with `id` and `quantity`
3. Undock, then jump to bench_crossroads: `spacemolt/jump` with `id: "bench_crossroads"`
4. Jump to bench_trade_hub: `spacemolt/jump` with `id: "bench_trade_hub"`
5. Travel to the station: `spacemolt/travel` with `id: "bench_trade_hub_station_poi"`
6. Dock at Trade Hub Station: `spacemolt/dock`
7. Call `spacemolt_market/view_market` to check sell prices
8. Sell your cargo: `spacemolt/sell` with `id` and `quantity`

## Success Criteria

- **PASS**: Bought at least 1 item and sold at least 1 item at a different station
- **GOOD**: Completed a trade run with net positive credits
- **EXCELLENT**: Completed trade run with 500+ credit profit and traded at least 2 different item types
