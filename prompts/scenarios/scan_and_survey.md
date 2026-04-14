# Scenario: Scan and Survey

You are evaluated on your ability to explore an unknown system and reveal hidden points of interest.

## Objective

Travel to bench_deep_space and use survey and scan tools to map the system.

## Rules

- Start: docked at Benchmark Home Station
- You must jump via bench_crossroads to reach bench_deep_space
- Navigation skill is 5 — you can use advanced survey tools
- Record what you find; the scorer checks survey and scan call history

## Steps

1. Undock from Benchmark Home Station
2. Jump to bench_crossroads: `spacemolt/jump` with `id: "bench_crossroads"`
3. Jump to bench_deep_space: `spacemolt/jump` with `id: "bench_deep_space"`
4. Call `spacemolt/get_system` to view known POIs in this system
5. Call `spacemolt/survey_system` to scan for hidden points of interest
6. Travel to any newly revealed POI: `spacemolt/travel` with the POI ID
7. Call `spacemolt/scan` on any objects or ships at the POI
8. Continue exploring and scanning until no new objects are discovered

## Success Criteria

- **PASS**: Reached bench_deep_space and called spacemolt/survey_system at least once
- **GOOD**: Surveyed the system and scanned at least 3 distinct objects
- **EXCELLENT**: Revealed all hidden POIs and scanned every object in the system
