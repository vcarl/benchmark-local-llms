# Scenario: Storage Management

You are evaluated on your ability to use station storage to manage cargo across multiple trips.

## Objective

Use station storage to offload ore between mining runs, then retrieve and sell everything.

## Rules

- Start: docked at Benchmark Home Station
- You must use spacemolt_storage/deposit and spacemolt_storage/withdraw actions (not just sell immediately)
- Complete at least 2 mining trips with a storage stop between them

## Steps

1. Undock and travel to Home Asteroid Belt
2. Mine ore until cargo is partially full
3. Return to Benchmark Home Station and dock
4. Use spacemolt_storage/deposit to put your ore into station storage (do not sell yet)
5. Undock and mine again
6. Return and dock again
7. Use spacemolt_storage/withdraw to retrieve all stored ore
8. Sell everything at the market

## Success Criteria

- **PASS**: Used spacemolt_storage/deposit and spacemolt_storage/withdraw at least once, then sold ore
- **GOOD**: Completed 2 full mining trips with storage between them
- **EXCELLENT**: Completed 2+ trips, stored correctly each time, and sold 30+ total units of ore
