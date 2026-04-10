# Benchmark Reset Endpoint & Game Scenarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/api/admin/benchmark/reset` endpoint to the gameserver that replaces the full game world with a minimal, deterministic test galaxy and pre-created template players, then create 10 benchmark scenario definitions that test core gameplay competencies.

**Architecture:** The gameserver already loads world data from YAML at startup. The reset endpoint mutates the in-memory state: it replaces the galaxy (systems/POIs/bases) with a hardcoded minimal topology, clears all dynamic state (players, ships, etc.), pre-creates 6 template players with known credentials, and spawns pirate NPCs in the frontier system. The Python testbench harness calls reset after starting each gameserver instance, writes credentials to commander's session directory, and each scenario YAML references which template player to use.

**Tech Stack:** Go (gameserver), Python (testbench harness), YAML (scenario definitions)

---

## Division of Work

This plan has two independent workstreams that converge at integration:

1. **Gameserver (Go)** — Tasks 1-3: New reset endpoint with minimal galaxy + template players
2. **Testbench (Python)** — Tasks 4-7: Admin client extensions, session credential wiring, scenario YAMLs + scorers
3. **Integration** — Task 8: Wire everything together and verify

Tasks 1-3 and Tasks 4-6 can be executed in parallel. Task 7 (scenario files) depends on knowing the template player names from Task 2. Task 8 depends on all prior tasks.

---

## Minimal Test Galaxy

```
                    [bench_frontier]  (police 0, has pirates)
                          |
[bench_home] ---- [bench_crossroads] ---- [bench_trade_hub]
                          |
                    [bench_deep_space]  (low police, hidden POIs)
```

### Systems

| ID | Name | Police | Empire | Connections | POIs |
|----|------|--------|--------|-------------|------|
| `bench_home` | "Benchmark Home" | 100 | solarian | bench_crossroads | bench_home_star, bench_home_station_poi, bench_home_belt |
| `bench_crossroads` | "Crossroads" | 60 | solarian | bench_home, bench_trade_hub, bench_frontier, bench_deep_space | bench_crossroads_star, bench_crossroads_station_poi |
| `bench_trade_hub` | "Trade Hub" | 80 | solarian | bench_crossroads | bench_trade_hub_star, bench_trade_hub_station_poi, bench_trade_hub_belt |
| `bench_frontier` | "Frontier" | 0 | (none) | bench_crossroads | bench_frontier_star, bench_frontier_belt, bench_frontier_station_poi |
| `bench_deep_space` | "Deep Space" | 20 | solarian | bench_crossroads | bench_deep_space_star, bench_deep_space_nebula (hidden: bench_deep_space_relic) |

### Bases (Stations)

| ID | POI | Facilities |
|----|-----|------------|
| `bench_home_station` | bench_home_station_poi | iron_refinery, copper_wire_mill, circuit_fabricator, fuel_cell_plant, repair_kit_factory (crafting + full services) |
| `bench_crossroads_station` | bench_crossroads_station_poi | (basic services only — repair, refuel, storage) |
| `bench_trade_hub_station` | bench_trade_hub_station_poi | (full market, different supply) |
| `bench_frontier_station` | bench_frontier_station_poi | (pirate station, minimal services) |

### Template Players

All solarian empire. Passwords are generated via `models.GeneratePassword()` and returned in the reset response.

| Username | Credits | Ship Class | Skills | Cargo | Purpose |
|----------|---------|------------|--------|-------|---------|
| `bench_rookie` | 150 | theoria (starter) | none | empty | dock_and_sell, refuel_loop, storage_management |
| `bench_explorer` | 1000 | theoria (full fuel) | navigation:5 | empty | navigation_route, scan_and_survey |
| `bench_trader` | 5000 | theoria | trading:10 | empty | market_buy_sell |
| `bench_crafter` | 2000 | theoria | mining:10, refining:5, crafting:5 | iron_ore x20, copper_ore x15 | craft_item |
| `bench_fighter` | 3000 | theoria | weapons:5, gunnery:5 | ammo_kinetic_small x50 | combat_pirate, equip_ship |
| `bench_adventurer` | 3000 | theoria | mining:5, trading:5, navigation:5 | empty | accept_complete_mission |

---

## Task 1: Benchmark Reset Handler (Go — gameserver)

**Files:**
- Create: `gameserver/internal/server/benchmark_reset.go`
- Modify: `gameserver/internal/server/server.go` (add route registration)

This task creates the HTTP handler and route. The actual galaxy/player creation logic comes in Tasks 2-3.

- [ ] **Step 1: Create the handler file with request/response types**

In `gameserver/internal/server/benchmark_reset.go`:

```go
package server

import (
	"encoding/json"
	"log"
	"net/http"
)

// BenchmarkResetRequest is the JSON body for POST /api/admin/benchmark/reset.
type BenchmarkResetRequest struct {
	Fixture string `json:"fixture"` // only "benchmark" supported
}

// BenchmarkPlayerCredentials holds the plaintext password for a template player
// so the harness can write it to commander's session directory.
type BenchmarkPlayerCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Empire   string `json:"empire"`
	PlayerID string `json:"player_id"`
}

// BenchmarkResetResponse is returned after a successful reset.
type BenchmarkResetResponse struct {
	Success bool                         `json:"success"`
	Fixture string                       `json:"fixture"`
	Players []BenchmarkPlayerCredentials `json:"players"`
	Message string                       `json:"message"`
}

// handleAdminBenchmarkReset handles POST /api/admin/benchmark/reset.
// Only available when BenchmarkMode is enabled.
func (s *Server) handleAdminBenchmarkReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAdminError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if token := s.validateAndRateLimitAdmin(w, r); token == "" {
		return
	}

	if !s.cfg.BenchmarkMode {
		writeAdminError(w, http.StatusForbidden, "benchmark reset requires BENCHMARK_MODE=1")
		return
	}

	var req BenchmarkResetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAdminError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Fixture != "benchmark" {
		writeAdminError(w, http.StatusBadRequest, "unknown fixture: "+req.Fixture+"; only 'benchmark' is supported")
		return
	}

	log.Println("[BENCHMARK] Reset requested, rebuilding test world...")

	// Phase 1: Clear all dynamic state
	s.clearDynamicState()

	// Phase 2: Replace galaxy with minimal benchmark topology
	s.loadBenchmarkGalaxy()

	// Phase 3: Create template players
	players, err := s.createBenchmarkPlayers()
	if err != nil {
		writeAdminError(w, http.StatusInternalServerError, "failed to create benchmark players: "+err.Error())
		return
	}

	// Phase 4: Spawn pirate NPCs in frontier
	s.spawnBenchmarkPirates()

	log.Printf("[BENCHMARK] Reset complete: %d template players created", len(players))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(BenchmarkResetResponse{
		Success: true,
		Fixture: req.Fixture,
		Players: players,
		Message: "Benchmark world reset complete",
	})
}
```

- [ ] **Step 2: Register the route in server.go**

In `gameserver/internal/server/server.go`, find the admin route registrations (around line 447) and add:

```go
	mux.HandleFunc("/api/admin/benchmark/reset", s.handleAdminBenchmarkReset)
```

Add it right before or after the existing `/api/admin/benchmark/player-stats` line.

