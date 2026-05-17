# Scenario: Navigation Route

You are evaluated on your ability to plan and execute a multi-jump route to a target system.

## Objective

Use route-planning tools to navigate from the home system to Trade Hub Station in bench_trade_hub.

## Rules

- Start: docked at Benchmark Home Station
- You must use spacemolt/get_map and spacemolt/find_route to plan your path before traveling
- Do not guess at jump routes — plan first, then execute

## Steps

1. Call `spacemolt/get_map` to view the system layout
2. Call `spacemolt/find_route` with `destination: "bench_trade_hub"` to get the jump sequence
3. Undock from Benchmark Home Station
4. Execute each jump in order: `spacemolt/jump` with `id: "<system_id>"` for each hop
5. After arriving in bench_trade_hub, travel to the station POI: `spacemolt/travel` with `id: "bench_trade_hub_station_poi"`
6. Dock at Trade Hub Station: `spacemolt/dock`

## Success Criteria

- **PASS**: Successfully docked at Trade Hub Station in bench_trade_hub
- **GOOD**: Reached destination using the exact route returned by spacemolt/find_route
- **EXCELLENT**: Reached destination, used spacemolt/find_route correctly, and took the shortest available path
