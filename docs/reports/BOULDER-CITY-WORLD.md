# Unified Boulder City world (#43): plan and first slice

Veterans Memorial Park, the Church and B Hill become districts of one Boulder City. This pass adds:

- the shared world-coordinate plan;
- a phone SPOTS app with a city view and fast travel to the five spots in the spec;
- tests that hold the plan to your ride-time targets.

Riding continuously between districts needs streaming. That is planned, not built, and how far to take it is flagged below as **NEEDS OWNER DECISION**.

The source of truth is `src/data/world.ts`. The tests are in `tests/world.test.ts`.

## WORLD COORDINATE PLAN
- **Units and compass:** world metres, using the game's compass everywhere (north is −z, east is +x).
- **Origin:** Veterans Memorial Park. Its local coordinates are already world coordinates, so the park, its minimap and its phone map don't change.
- **Other districts:** each keeps its authored local layout and is translated as a unit to its world origin. This follows the spec's rule for when migration would conflict: keep the local layout and move the district as a whole.
  - Church: (0, −560)
  - B Hill: (−560, −460)
- **Conversion:** `toWorld(district, x, z)` turns a district-local position into world coordinates. The phone city view draws from these, and cross-district missions and markers will use them too.

## REAL LOCATION RELATIONSHIPS PRESERVED
- Veterans Memorial Park (1650 Buchanan Blvd) and the Church (1136 Buchanan Blvd) share **Buchanan Blvd**, the spine of the world. Buchanan runs north–south, and house numbers fall going north, so the Church sits north of the park along it.
- B Hill's bottom (1401 Pueblo Dr) connects to Buchanan by a Pueblo Dr connector on the west side, between the two. **The bearing is an estimate.** The geocoder was blocked by this environment's network policy, so B Hill is marked `placement: "estimate"` in the data. **NEEDS OWNER CONFIRMATION**: which side of Buchanan Pueblo Dr and the B Hill bottom are on.

## DISTANCE COMPRESSION
The boring stretches are compressed to about 0.7× real distance. The detailed destinations keep their authored size. At a rolling ~9 m/s on the flat, the planned street routes land inside every target. The tests fail if they drift out.

| Route | Planned length | Ride time | Target |
|---|---|---|---|
| Veterans → Church | 596 m | 66 s | 45–75 s |
| Church → B Hill access | 737 m | 82 s | 45–90 s |
| B Hill bottom → Veterans | 1017 m | 113 s | 60–120 s |
| Full loop | 2350 m | ~4.4 min | 3–5 min |

## CONNECTIONS
| Connection | Status |
|---|---|
| Veterans connection | **Planned.** The route runs along Buchanan: its entry is the park's east side at x ≈ 18. |
| Church connection | **Planned.** The front lot faces Buchanan. |
| B Hill connection | **Planned.** The runout continues onto the Pueblo Dr connector toward Buchanan. |

The Buchanan connector's playable features are part of the planned Connector Streets and Buchanan Connector cells: sidewalks, curbs, parking lots, ledges, benches, banks, stairs, rails, loading areas, drainage and dirt shortcuts.

## FAST TRAVEL — Modified
- **New:** a SPOTS app on the phone. It shows a city view with Buchanan Blvd, the Pueblo connector and the three districts, marks YOU ARE HERE, and lists five spots:
  - VETERANS MEMORIAL PARK
  - CHURCH — FRONT
  - CHURCH — INTERIOR
  - B HILL — SUMMIT
  - B HILL — PUEBLO / BOTTOM
- **Travel:** picking a spot offers FAST TRAVEL. It loads the district if you aren't already there, behind the usual short loading screen, then places the rider at the spot. Within the same district it's instant.
- **Preserved:** the existing Parks and Shops travel in the Sesh menu is unchanged.
- **SET MARKER on another district** waits for the continuous world, since there's no way to ride to it yet.

## PHONE MAP — Partial
- **SPOTS:** the city view in SPOTS is the new Boulder City overview, drawn from the same world registry.
- **MAP app:** unchanged, still the local map of the district you're in.
- **Next:** merge the city view into MAP as a zoom-out level, with mission, chest, vending, shop and friend markers from the existing map-data registry in world coordinates.

## MINIMAP — Working (unchanged)
The minimap stays a local, district view. Veterans is the world origin, so its coordinates already agree with the world. Other districts will convert through `toWorld` when the city view carries their markers. There is one conversion, so there are no contradictory coordinate systems.

## STREAMING — Planned · NEEDS OWNER DECISION
- **Cells, north-west to south-east:**
  1. B Hill Upper
  2. B Hill Mid
  3. Pueblo / B Hill Bottom
  4. Connector Streets
  5. Church District
  6. Buchanan Connector
  7. Veterans District
- **Why it's an owner decision:** today the engine builds and simulates one map at a time. Terrain height, surfaces, colliders and spawns all branch on a single `ACTIVE_MAP` in `park.ts`. Streaming cells means reworking that into cell-keyed terrain and colliders, loaded and unloaded around the rider. That work touches every map's physics ground truth, which the owner rules protect ("preserve riding controls and physics").
- **Options:**
  1. **Full streaming:** continuous riding, largest change.
  2. **Connector maps:** Buchanan and Pueblo become their own ridden maps, with seamless hand-offs at the district edges. Moderate change; each hand-off is a short transition.
  3. **Fast travel only**, plus the city view: what exists now.

## PERFORMANCE
There's no runtime cost yet. SPOTS draws one canvas panel while the phone is open, and fast travel reuses the normal map load.

## CONFLICTS WITH CURRENT ARCHITECTURE
- The single `ACTIVE_MAP` in `park.ts`: terrain, surface and spawn functions branch on it.
- Each map owns its own Rapier world, rebuilt on every map change in `startSession`.
- Mission stats count maps visited by map id. Cross-district objectives ("Ride from B Hill to Veterans") will use world districts instead, with no duplicated ids.

## FILES CHANGED
- `src/data/world.ts` (new): districts, world origins, Buchanan and Pueblo polylines, route lengths, travel targets, streaming cells, spots.
- `src/phone/apps.ts`: the SPOTS app and its city view.
- `src/main.ts`: `fastTravel` for the phone.
- `tests/world.test.ts` (new): ride-time targets, north/south relationship, spot validity.