- [ ] **Step 3: Verify it compiles**

```bash
cd ~/workspace/gameserver && go build ./...
```

Expected: compiles (the helper methods don't exist yet — add stubs):

Add to `benchmark_reset.go`:

```go
func (s *Server) clearDynamicState() {
	// TODO: Task 2
}

func (s *Server) loadBenchmarkGalaxy() {
	// TODO: Task 2
}

func (s *Server) createBenchmarkPlayers() ([]BenchmarkPlayerCredentials, error) {
	// TODO: Task 3
	return nil, nil
}

func (s *Server) spawnBenchmarkPirates() {
	// TODO: Task 3
}
```

- [ ] **Step 4: Commit**

```bash
cd ~/workspace/gameserver
git add internal/server/benchmark_reset.go internal/server/server.go
git commit -m "feat: add benchmark reset endpoint handler skeleton"
```

---

## Task 2: Clear State + Benchmark Galaxy (Go — gameserver)

**Files:**
- Modify: `gameserver/internal/server/benchmark_reset.go`

This task implements `clearDynamicState()` and `loadBenchmarkGalaxy()`. The clear function wipes players, ships, modules, factions, orders, wrecks, battles, and pirate NPCs from the in-memory state. The galaxy function replaces systems/POIs/bases with the minimal benchmark topology.

- [ ] **Step 1: Implement clearDynamicState**

Replace the stub in `benchmark_reset.go`:

```go
import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/SpaceMolt/gameserver/internal/models"
)

// clearDynamicState wipes all runtime-created entities from the game state.
// Static data (items, ship classes, modules, skills, recipes) is preserved.
func (s *Server) clearDynamicState() {
	state := s.state
	state.mu.Lock()
	defer state.mu.Unlock()

	// Clear players and associated indexes
	state.Players = make(map[models.PlayerID]*models.Player)
	state.PlayersByUsername = make(map[string]models.PlayerID)
	state.PlayersBySystem = make(map[models.SystemID][]models.PlayerID)
	state.PlayersByPOI = make(map[models.POIID]map[models.PlayerID]struct{})

	// Clear ships
	state.Ships = make(map[models.ShipID]*models.Ship)
	state.ShipsByOwner = make(map[models.PlayerID][]models.ShipID)

	// Clear module instances
	state.ModuleInstances = make(map[models.ModuleInstanceID]*models.ModuleInstance)
	state.ModuleInstancesByPlayer = make(map[models.PlayerID][]models.ModuleInstanceID)
	state.ModuleInstancesByShip = make(map[models.ShipID][]models.ModuleInstanceID)

	// Clear factions
	state.Factions = make(map[models.FactionID]*models.Faction)

	// Clear pirate NPCs
	state.PirateNPCs = make(map[models.PirateNPCID]*models.PirateNPC)
	state.PirateNPCsBySystem = make(map[models.SystemID][]models.PirateNPCID)

	// Clear battles
	state.Battles = make(map[models.BattleID]*models.Battle)

	// Clear wrecks
	state.Wrecks = make(map[models.WreckID]*models.Wreck)
	state.WrecksByPOI = make(map[models.POIID][]models.WreckID)

	// Clear exchange orders
	state.ExchangeOrders = make(map[models.OrderID]*models.ExchangeOrder)
	state.ExchangeOrdersByBase = make(map[models.BaseID][]models.OrderID)

	// Clear station storage
	state.StationStorage = make(map[models.BaseID]map[models.PlayerID]*models.StationStorageEntry)

	// Clear missions
	state.ActiveMissions = make(map[models.MissionID]*models.Mission)
	state.MissionsByPlayer = make(map[models.PlayerID][]models.MissionID)

	// Clear trades
	state.Trades = make(map[models.TradeID]*models.Trade)

	// Clear insurance
	state.InsurancePolicies = make(map[models.InsurancePolicyID]*models.InsurancePolicy)

	log.Println("[BENCHMARK] Dynamic state cleared")
}
```

**NOTE to implementer:** The exact field names on `State` may differ slightly. Check `gameserver/internal/game/state.go` for the actual map field names. The pattern is: every map that holds runtime-created entities gets reset to an empty map. Static data maps (`Items`, `ShipClasses`, `ModuleTypes`, `Skills`, `Recipes`, `Empires`, `MissionTemplates`, etc.) must NOT be cleared.

- [ ] **Step 2: Implement loadBenchmarkGalaxy**

Replace the stub. This replaces the loaded galaxy systems, POIs, and bases with the minimal benchmark topology:

```go
// loadBenchmarkGalaxy replaces the full galaxy with a minimal 5-system
// benchmark topology. All existing systems/POIs/bases are removed first.
func (s *Server) loadBenchmarkGalaxy() {
	state := s.state
	state.mu.Lock()
	defer state.mu.Unlock()

	// Clear existing galaxy
	state.Systems = make(map[models.SystemID]*models.System)
	state.POIs = make(map[models.POIID]*models.POI)
	state.Bases = make(map[models.BaseID]*models.Base)

	// Helper to add a system
	addSystem := func(id, name, description string, empire models.EmpireID, policeLevel int, x, y float64, connections []models.SystemID) {
		state.Systems[models.SystemID(id)] = &models.System{
			ID:          models.SystemID(id),
			Name:        name,
			Description: description,
			Empire:      empire,
			PoliceLevel: policeLevel,
			Position:    models.GalacticPosition{X: x, Y: y},
			Connections: connections,
			Discovered:  true,
		}
	}

	// Helper to add a POI and link to system
	addPOI := func(id, systemID, name, description string, poiType models.POIType, class string, x, y float64, baseID string, hidden bool, resources []models.ResourceNode) {
		poi := &models.POI{
			ID:          models.POIID(id),
			SystemID:    models.SystemID(systemID),
			Name:        name,
			Description: description,
			Type:        poiType,
			Class:       class,
			Position:    models.Position{X: x, Y: y},
			Hidden:      hidden,
			Resources:   resources,
		}
		if baseID != "" {
			poi.BaseID = models.BaseID(baseID)
		}
		state.POIs[poi.ID] = poi
		sys := state.Systems[models.SystemID(systemID)]
		if sys != nil {
			sys.POIs = append(sys.POIs, poi.ID)
		}
	}

	// Helper to add a base
	addBase := func(id, poiID, name, description string, empire models.EmpireID, facilities []models.FacilityID) {
		state.Bases[models.BaseID(id)] = &models.Base{
			ID:           models.BaseID(id),
			POIID:        models.POIID(poiID),
			Name:         name,
			Description:  description,
			Empire:       empire,
			PublicAccess: true,
			DefenseLevel: 50,
			HasDrones:    true,
			Facilities:   facilities,
		}
	}

	// ── Systems ──────────────────────────────────────────

	addSystem("bench_home", "Benchmark Home",
		"A safe starting system for benchmark scenarios.",
		"solarian", 100, 0, 0,
		[]models.SystemID{"bench_crossroads"})

	addSystem("bench_crossroads", "Crossroads",
		"Central junction connecting all benchmark systems.",
		"solarian", 60, 1, 0,
		[]models.SystemID{"bench_home", "bench_trade_hub", "bench_frontier", "bench_deep_space"})

	addSystem("bench_trade_hub", "Trade Hub",
		"A bustling trade station with different market prices.",
		"solarian", 80, 2, 0,
		[]models.SystemID{"bench_crossroads"})

	addSystem("bench_frontier", "Frontier",
		"Lawless space. Pirates patrol freely.",
		"", 0, 1, 1,
		[]models.SystemID{"bench_crossroads"})

	addSystem("bench_deep_space", "Deep Space",
		"Remote region with hidden discoveries.",
		"solarian", 20, 1, -1,
		[]models.SystemID{"bench_crossroads"})

	// ── POIs ─────────────────────────────────────────────

	// bench_home POIs
	addPOI("bench_home_star", "bench_home", "Home Star", "A stable yellow dwarf.", "sun", "G2V", 0, 0, "", false, nil)
	addPOI("bench_home_station_poi", "bench_home", "Home Station", "Main benchmark station with full services.", "station", "", -1, -1, "bench_home_station", false, nil)
	addPOI("bench_home_belt", "bench_home", "Home Asteroid Belt", "Rich asteroid field for mining.", "asteroid_belt", "metallic", 2, 0, "", false, []models.ResourceNode{
		{ResourceID: "iron_ore", Richness: 90, Remaining: 100000, MaxRemaining: 100000},
		{ResourceID: "copper_ore", Richness: 70, Remaining: 100000, MaxRemaining: 100000},
		{ResourceID: "nickel_ore", Richness: 50, Remaining: 50000, MaxRemaining: 50000},
	})

	// bench_crossroads POIs
	addPOI("bench_crossroads_star", "bench_crossroads", "Crossroads Star", "A red giant.", "sun", "M2III", 0, 0, "", false, nil)
	addPOI("bench_crossroads_station_poi", "bench_crossroads", "Crossroads Station", "Basic waypoint station.", "station", "", -1, 0, "bench_crossroads_station", false, nil)

	// bench_trade_hub POIs
	addPOI("bench_trade_hub_star", "bench_trade_hub", "Trade Hub Star", "A bright white star.", "sun", "A0V", 0, 0, "", false, nil)
	addPOI("bench_trade_hub_station_poi", "bench_trade_hub", "Trade Hub Station", "Major trading post.", "station", "", -1, -1, "bench_trade_hub_station", false, nil)
	addPOI("bench_trade_hub_belt", "bench_trade_hub", "Trade Hub Belt", "Asteroid belt near the trade hub.", "asteroid_belt", "silicate", 2, 1, "", false, []models.ResourceNode{
		{ResourceID: "iron_ore", Richness: 60, Remaining: 50000, MaxRemaining: 50000},
		{ResourceID: "titanium_ore", Richness: 40, Remaining: 30000, MaxRemaining: 30000},
	})

	// bench_frontier POIs
	addPOI("bench_frontier_star", "bench_frontier", "Frontier Star", "A dying red dwarf.", "sun", "M5V", 0, 0, "", false, nil)
	addPOI("bench_frontier_belt", "bench_frontier", "Frontier Belt", "Dangerous asteroid field.", "asteroid_belt", "metallic", 2, 0, "", false, []models.ResourceNode{
		{ResourceID: "iron_ore", Richness: 80, Remaining: 80000, MaxRemaining: 80000},
	})
	addPOI("bench_frontier_station_poi", "bench_frontier", "Pirate Outpost", "A ramshackle pirate station.", "station", "", -2, 0, "bench_frontier_station", false, nil)

	// bench_deep_space POIs
	addPOI("bench_deep_space_star", "bench_deep_space", "Deep Space Star", "A faint brown dwarf.", "sun", "L2", 0, 0, "", false, nil)
	addPOI("bench_deep_space_nebula", "bench_deep_space", "Signal Nebula", "An ionized gas cloud with faint energy readings.", "gas_cloud", "ionized", 2, 1, "", false, []models.ResourceNode{
		{ResourceID: "hydrogen_gas", Richness: 60, Remaining: 30000, MaxRemaining: 30000},
	})
	addPOI("bench_deep_space_relic", "bench_deep_space", "Hidden Relic", "An ancient derelict station.", "relic", "megastructure", -3, 2, "", true, nil)

	// ── Bases ────────────────────────────────────────────

	addBase("bench_home_station", "bench_home_station_poi",
		"Benchmark Home Station",
		"Full-service station for benchmark scenarios. Has refinery, crafting, market, repair, and storage.",
		"solarian",
		[]models.FacilityID{
			"iron_refinery", "copper_wire_mill", "circuit_fabricator",
			"fuel_cell_plant", "repair_kit_factory",
		})

	addBase("bench_crossroads_station", "bench_crossroads_station_poi",
		"Crossroads Waypoint",
		"Basic waypoint station with essentials.",
		"solarian",
		[]models.FacilityID{})

	addBase("bench_trade_hub_station", "bench_trade_hub_station_poi",
		"Trade Hub Exchange",
		"Major trading station with a busy market.",
		"solarian",
		[]models.FacilityID{})

	addBase("bench_frontier_station", "bench_frontier_station_poi",
		"Pirate Outpost",
		"A lawless pirate station.",
		"",
		[]models.FacilityID{})

	log.Printf("[BENCHMARK] Galaxy loaded: %d systems, %d POIs, %d bases",
		len(state.Systems), len(state.POIs), len(state.Bases))
}
```

**NOTE to implementer:** The exact struct field names and types (e.g., `models.POIType`, `models.GalacticPosition`, `models.Position`, `models.ResourceNode`, `models.FacilityID`) must match what's defined in the models package. Check:
- `gameserver/internal/models/system.go` for System, POI, Position types
- `gameserver/internal/models/base.go` for Base type
- `gameserver/internal/models/poi.go` or similar for POI-related types
- The galaxy YAML loader in `gameserver/internal/data/loader.go` for field name patterns

The `Discovered: true` on systems ensures they show up in `get_map`. The `Hidden: true` on the relic POI means it requires `survey_system` to discover.

- [ ] **Step 3: Verify it compiles**

```bash
cd ~/workspace/gameserver && go build ./...
```

Fix any type mismatches. The state field names may need adjustment — consult `gameserver/internal/game/state.go` for the actual field names on the `State` struct.

- [ ] **Step 4: Commit**

```bash
cd ~/workspace/gameserver
git add internal/server/benchmark_reset.go
git commit -m "feat: implement clearDynamicState and loadBenchmarkGalaxy"
```

---

## Task 3: Create Template Players + Pirate Spawning (Go — gameserver)

**Files:**
- Modify: `gameserver/internal/server/benchmark_reset.go`

- [ ] **Step 1: Implement createBenchmarkPlayers**

Replace the stub. Each player gets a generated password (random 256-bit hex via `models.GeneratePassword()`), a starter ship from ship class `theoria`, and scenario-specific setup:

```go
import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/SpaceMolt/gameserver/internal/models"
)

// benchmarkPlayerDef defines a template player for the benchmark fixture.
type benchmarkPlayerDef struct {
	username string
	credits  int64
	skills   map[models.SkillID]int
	cargo    []struct {
		itemID   models.ItemID
		quantity int
	}
}

// createBenchmarkPlayers creates all template players for the benchmark fixture.
// Returns credentials so the harness can write them to commander sessions.
func (s *Server) createBenchmarkPlayers() ([]BenchmarkPlayerCredentials, error) {
	state := s.state
	ctx := context.Background()

	defs := []benchmarkPlayerDef{
		{
			username: "bench_rookie",
			credits:  150,
		},
		{
			username: "bench_explorer",
			credits:  1000,
			skills:   map[models.SkillID]int{"navigation": 5},
		},
		{
			username: "bench_trader",
			credits:  5000,
			skills:   map[models.SkillID]int{"trading": 10},
		},
		{
			username: "bench_crafter",
			credits:  2000,
			skills:   map[models.SkillID]int{"mining": 10, "refining": 5, "crafting": 5},
			cargo: []struct {
				itemID   models.ItemID
				quantity int
			}{
				{"iron_ore", 20},
				{"copper_ore", 15},
			},
		},
		{
			username: "bench_fighter",
			credits:  3000,
			skills:   map[models.SkillID]int{"weapons": 5, "gunnery": 5},
			cargo: []struct {
				itemID   models.ItemID
				quantity int
			}{
				{"ammo_kinetic_small", 50},
			},
		},
		{
			username: "bench_adventurer",
			credits:  3000,
			skills:   map[models.SkillID]int{"mining": 5, "trading": 5, "navigation": 5},
		},
	}

	homeBaseID := models.BaseID("bench_home_station")
	homePOIID := models.POIID("bench_home_station_poi")
	homeSystemID := models.SystemID("bench_home")

	// Look up the starter ship class
	starterClass := state.ShipClasses[models.ShipClassID("theoria")]
	if starterClass == nil {
		// Fall back to any starter ship
		for _, sc := range state.ShipClasses {
			if sc.StarterShip {
				starterClass = sc
				break
			}
		}
	}
	if starterClass == nil {
		return nil, fmt.Errorf("no starter ship class found")
	}

	var creds []BenchmarkPlayerCredentials

	for _, def := range defs {
		// Generate password
		password, hash, err := models.GeneratePassword()
		if err != nil {
			return nil, fmt.Errorf("generate password for %s: %w", def.username, err)
		}

		// Create player
		player := models.NewPlayer(def.username, "solarian", hash)
		player.Credits = def.credits
		player.CurrentSystem = homeSystemID
		player.CurrentPOI = homePOIID
		player.HomeBase = homeBaseID
		player.DockedAtBase = homeBaseID

		// Set skills
		for skillID, level := range def.skills {
			player.Skills[skillID] = level
		}

		// Create ship
		ship := models.NewShipFromClass(starterClass, player.ID)
		player.CurrentShipID = ship.ID

		// Add cargo
		for _, c := range def.cargo {
			item := state.Items[c.itemID]
			if item != nil {
				ship.AddCargo(c.itemID, c.quantity, item.Size)
			}
		}

		// Install default modules from ship class
		for _, modTypeID := range starterClass.DefaultModules {
			modType := state.GetModule(models.ItemID(modTypeID))
			if modType == nil {
				continue
			}
			inst := models.NewDefaultModuleInstance(models.ItemID(modTypeID), player.ID)
			inst.ShipID = ship.ID
			ship.Modules = append(ship.Modules, inst.ID)
			ship.CPUUsed += modType.CPUUsage
			ship.PowerUsed += modType.PowerUsage
			state.AddModuleInstance(inst)
		}

		if err := state.AddPlayer(ctx, player, ship); err != nil {
			return nil, fmt.Errorf("add player %s: %w", def.username, err)
		}

		creds = append(creds, BenchmarkPlayerCredentials{
			Username: def.username,
			Password: password,
			Empire:   "solarian",
			PlayerID: string(player.ID),
		})

		log.Printf("[BENCHMARK] Created player: %s (credits=%d, skills=%d, cargo=%d items)",
			def.username, def.credits, len(def.skills), len(def.cargo))
	}

	return creds, nil
}
```

**NOTE to implementer:**
- `starterClass.DefaultModules` is a `[]string` (or `[]ShipClassModuleID`). Check the ShipClass struct in `models/ship.go` for the exact field name and type.
- `state.GetModule()` takes an `ItemID` — module types are items. Check the method signature.
- The `AddModuleInstance` method does NOT hold the state lock — it acquires its own. Since `createBenchmarkPlayers` is called after `clearDynamicState` releases the lock, this is safe.
- `AddPlayer` also acquires its own lock internally.

- [ ] **Step 2: Implement spawnBenchmarkPirates**

Replace the stub. This creates a few pirate NPCs in the frontier system for the combat scenario:

```go
// spawnBenchmarkPirates creates pirate NPCs in the frontier system for
// combat benchmark scenarios. Uses a simple approach: creates PirateNPC
// entries directly rather than going through the full pirate spawning engine.
func (s *Server) spawnBenchmarkPirates() {
	state := s.state
	ctx := context.Background()

	frontierSystem := models.SystemID("bench_frontier")
	frontierBelt := models.POIID("bench_frontier_belt")

	// Find a suitable pirate ship class — look for a scout-role ship
	var pirateShipClass *models.ShipClass
	for _, sc := range state.ShipClasses {
		if sc.Tier <= 1 && !sc.StarterShip {
			pirateShipClass = sc
			break
		}
	}
	if pirateShipClass == nil {
		// Use the starter class as fallback
		for _, sc := range state.ShipClasses {
			if sc.StarterShip {
				pirateShipClass = sc
				break
			}
		}
	}
	if pirateShipClass == nil {
		log.Println("[BENCHMARK] WARNING: no ship class found for pirates, skipping pirate spawn")
		return
	}

	// Ensure the pirate NPC player exists (shared "owner" for all pirate ships)
	s.engine.EnsurePirateNPCPlayer(ctx)

	// Create 2-3 pirate NPCs patrolling the frontier belt
	pirateNames := []string{"Benchmark Raider", "Frontier Scum", "Test Pirate"}
	for _, name := range pirateNames {
		npc := &models.PirateNPC{
			ID:           models.PirateNPCID(models.GenerateID()),
			Name:         name,
			Role:         models.PirateRoleRaider,
			SystemID:     frontierSystem,
			POIID:        frontierBelt,
			HomeSystemID: frontierSystem,
			HomePOIID:    frontierBelt,
			Status:       models.PirateStatusPatrolling,
			CreditReward: 500,
			PatrolPOIs:   []models.POIID{frontierBelt},
		}

		// Create a ship for this pirate
		ship := models.NewShipFromClass(pirateShipClass, models.PlayerID("pirate_npc"))
		npc.ShipID = ship.ID

		state.mu.Lock()
		state.Ships[ship.ID] = ship
		state.mu.Unlock()

		state.AddPirateNPC(npc)
	}

	log.Printf("[BENCHMARK] Spawned %d pirate NPCs in %s", len(pirateNames), frontierSystem)
}
```

**NOTE to implementer:**
- The PirateNPC struct fields may differ. Check `gameserver/internal/models/pirate_npc.go` for exact field names.
- The pirate NPC "owner" player (PlayerID `"pirate_npc"`) may be created by `EnsurePirateNPCPlayer`. Check what ID it uses.
- `state.AddPirateNPC` should handle adding to both the main map and the `PirateNPCsBySystem` index. Check `state.go`.
- If the existing pirate spawning code in `pirates.go` has a simpler public API you can call instead, prefer that over manually constructing NPC structs.

- [ ] **Step 3: Verify it compiles and test manually**

```bash
cd ~/workspace/gameserver && go build ./...
```

Then start the gameserver with benchmark mode and test:

```bash
BENCHMARK_MODE=1 ADMIN_API_TOKEN=test123 DATABASE_URL="" PORT=9999 ./main &
sleep 2
curl -s -X POST http://localhost:9999/api/admin/benchmark/reset \
  -H "Authorization: Bearer test123" \
  -H "Content-Type: application/json" \
  -d '{"fixture":"benchmark"}' | python3 -m json.tool
kill %1
```

Expected: JSON response with `success: true` and 6 players with credentials.

- [ ] **Step 4: Commit**

```bash
cd ~/workspace/gameserver
git add internal/server/benchmark_reset.go
git commit -m "feat: create benchmark template players and pirate NPCs"
```

---

## Task 4: Extend AdminClient (Python — testbench)

**Files:**
- Modify: `testbench/llms/game_admin.py`

The existing `AdminClient.reset()` calls the endpoint but doesn't parse the response. Update it to return the player credentials.

- [ ] **Step 1: Update reset() to return credentials**

In `game_admin.py`, replace the existing `reset` method:

```python
def reset(self, fixture: str) -> list[dict]:
    """Reset the gameserver to a benchmark fixture.

    Returns a list of player credential dicts with keys:
    username, password, empire, player_id.
    """
    data = self._request("POST", "/api/admin/benchmark/reset", body={"fixture": fixture})
    if isinstance(data, dict):
        return data.get("players", [])
    return []
```

- [ ] **Step 2: Commit**

```bash
cd ~/workspace/testbench/llms
git add game_admin.py
git commit -m "feat: AdminClient.reset() returns player credentials"
```

---

## Task 5: Wire Credentials into Commander Sessions (Python — testbench)

**Files:**
- Modify: `testbench/llms/game_session.py`
- Modify: `testbench/llms/common.py` (Scenario dataclass)

After reset, the harness needs to: (a) find the credentials for the scenario's player, and (b) write them to commander's session directory so it starts already logged in.

- [ ] **Step 1: Add `player` field to Scenario dataclass**

In `common.py`, the `Scenario` dataclass already has `players` as a list of dicts with `id` and `controlled_by`. The `llm_player_id` property extracts the LLM player's `id`. This `id` field now maps to a `bench_*` username. No change needed to the dataclass — the YAML `players[].id` field will contain the bench username (e.g., `bench_rookie`).

Verify the existing code:

```python
@property
def llm_player_id(self) -> str:
    return next(p["id"] for p in self.players if p.get("controlled_by") == "llm")
```

This already works — `llm_player_id` will return e.g. `"bench_rookie"`.

- [ ] **Step 2: Write credentials to commander session directory**

In `game_session.py`, after calling `admin.reset()`, find the matching player credentials and write them to commander's session directory. Add this helper function:

```python
import json as _json

def _write_commander_credentials(
    commander_dir: Path,
    session_id: str,
    creds: dict,
) -> None:
    """Write credentials.json for a commander session so it starts logged in."""
    session_dir = commander_dir / "sessions" / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    creds_path = session_dir / "credentials.json"
    creds_path.write_text(_json.dumps({
        "username": creds["username"],
        "password": creds["password"],
        "empire": creds["empire"],
        "playerId": creds["player_id"],
    }, indent=2) + "\n")
    _log(f"wrote credentials for {creds['username']} to {creds_path}")
```

- [ ] **Step 3: Integrate into run_game_session**

In `run_game_session()`, after the reset call succeeds, find the matching player and write credentials. Replace the existing reset block (around lines 88-94):

```python
        # Reset to benchmark fixture and get template player credentials
        player_creds = None
        try:
            all_creds = admin.reset(scenario.fixture)
            target_username = scenario.llm_player_id
            for c in all_creds:
                if c.get("username") == target_username:
                    player_creds = c
                    break
            if player_creds:
                _write_commander_credentials(COMMANDER_DIR, session_id, player_creds)
            else:
                _log(f"[warn] no credentials found for player {target_username}")
        except AdminError as e:
            print(f"    [warn] reset skipped: {e}", flush=True)
```

- [ ] **Step 4: Commit**

```bash
cd ~/workspace/testbench/llms
git add game_session.py
git commit -m "feat: write commander credentials after benchmark reset"
```

---

## Task 6: New Scorers (Python — testbench)

**Files:**
- Modify: `testbench/llms/game_scorers.py`

Add scorers for the new scenarios. Each scorer maps to a scenario and evaluates player stats and tool call patterns.

- [ ] **Step 1: Add all new scorers**

Append to `game_scorers.py` before the `_REGISTRY` dict:

```python
def _dock_and_sell(result: GameSessionResult, params: dict) -> tuple[float, str]:
    """Score: did the player mine, dock, and sell?"""
    total_tools, errors, accuracy = _tool_metrics(result)
    credits_earned = _stat(result.final_player_stats, "credits_earned")
    ore_mined = _stat(result.final_player_stats, "ore_mined")
    times_docked = _stat(result.final_player_stats, "times_docked")

    # Binary milestones weighted heavily
    mined = min(ore_mined / 5, 1) * 25        # mined at least 5 ore
    docked = min(times_docked / 2, 1) * 25     # docked at least twice
    sold = min(credits_earned / 50, 1) * 30     # earned at least 50 credits
    efficiency = accuracy * 20

    raw = mined + docked + sold + efficiency
    return raw / 100, (
        f"ore_mined={int(ore_mined)} docked={int(times_docked)} "
        f"credits_earned={int(credits_earned)} errors={errors}"
    )


def _refuel_loop(result: GameSessionResult, params: dict) -> tuple[float, str]:
    """Score: fuel management — travel and refuel without dying."""
    total_tools, errors, accuracy = _tool_metrics(result)
    times_docked = _stat(result.final_player_stats, "times_docked")
    jumps = _stat(result.final_player_stats, "jumps_completed")
    deaths = (_stat(result.final_player_stats, "deaths_by_pirate")
              + _stat(result.final_player_stats, "deaths_by_player")
              + _stat(result.final_player_stats, "deaths_by_self_destruct"))

    dock_score = min(times_docked / 3, 1) * 30
    travel_score = min(jumps / 2, 1) * 30       # at least some movement
    no_death = (1 if deaths == 0 else 0) * 20
    efficiency = accuracy * 20

    raw = dock_score + travel_score + no_death + efficiency
    return raw / 100, (
        f"docked={int(times_docked)} jumps={int(jumps)} "
        f"deaths={int(deaths)} errors={errors}"
    )


def _navigation_route(result: GameSessionResult, params: dict) -> tuple[float, str]:
    """Score: plan a route and execute jumps to reach a target system."""
    total_tools, errors, accuracy = _tool_metrics(result)
    explored = _stat(result.final_player_stats, "systems_explored")
    jumps = _stat(result.final_player_stats, "jumps_completed")

    exploration = min(explored / 3, 1) * 40    # reached at least 3 systems
    jump_score = min(jumps / 2, 1) * 30
    efficiency = accuracy * 30

    raw = exploration + jump_score + efficiency
    return raw / 100, (
        f"systems_explored={int(explored)} jumps={int(jumps)} errors={errors}"
    )


def _market_buy_sell(result: GameSessionResult, params: dict) -> tuple[float, str]:
    """Score: buy and sell items on the market."""
    total_tools, errors, accuracy = _tool_metrics(result)
    bought = _stat(result.final_player_stats, "exchange_items_bought")
    sold = _stat(result.final_player_stats, "exchange_items_sold")
    credits_earned = _stat(result.final_player_stats, "credits_earned")

    buy_score = min(bought / 1, 1) * 30
    sell_score = min(sold / 1, 1) * 30
    profit = min(credits_earned / 500, 1) * 20
    efficiency = accuracy * 20

    raw = buy_score + sell_score + profit + efficiency
    return raw / 100, (
        f"bought={int(bought)} sold={int(sold)} "
        f"credits_earned={int(credits_earned)} errors={errors}"
    )


def _equip_ship(result: GameSessionResult, params: dict) -> tuple[float, str]:
    """Score: install a module on the ship."""
    total_tools, errors, accuracy = _tool_metrics(result)
    installed = _stat(result.final_player_stats, "modules_installed")

    install_score = min(installed / 1, 1) * 60
    efficiency = accuracy * 20
    activity = min(total_tools / 10, 1) * 20

    raw = install_score + efficiency + activity
    return raw / 100, f"modules_installed={int(installed)} tools={total_tools} errors={errors}"


def _craft_item(result: GameSessionResult, params: dict) -> tuple[float, str]:
    """Score: craft at least one item."""
    total_tools, errors, accuracy = _tool_metrics(result)
    crafted = _stat(result.final_player_stats, "items_crafted")

    craft_score = min(crafted / 1, 1) * 60
    efficiency = accuracy * 20
    activity = min(total_tools / 10, 1) * 20

    raw = craft_score + efficiency + activity
    return raw / 100, f"items_crafted={int(crafted)} tools={total_tools} errors={errors}"


def _combat_pirate(result: GameSessionResult, params: dict) -> tuple[float, str]:
    """Score: engage and survive combat with a pirate."""
    total_tools, errors, accuracy = _tool_metrics(result)
    pirates = _stat(result.final_player_stats, "pirates_destroyed")
    battles = _stat(result.final_player_stats, "battles_started")
    deaths = (_stat(result.final_player_stats, "deaths_by_pirate")
              + _stat(result.final_player_stats, "deaths_by_player"))

    pirate_score = min(pirates / 1, 1) * 40
    engaged = min(battles / 1, 1) * 20
    survived = (1 if deaths == 0 else 0.3) * 20
    efficiency = accuracy * 20

    raw = pirate_score + engaged + survived + efficiency
    return raw / 100, (
        f"pirates={int(pirates)} battles={int(battles)} "
        f"deaths={int(deaths)} errors={errors}"
    )


def _storage_management(result: GameSessionResult, params: dict) -> tuple[float, str]:
    """Score: use station storage (deposit and withdraw)."""
    total_tools, errors, accuracy = _tool_metrics(result)
    ore_mined = _stat(result.final_player_stats, "ore_mined")
    times_docked = _stat(result.final_player_stats, "times_docked")

    # Storage operations aren't directly tracked in player stats, so we
    # score on the broader workflow: mine, dock, and general tool accuracy.
    # A successful run will have high accuracy and meaningful activity.
    mined = min(ore_mined / 5, 1) * 25
    docked = min(times_docked / 2, 1) * 25
    efficiency = accuracy * 30
    activity = min(total_tools / 15, 1) * 20

    raw = mined + docked + efficiency + activity
    return raw / 100, (
        f"ore_mined={int(ore_mined)} docked={int(times_docked)} "
        f"tools={total_tools} errors={errors}"
    )


def _scan_and_survey(result: GameSessionResult, params: dict) -> tuple[float, str]:
    """Score: explore, scan, and survey systems."""
    total_tools, errors, accuracy = _tool_metrics(result)
    explored = _stat(result.final_player_stats, "systems_explored")
    scans = _stat(result.final_player_stats, "scans_performed")

    explore_score = min(explored / 2, 1) * 35
    scan_score = min(scans / 1, 1) * 35
    efficiency = accuracy * 30

    raw = explore_score + scan_score + efficiency
    return raw / 100, (
        f"systems_explored={int(explored)} scans={int(scans)} errors={errors}"
    )
```

- [ ] **Step 2: Register all new scorers in _REGISTRY**

Replace the `_REGISTRY` dict:

```python
_REGISTRY: dict[str, Callable[[GameSessionResult, dict], tuple[float, str]]] = {
    "bootstrap_grind": _bootstrap_grind,
    "navigation": _navigation,
    "trading": _trading,
    "combat": _combat,
    "generic": _generic,
    "dock_and_sell": _dock_and_sell,
    "refuel_loop": _refuel_loop,
    "navigation_route": _navigation_route,
    "market_buy_sell": _market_buy_sell,
    "equip_ship": _equip_ship,
    "craft_item": _craft_item,
    "combat_pirate": _combat_pirate,
    "storage_management": _storage_management,
    "scan_and_survey": _scan_and_survey,
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/workspace/testbench/llms
git add game_scorers.py
git commit -m "feat: add scorers for 10 benchmark game scenarios"
```

---

## Task 7: Scenario YAML + Markdown Files

**Files:**
- Create: `testbench/llms/prompts/scenarios/dock_and_sell.yaml` (and 9 more)
- Create: `~/workspace/smbench/scenarios/bench-dock-and-sell.md` (and 9 more)

Each scenario needs a YAML definition (for the testbench) and a markdown instruction file (for commander). All scenarios use fixture `"benchmark"`.

- [ ] **Step 1: Create all 10 scenario YAMLs**

Create each file in `testbench/llms/prompts/scenarios/`:

**`dock_and_sell.yaml`:**
```yaml
name: dock_and_sell
fixture: benchmark
players:
  - id: bench_rookie
    controlled_by: llm
scorer: dock_and_sell
scorer_params: {}
tier: 1
cutoffs:
  wall_clock_sec: 300
  total_tokens: 100000
  tool_calls: 100
commander:
  max_turns: 100
```

**`refuel_loop.yaml`:**
```yaml
name: refuel_loop
fixture: benchmark
players:
  - id: bench_rookie
    controlled_by: llm
scorer: refuel_loop
scorer_params: {}
tier: 1
cutoffs:
  wall_clock_sec: 300
  total_tokens: 100000
  tool_calls: 100
commander:
  max_turns: 100
```

**`navigation_route.yaml`:**
```yaml
name: navigation_route
fixture: benchmark
players:
  - id: bench_explorer
    controlled_by: llm
scorer: navigation_route
scorer_params: {}
tier: 1
cutoffs:
  wall_clock_sec: 300
  total_tokens: 100000
  tool_calls: 100
commander:
  max_turns: 100
```

**`market_buy_sell.yaml`:**
```yaml
name: market_buy_sell
fixture: benchmark
players:
  - id: bench_trader
    controlled_by: llm
scorer: market_buy_sell
scorer_params: {}
tier: 1
cutoffs:
  wall_clock_sec: 300
  total_tokens: 100000
  tool_calls: 150
commander:
  max_turns: 120
```

**`equip_ship.yaml`:**
```yaml
name: equip_ship
fixture: benchmark
players:
  - id: bench_fighter
    controlled_by: llm
scorer: equip_ship
scorer_params: {}
tier: 2
cutoffs:
  wall_clock_sec: 300
  total_tokens: 100000
  tool_calls: 100
commander:
  max_turns: 100
```

**`accept_complete_mission.yaml`:**
```yaml
name: accept_complete_mission
fixture: benchmark
players:
  - id: bench_adventurer
    controlled_by: llm
scorer: generic
scorer_params: {}
tier: 2
cutoffs:
  wall_clock_sec: 600
  total_tokens: 150000
  tool_calls: 200
commander:
  max_turns: 150
```

**`craft_item.yaml`:**
```yaml
name: craft_item
fixture: benchmark
players:
  - id: bench_crafter
    controlled_by: llm
scorer: craft_item
scorer_params: {}
tier: 2
cutoffs:
  wall_clock_sec: 300
  total_tokens: 100000
  tool_calls: 100
commander:
  max_turns: 100
```

**`combat_pirate.yaml`:**
```yaml
name: combat_pirate
fixture: benchmark
players:
  - id: bench_fighter
    controlled_by: llm
scorer: combat_pirate
scorer_params: {}
tier: 2
cutoffs:
  wall_clock_sec: 600
  total_tokens: 150000
  tool_calls: 200
commander:
  max_turns: 150
```

**`storage_management.yaml`:**
```yaml
name: storage_management
fixture: benchmark
players:
  - id: bench_rookie
    controlled_by: llm
scorer: storage_management
scorer_params: {}
tier: 1
cutoffs:
  wall_clock_sec: 300
  total_tokens: 100000
  tool_calls: 100
commander:
  max_turns: 100
```

**`scan_and_survey.yaml`:**
```yaml
name: scan_and_survey
fixture: benchmark
players:
  - id: bench_explorer
    controlled_by: llm
scorer: scan_and_survey
scorer_params: {}
tier: 2
cutoffs:
  wall_clock_sec: 300
  total_tokens: 100000
  tool_calls: 100
commander:
  max_turns: 100
```

- [ ] **Step 2: Create all 10 scenario markdown files**

Create each file in `~/workspace/smbench/scenarios/`:

**`bench-dock-and-sell.md`:**
```markdown
# Scenario: Dock and Sell

You are being evaluated on your ability to complete the basic mining loop.

## Objective
Undock from the station, travel to the asteroid belt, mine ore, travel back to the station, dock, and sell the ore.

## Rules
- You start docked at Benchmark Home Station
- Complete at least one full mine-sell cycle
- Do NOT leave the home system

## Steps
1. Undock from the station
2. Travel to "Home Asteroid Belt"
3. Mine ore (iron_ore or copper_ore)
4. Travel back to "Home Station"
5. Dock at the station
6. Sell your ore

## Success Criteria
- PASS: Mine ore and sell it for credits
- GOOD: Complete the cycle with no errors
- EXCELLENT: Complete multiple cycles efficiently
```

**`bench-refuel-loop.md`:**
```markdown
# Scenario: Refuel Loop

You are being evaluated on your ability to manage fuel while traveling.

## Objective
Travel between stations, refueling at each stop, without running out of fuel.

## Rules
- You start docked at Benchmark Home Station
- Always check your fuel before traveling
- Refuel at every station you dock at
- Do NOT let your fuel drop to zero

## Steps
1. Check your ship status to see current fuel
2. Undock
3. Travel to the asteroid belt and back, or jump to Crossroads
4. Dock at a station
5. Refuel
6. Repeat

## Success Criteria
- PASS: Dock at least 3 times and refuel at least once
- GOOD: Travel to another system and back without running out of fuel
- EXCELLENT: Visit multiple systems with no fuel emergencies
```

**`bench-navigation-route.md`:**
```markdown
# Scenario: Navigation Route

You are being evaluated on your ability to plan and execute a multi-jump route.

## Objective
Use find_route to plan a path to the Trade Hub system, then execute the jumps to get there.

## Rules
- You start docked at Benchmark Home Station
- Use get_map to see available systems
- Use find_route to plan your route to "bench_trade_hub"
- Execute each jump in the route
- Dock at the Trade Hub Station when you arrive

## Steps
1. Use get_map to see the galaxy
2. Use find_route to plan a route to bench_trade_hub
3. Undock from home station
4. Jump to each system in the route
5. Travel to the Trade Hub Station POI
6. Dock at the station

## Success Criteria
- PASS: Reach the Trade Hub system
- GOOD: Dock at the Trade Hub Station
- EXCELLENT: Complete the route with no wasted jumps
```

**`bench-market-buy-sell.md`:**
```markdown
# Scenario: Market Buy & Sell

You are being evaluated on your ability to trade on the station market.

## Objective
Buy items from one station's market and sell them at another station.

## Rules
- You start docked at Benchmark Home Station with 5000 credits
- Use view_market to browse available items and prices
- Buy items that you think you can sell for profit elsewhere
- Travel to the Trade Hub and sell there

## Steps
1. Use view_market to see what's available
2. Buy items with good resale potential
3. Undock and travel to the Trade Hub (jump to bench_crossroads, then bench_trade_hub)
4. Dock at Trade Hub Station
5. Use view_market to check prices
6. Sell your items

## Success Criteria
- PASS: Buy at least one item and sell at least one item
- GOOD: Make a profit on the trade
- EXCELLENT: Maximize profit through smart buying and selling
```

**`bench-equip-ship.md`:**
```markdown
# Scenario: Equip Ship

You are being evaluated on your ability to install a module on your ship.

## Objective
Browse available modules, buy one from the market, and install it on your ship.

## Rules
- You start docked at Benchmark Home Station with 3000 credits
- Use catalog to browse available modules
- Buy a module from the market
- Use install_mod to install it on your ship
- Verify installation with get_ship

## Steps
1. Use get_ship to see your current modules and available slots
2. Use catalog(type="items") or view_market to find modules for sale
3. Buy a module (weapon, defense, or utility)
4. Use install_mod to install it
5. Use get_ship to verify it's installed

## Success Criteria
- PASS: Install at least one module
- GOOD: Install a module appropriate for your ship's available slots
- EXCELLENT: Install multiple useful modules
```

**`bench-accept-complete-mission.md`:**
```markdown
# Scenario: Mission Runner

You are being evaluated on your ability to accept and complete a mission.

## Objective
Find available missions at the station, accept one, complete its objective, and turn it in.

## Rules
- You start docked at Benchmark Home Station with 3000 credits
- Use get_missions to see available missions
- Accept a mission that matches your capabilities
- Complete the mission objective (mining, trading, exploring, etc.)
- Turn it in with complete_mission

## Steps
1. Use get_missions to see available missions at the station
2. Choose a mission you can complete (prefer simple ones like mining or delivery)
3. Use accept_mission to accept it
4. Complete the objective described in the mission
5. Return to the station and use complete_mission to turn it in

## Success Criteria
- PASS: Accept at least one mission
- GOOD: Complete at least one mission
- EXCELLENT: Complete multiple missions
```

**`bench-craft-item.md`:**
```markdown
# Scenario: Craft Item

You are being evaluated on your ability to craft an item using the crafting system.

## Objective
Use your ore and materials to craft an item at the station.

## Rules
- You start docked at Benchmark Home Station with iron ore and copper ore in cargo
- You have Mining 10, Refining 5, and Crafting 5 skills
- Use catalog(type="recipes") to find a recipe you can craft
- Make sure you have the required materials
- Use the craft command to make the item

## Steps
1. Use get_cargo to check your materials
2. Use catalog(type="recipes") to browse available recipes
3. Find a recipe whose ingredients match your cargo
4. Use craft(id="recipe_id") to craft the item
5. Use get_cargo to verify the crafted item appears

## Success Criteria
- PASS: Successfully craft at least one item
- GOOD: Craft an item with no errors
- EXCELLENT: Craft multiple items or more complex recipes
```

**`bench-combat-pirate.md`:**
```markdown
# Scenario: Combat Pirate

You are being evaluated on your ability to engage and survive combat with a pirate NPC.

## Objective
Travel to the Frontier system, find a pirate, and defeat it in combat.

## Rules
- You start docked at Benchmark Home Station with weapons and ammo
- Travel to the Frontier system (bench_frontier) where pirates patrol
- Use scan to identify pirate NPCs
- Use attack to engage a pirate
- Manage the battle using the battle commands (stance, advance, retreat, target, reload)

## Steps
1. Check your ship (get_ship) — you have a pulse laser and kinetic ammo
2. Undock and jump to bench_crossroads, then bench_frontier
3. Travel to Frontier Belt where pirates patrol
4. Use get_nearby to find pirates
5. Use attack to engage a pirate
6. Use battle commands to fight (target the pirate, use fire stance, advance to close range)
7. Win the battle or retreat if hull gets low

## Success Criteria
- PASS: Engage a pirate in battle
- GOOD: Survive the battle
- EXCELLENT: Destroy the pirate
```

**`bench-storage-management.md`:**
```markdown
# Scenario: Storage Management

You are being evaluated on your ability to use station storage.

## Objective
Mine ore, deposit it in station storage, mine more, then withdraw and sell everything.

## Rules
- You start docked at Benchmark Home Station
- Use storage commands to deposit and withdraw items
- Complete the full cycle: mine → deposit → mine → withdraw → sell

## Steps
1. Undock and travel to the asteroid belt
2. Mine some ore
3. Travel back to the station and dock
4. Use deposit to store some ore in station storage
5. Undock and mine more ore
6. Travel back, dock, and use withdraw to retrieve your stored ore
7. Sell all the ore

## Success Criteria
- PASS: Successfully deposit items into storage
- GOOD: Deposit and then withdraw items
- EXCELLENT: Complete the full mine-deposit-mine-withdraw-sell cycle
```

**`bench-scan-and-survey.md`:**
```markdown
# Scenario: Scan and Survey

You are being evaluated on your ability to explore and discover hidden locations.

## Objective
Travel to Deep Space, survey the system to reveal hidden POIs, and scan objects you find.

## Rules
- You start docked at Benchmark Home Station with Navigation 5
- Travel to the Deep Space system (bench_deep_space)
- Use survey_system to reveal hidden points of interest
- Use scan on any objects or players you encounter

## Steps
1. Undock from home station
2. Jump to bench_crossroads, then bench_deep_space
3. Use get_system to see known POIs
4. Use survey_system to scan for hidden POIs
5. Travel to any revealed POI
6. Use scan on objects at the POI

## Success Criteria
- PASS: Reach Deep Space and perform a scan
- GOOD: Successfully survey the system
- EXCELLENT: Discover the hidden relic and scan it
```

- [ ] **Step 3: Commit both sets of files**

```bash
cd ~/workspace/testbench/llms
git add prompts/scenarios/*.yaml
git commit -m "feat: add 10 benchmark scenario YAML definitions"

cd ~/workspace/smbench
git add scenarios/bench-*.md
git commit -m "feat: add 10 benchmark scenario instruction files"
```

---

## Task 8: Integration — Wire Scenario Path Mapping

**Files:**
- Modify: `testbench/llms/game_session.py` or `testbench/llms/common.py`

The `run_game_session` function receives a `scenario_path` parameter which points to the markdown file commander reads. Currently this path is constructed externally. We need to ensure the new scenarios map to the correct `bench-*.md` files.

- [ ] **Step 1: Add scenario_md_path to Scenario dataclass**

In `common.py`, add an optional field to `Scenario`:

```python
@dataclass
class Scenario:
    name: str
    fixture: str
    players: list[dict]
    scorer: str
    cutoffs: ScenarioCutoffs
    scorer_params: dict = field(default_factory=dict)
    commander_max_turns: int = 250
    tier: int = 1
    scenario_md: str = ""  # filename of commander instruction markdown (e.g. "bench-dock-and-sell.md")
```

- [ ] **Step 2: Update load_scenarios to read scenario_md**

In the `load_scenarios` function, parse the new field:

```python
scenario_md = data.get("scenario_md", "")
```

And pass it to the Scenario constructor.

- [ ] **Step 3: Update scenario YAMLs to include scenario_md**

Add `scenario_md: bench-dock-and-sell.md` (etc.) to each scenario YAML. For example in `dock_and_sell.yaml`:

```yaml
name: dock_and_sell
fixture: benchmark
scenario_md: bench-dock-and-sell.md
players:
  - id: bench_rookie
    controlled_by: llm
scorer: dock_and_sell
scorer_params: {}
tier: 1
cutoffs:
  wall_clock_sec: 300
  total_tokens: 100000
  tool_calls: 100
commander:
  max_turns: 100
```

- [ ] **Step 4: Use scenario_md in run_game_session**

In `game_session.py`, derive the scenario path from the scenario object if `scenario_md` is set. In the `run_game_session` function, before spawning commander, resolve the path:

```python
        # Resolve scenario markdown path for commander
        if scenario.scenario_md:
            smbench_scenarios_dir = Path.home() / "workspace" / "smbench" / "scenarios"
            resolved_scenario_path = str(smbench_scenarios_dir / scenario.scenario_md)
        else:
            resolved_scenario_path = scenario_path
```

Then use `resolved_scenario_path` when calling `spawn_commander`.

- [ ] **Step 5: Commit**

```bash
cd ~/workspace/testbench/llms
git add common.py game_session.py prompts/scenarios/*.yaml
git commit -m "feat: wire scenario_md field for benchmark scenario path resolution"
```

---

## Summary of Changes by Repo

### gameserver (Go)
- `internal/server/benchmark_reset.go` — NEW: reset handler, galaxy builder, player creator, pirate spawner
- `internal/server/server.go` — ADD route: `/api/admin/benchmark/reset`

### testbench/llms (Python)
- `game_admin.py` — MODIFY: `reset()` returns credentials
- `game_session.py` — MODIFY: write credentials to commander session, resolve scenario_md path
- `common.py` — MODIFY: add `scenario_md` field to Scenario
- `game_scorers.py` — ADD: 10 new scorer functions
- `prompts/scenarios/*.yaml` — CREATE: 10 scenario definitions

### smbench (Markdown)
- `scenarios/bench-*.md` — CREATE: 10 commander instruction files
