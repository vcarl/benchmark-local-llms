# Scenario: Equip Ship

You are evaluated on your ability to find, purchase, and install a ship module.

## Objective

Purchase a ship module from the market and install it on your ship.

## Rules

- Start: docked at Benchmark Home Station with 3000 credits
- Use spacemolt_catalog or spacemolt_market/view_market to find available modules before buying
- Verify installation with spacemolt/get_ship after installing

## Steps

1. Call spacemolt_catalog(type="modules") to see available ship modules
2. Call spacemolt_market/view_market to check which modules are for sale at this station
3. Choose a module you can afford with your 3000 credits
4. Purchase the module
5. Call spacemolt/install_mod with the purchased module
6. Call spacemolt/get_ship to confirm the module is now installed

## Success Criteria

- **PASS**: Successfully installed at least 1 module on your ship
- **GOOD**: Installed a module and verified it with spacemolt/get_ship
- **EXCELLENT**: Installed the best available module within budget and confirmed all ship stats updated correctly
