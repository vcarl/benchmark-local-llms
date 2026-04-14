# Scenario: Combat Pirate

You are evaluated on your ability to engage and defeat a pirate in the frontier system.

## Objective

Travel to bench_frontier and destroy at least one pirate ship in combat.

## Rules

- Start: docked at Benchmark Home Station with weapons and ammo equipped
- You must jump via bench_crossroads to reach bench_frontier
- Manage your combat stance, range, and ammunition carefully

## Steps

1. Undock from Benchmark Home Station
2. Jump to bench_crossroads: `spacemolt/jump` with `id: "bench_crossroads"`
3. Jump to bench_frontier: `spacemolt/jump` with `id: "bench_frontier"`
4. Travel to Frontier Belt: `spacemolt/travel` with `id: "bench_frontier_belt"` — this is where pirates patrol
5. Call `spacemolt/get_nearby` to locate pirate ships
6. Engage a pirate: `spacemolt/attack` with the pirate's name or ID
7. During combat, use `spacemolt_battle/stance`, `spacemolt_battle/advance`, `spacemolt_battle/retreat`, and `spacemolt_battle/target` to manage the fight
8. Use `spacemolt_battle/reload` when ammo is low
9. Defeat the pirate (reduce hull to 0)

## Success Criteria

- **PASS**: Reached bench_frontier and engaged at least one pirate
- **GOOD**: Defeated at least one pirate ship
- **EXCELLENT**: Defeated 2+ pirates while keeping your own hull above 50%
