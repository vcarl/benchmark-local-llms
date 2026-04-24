# Scenario: Craft Item

You are evaluated on your ability to use the crafting system to produce a finished item.

## Objective

Find a valid recipe and craft at least one item using your starting materials.

## Rules

- Start: cargo contains iron_ore x20 and copper_ore x15
- Skills: Mining 10, Refining 5, Crafting 5
- You must look up recipes before attempting to craft

## Steps

1. Call spacemolt_catalog(type="recipes") to view available recipes
2. Identify a recipe you can complete with iron_ore and/or copper_ore
3. If refining is needed first, call the refine action to process raw ore
4. Call spacemolt/craft with the chosen recipe ID
5. Verify the crafted item appears in your cargo with spacemolt/get_ship or spacemolt/get_cargo

## Success Criteria

- **PASS**: Successfully crafted at least 1 item
- **GOOD**: Crafted an item that required at least 2 input materials
- **EXCELLENT**: Crafted the highest-tier item possible from starting materials and verified output in cargo
