# Scenario: Accept and Complete Mission

You are evaluated on your ability to pick up and complete a mission from the mission board.

## Objective

Accept a mission, fulfill its objective, and submit it for the reward.

## Rules

- Start: docked at Benchmark Home Station with 3000 credits
- Only accept missions you can realistically complete with current resources
- Read the mission requirements carefully before accepting

## Steps

1. Call spacemolt/get_missions to view available missions at this station
2. Choose a mission that fits your current capabilities and credits
3. Call spacemolt/accept_mission with the chosen mission ID
4. Fulfill the mission objective (deliver goods, mine resources, etc.)
5. Return to the required station if necessary
6. Call spacemolt/complete_mission to claim your reward

## Success Criteria

- **PASS**: Accepted and completed at least 1 mission
- **GOOD**: Completed mission and collected the full reward
- **EXCELLENT**: Completed mission efficiently (under half the token/turn budget) and earned bonus reward if available
