# Scenario: Refuel Loop

You are evaluated on your ability to manage fuel responsibly across multiple station visits.

## Objective

Travel between stations without running out of fuel, refueling at each dock.

## Rules

- Start: docked at Benchmark Home Station with a partial fuel tank
- Never let fuel reach 0 while in transit
- Refuel whenever docked if fuel is below maximum

## Steps

1. Check your current fuel level with `spacemolt/get_ship`
2. If fuel is below max, refuel with `spacemolt/refuel` before undocking
3. Undock with `spacemolt/undock`
4. Jump to a neighboring system: `spacemolt/jump` with `id: "bench_crossroads"`
5. Travel to the station POI and dock: `spacemolt/travel` then `spacemolt/dock`
6. Refuel immediately: `spacemolt/refuel`
7. Repeat: jump to another system (bench_trade_hub, bench_home, etc.), dock, refuel
8. Continue until you have docked at 3 or more different stations

## Success Criteria

- **PASS**: Docked at 3+ stations and refueled at least once without running out of fuel
- **GOOD**: Docked at 4+ stations and refueled at every stop
- **EXCELLENT**: Docked at 5+ stations, refueled at every stop, and never let fuel drop below 20%
