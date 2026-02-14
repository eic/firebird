# Geometry Editing Rules

Firebird uses a powerful rule-based system to customize detector geometry appearance.
Rules control colors, materials, merging behavior, and outlines for different detector components.

## Overview

When geometry is loaded from ROOT files, it consists of a hierarchical tree of Three.js `Object3D` nodes
(Groups and Meshes). The geometry editing system allows you to:

- **Match nodes** by name patterns (glob-style wildcards)
- **Apply styling** (colors, materials, transparency)
- **Merge geometries** for better performance
- **Create outlines** for visual clarity
- **Process hierarchically** ("the rest" rules for unmatched nodes)

## Rule Structure

Rules are organized in **RuleSets**, where each ruleset targets specific detectors:

```typescript
{
  name: "DIRC*",           // Match detector by name (glob pattern)
  // or
  names: ["DIRC*", "RICH*"],  // Match multiple detectors

  rules: [
    // Array of rules applied in order
  ]
}
```

### Basic Rule Properties

```typescript
interface EditThreeNodeRule {
  // Node selection
  patterns?: string[] | string;  // Glob patterns to match nodes

  // Geometry handling
  merge?: boolean;               // Merge matched meshes (default: true)
  newName?: string;              // Name for merged mesh
  deleteOrigins?: boolean;       // Remove original meshes after merge (default: true)
  cleanupNodes?: boolean;        // Remove empty groups (default: true)

  // Styling
  color?: ColorRepresentation;   // Hex color (e.g., 0xFF0000)
  material?: Material;           // Three.js material

  // Outlines
  outline?: boolean;             // Create edge outlines (default: true)
  outlineThresholdAngle?: number; // Edge detection angle in degrees (default: 40)
  outlineColor?: ColorRepresentation;

  // Advanced
  applyToDescendants?: boolean;  // Apply to children of matched nodes
  simplifyMeshes?: boolean;      // Reduce vertex count
  simplifyRatio?: number;        // Simplification ratio (default: 0.7)
}
```

## Pattern Matching

Patterns use glob-style matching (powered by [outmatch](https://github.com/axtgr/outmatch)):

| Pattern | Matches |
|---------|---------|
| `*` | Any single path segment |
| `**` | Any number of path segments |
| `**/name*` | Any node whose name starts with "name" |
| `**/v_upstream*` | Nodes like `v_upstream_coating`, `v_upstream_wall` |
| `**/*box*` | Any node containing "box" in its name |

### Path Structure

Node paths are built from the hierarchy:
```
BeamPipe_assembly/v_upstream_coating/Left
                 ↑                  ↑
            parent name        child name
```

The pattern `**/v_upstream*` matches `v_upstream_coating` but NOT `Left`.
To match descendants, use `applyToDescendants: true` (default when `merge: false`).

## Rule Processing Order

Rules are processed **in order**. Earlier rules take precedence:

```typescript
rules: [
  // Rule 1: Process specific patterns first
  {
    patterns: ["**/mirror*"],
    color: SILVER,
    merge: true
  },
  // Rule 2: "The rest" - no pattern means all remaining nodes
  {
    color: GREEN_100,
    merge: false,
    outline: true
  }
]
```

### Skip Flags and Hierarchical Processing

When a node is processed, it's marked with a skip flag. Subsequent rules respect this:

1. **Individual skip**: Processed meshes are skipped by later rules
2. **Hierarchical skip**: If a parent is processed, descendants are skipped by "the rest" rules
3. **Outlines**: Created outlines are automatically marked to prevent "outline of outline"

## Working with Nested Nodes

Understanding how rules interact with hierarchical geometry is crucial for effective styling.

### Geometry Tree Structure

Detector geometry forms a tree of `Object3D` nodes:

```
BeamPipe_assembly (Group)
├── v_upstream_coating (Group)
│   ├── Left (Mesh)         ← has geometry, can be styled
│   └── Right (Mesh)        ← has geometry, can be styled
├── v_downstream_section (Mesh)
└── center_pipe (Mesh)
```

**Key distinction:**
- **Groups** - containers without geometry, used for organization
- **Meshes** - have actual geometry that gets rendered

### Pattern Matching Depth

Patterns match based on the **full path** from root:

```typescript
// Given this structure:
// BeamPipe_assembly/v_upstream_coating/Left

// Pattern "**/v_upstream*" matches:
"BeamPipe_assembly/v_upstream_coating"  ✓  (name starts with v_upstream)

// But does NOT match:
"BeamPipe_assembly/v_upstream_coating/Left"  ✗  (name is "Left", not "v_upstream*")
```

### The `applyToDescendants` Option

When a pattern matches a **Group** (not a Mesh), you need to decide what happens to its children:

```typescript
{
  patterns: ["**/v_upstream_coating"],
  color: 0xFF0000,
  merge: false,
  applyToDescendants: true  // ← Default when merge=false
}
```

| `applyToDescendants` | Behavior |
|---------------------|----------|
| `true` (default) | Pattern matches Group → all descendant Meshes get styled |
| `false` | Pattern matches Group → nothing styled (Groups have no geometry) |

**Example - styling a branch:**

```typescript
// Style v_upstream_coating AND all its children (Left, Right)
{
  patterns: ["**/v_upstream_coating"],
  color: INDIGO_200,
  merge: false
  // applyToDescendants: true is the default
}

// Result:
// v_upstream_coating (Group) - marked as processed
// ├── Left (Mesh) - colored INDIGO_200
// └── Right (Mesh) - colored INDIGO_200
```

### "The Rest" Rules and Hierarchical Skip

A rule **without patterns** is called a "the rest" rule - it processes everything not yet handled:

```typescript
rules: [
  // Rule 1: Specific pattern
  { patterns: ["**/v_upstream*"], color: RED, merge: false },

  // Rule 2: "The rest" - no patterns
  { color: GREEN, merge: false }
]
```

**Hierarchical skip** ensures that once a branch is processed, "the rest" rules skip the entire branch:

```
Processing flow:

1. Rule 1 matches "v_upstream_coating"
   → Marks v_upstream_coating as processed
   → Styles Left and Right (applyToDescendants=true)
   → Marks Left and Right as processed

2. Rule 2 ("the rest") runs
   → Checks each mesh: "Is it in a processed branch?"
   → Left: parent v_upstream_coating is processed → SKIP
   → Right: parent v_upstream_coating is processed → SKIP
   → center_pipe: not in processed branch → style GREEN
   → v_downstream_section: not in processed branch → style GREEN
```

### Common Pitfalls

#### Pitfall 1: Pattern doesn't match children

```typescript
// WRONG: Only matches v_upstream_coating, not its children
{ patterns: ["**/v_upstream_coating"], merge: true }
// Result: Tries to merge just the Group (no geometry!)

// CORRECT: Match the Group with applyToDescendants
{ patterns: ["**/v_upstream_coating"], merge: false, applyToDescendants: true }
// Result: Styles all children of v_upstream_coating
```

#### Pitfall 2: Children processed twice

```typescript
// PROBLEMATIC:
rules: [
  { patterns: ["**/v_upstream*"], color: RED },      // Matches v_upstream_coating
  { patterns: ["**/Left", "**/Right"], color: BLUE } // Also matches children!
]
// Result: Left and Right get BLUE (second rule overwrites)

// BETTER: Use one pattern and rely on applyToDescendants
rules: [
  { patterns: ["**/v_upstream*"], color: RED, merge: false }
]
// Result: v_upstream_coating AND its children get RED
```

#### Pitfall 3: "The rest" processes already-styled nodes

```typescript
// WRONG ORDER:
rules: [
  { color: GREEN, merge: false },               // "The rest" FIRST - styles everything!
  { patterns: ["**/mirror*"], color: SILVER }   // Never runs - everything already processed
]

// CORRECT ORDER:
rules: [
  { patterns: ["**/mirror*"], color: SILVER },  // Specific patterns FIRST
  { color: GREEN, merge: false }                // "The rest" LAST
]
```

#### Pitfall 4: Outline of outline

When creating outlines, the outline object is added to the scene. Without protection, a subsequent rule might try to outline the outline:

```typescript
// This is handled automatically!
// Outlines are marked with geometryEditingSkipRules = true
// They will be skipped by subsequent rules
```

### Advanced: Multiple Nesting Levels

For deeply nested structures:

```
DRICH_assembly (Group)
├── sector_0 (Group)
│   ├── mirror_panel (Group)
│   │   ├── mirror_surface (Mesh)
│   │   └── mirror_backing (Mesh)
│   └── sensor_array (Group)
│       ├── sensor_0 (Mesh)
│       └── sensor_1 (Mesh)
└── sector_1 (Group)
    └── ...
```

**Strategy 1: Match deepest level first**
```typescript
rules: [
  // Most specific first
  { patterns: ["**/mirror_surface*"], color: SILVER, merge: true, newName: "mirrors" },
  { patterns: ["**/sensor_*"], color: TEAL_200, merge: true, newName: "sensors" },
  // Everything else
  { color: GREEN_100, merge: false }
]
```

**Strategy 2: Match by branch**
```typescript
rules: [
  // Match parent groups, style all descendants
  { patterns: ["**/mirror_panel"], color: SILVER, merge: false },
  { patterns: ["**/sensor_array"], color: TEAL_200, merge: false },
  // Everything else
  { color: GREEN_100, merge: false }
]
```

**Strategy 3: Merge entire branches**
```typescript
rules: [
  // Merge all meshes under mirror_panel into one
  { patterns: ["**/mirror_panel/**"], merge: true, newName: "mirrors" },
  // Merge all sensors
  { patterns: ["**/sensor_array/**"], merge: true, newName: "sensors" }
]
```

### Visualizing the Processing

Here's a complete example showing the processing flow:

```typescript
// Geometry:
// BeamPipe_assembly
// ├── v_upstream_coating
// │   ├── Left
// │   └── Right
// ├── v_downstream_section
// └── center_pipe

{
  name: "BeamPipe_assembly*",
  rules: [
    // Rule 1: Match v_upstream branch
    {
      patterns: ["**/v_upstream*"],
      color: INDIGO_200,
      merge: false,
      outline: true
    },
    // Rule 2: The rest
    {
      color: INDIGO_80,
      merge: false,
      outline: true
    }
  ]
}

// Processing steps:
//
// 1. Clear all skip flags on BeamPipe_assembly tree
//
// 2. Rule 1 executes:
//    - Pattern "**/v_upstream*" matches "v_upstream_coating"
//    - applyToDescendants=true (default)
//    - Traverse v_upstream_coating:
//      - Left (Mesh): color=INDIGO_200, create outline, mark processed
//      - Right (Mesh): color=INDIGO_200, create outline, mark processed
//    - Mark v_upstream_coating as processed
//
// 3. Rule 2 ("the rest") executes:
//    - Traverse BeamPipe_assembly looking for unprocessed meshes:
//      - v_upstream_coating: skip (processed)
//      - Left: skip (in processed branch - parent is processed)
//      - Right: skip (in processed branch)
//      - Left_outline: skip (marked when created)
//      - Right_outline: skip (marked when created)
//      - v_downstream_section: NOT in processed branch
//        → color=INDIGO_80, create outline, mark processed
//      - center_pipe: NOT in processed branch
//        → color=INDIGO_80, create outline, mark processed
//
// Final result:
// ├── v_upstream_coating (processed)
// │   ├── Left ─────────── INDIGO_200 + outline
// │   ├── Left_outline ─── (auto-created)
// │   ├── Right ────────── INDIGO_200 + outline
// │   └── Right_outline ── (auto-created)
// ├── v_downstream_section ─ INDIGO_80 + outline
// ├── v_downstream_section_outline
// ├── center_pipe ────────── INDIGO_80 + outline
// └── center_pipe_outline
```

## Examples

### Simple Color Change

```typescript
{
  name: "HcalBarrel*",
  rules: [
    {
      color: 0x90CAF9,  // Light blue
      merge: true,
      outline: true
    }
  ]
}
```

### Multiple Patterns with Different Styles

```typescript
{
  name: "DRICH*",
  rules: [
    // Mirrors get special treatment
    {
      patterns: ["**/DRICH_mirror*"],
      color: SILVER,
      merge: true,
      outline: false,
      newName: "DRICH_mirror"
    },
    // PDUs in teal
    {
      patterns: ["**/DRICH*pdu*"],
      color: TEAL_200,
      merge: true,
      newName: "DRICH_pdu"
    },
    // Everything else in light green
    {
      color: GREEN_100,
      merge: false,
      outline: true
    }
  ]
}
```

### Transparent Material

```typescript
{
  name: "InnerTrackerSupport_assembly*",
  rules: [
    {
      material: new THREE.MeshStandardMaterial({
        color: 0x878F99,      // Titanium
        roughness: 0.4,
        metalness: 0.2,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
      }),
      outline: true,
      outlineColor: 0xDBE4EB,  // Chrome
      merge: true
    }
  ]
}
```

### Glass-like Material (DIRC)

```typescript
{
  patterns: ["**/*box*", "**/*prism*"],
  material: new THREE.MeshPhysicalMaterial({
    color: 0xA5D6A7,        // Green
    metalness: 0.3,
    roughness: 0.2,
    envMapIntensity: 0.5,
    clearcoat: 0.8,
    transparent: true,
    opacity: 0.5,
    reflectivity: 0.2,
    ior: 0.9,
    side: THREE.DoubleSide
  }),
  newName: "DIRC_barAndPrisms"
}
```

### Hierarchical Processing (BeamPipe Example)

```typescript
{
  name: "BeamPipe_assembly*",
  rules: [
    // Match v_upstream nodes AND all their children
    {
      patterns: ["**/v_upstream*"],
      color: 0x9FA8DA,     // Indigo 200
      merge: false,        // Keep individual meshes
      outline: true
      // applyToDescendants defaults to true
    },
    // "The rest" - skips v_upstream branch entirely
    {
      color: 0xD1D9F0,     // Indigo 80
      merge: false,
      outline: true
    }
  ]
}
```

## Built-in Color Palette

Firebird provides a curated color palette in `cool3-geometry-ruleset.ts`:

### Cool Colors (Light/Pastel)
| Constant | Hex | Use Case |
|----------|-----|----------|
| `BLUE_50` | `0xE3F2FD` | Very light backgrounds |
| `CYAN_50` | `0xE0F7FA` | Light cyan accents |
| `INDIGO_80` | `0xD1D9F0` | Light indigo |
| `INDIGO_150` | `0xB2BBE0` | Medium-light indigo |
| `GREEN_100` | `0xC8E6C9` | Light green (PID) |
| `YELLOW_100` | `0xFFF9C4` | Light yellow (tracking) |

### Medium Colors
| Constant | Hex | Use Case |
|----------|-----|----------|
| `AMBER_200` | `0xFFE082` | Tracking detectors |
| `BLUE_200` | `0x90CAF9` | HCAL |
| `TEAL_200` | `0x80CBC4` | TOF components |
| `INDIGO_200` | `0x9FA8DA` | ECAL |
| `ORANGE_200` | `0xFFCC80` | Roman pots |

### Metallic Colors
| Constant | Hex | Use Case |
|----------|-----|----------|
| `SILVER` | `0xC0C0C0` | Mirrors, rails |
| `CHROME` | `0xDBE4EB` | Polished metal |
| `STEEL_BLUE` | `0x4682B4` | Beam pipes |
| `TITANIUM` | `0x878F99` | Supports |
| `COPPER` | `0xB87333` | Conductors |

### Color Scheme Philosophy

The COOL3 theme follows detector-type conventions:

| Detector Type | Color Family | Examples |
|---------------|--------------|----------|
| **Tracking** | Yellowish-Orange | Vertex, Si Trackers, MPGD |
| **PID** | Greenish | TOF, DIRC, RICH |
| **ECAL** | Pink/Violet | Forward, Barrel, Backward |
| **HCAL** | Bluish | LFHCAL, HcalBarrel |
| **Flux Return** | Grey | FluxBarrel, FluxEndcap |
| **Beam Pipes** | Blue Metallic | Electron pipe |
| **Magnets** | Neutral/Light | Solenoid, Beamline magnets |

## Creating Custom Themes

To create a custom theme:

1. **Create a new file** in `src/app/theme/`:

```typescript
// my-theme-geometry-ruleset.ts
import * as THREE from "three";

// Define your colors
export const MY_PRIMARY = 0x3498DB;
export const MY_SECONDARY = 0x2ECC71;

// Export your ruleset
export const myThemeRules = [
  {
    name: "MyDetector*",
    rules: [
      { color: MY_PRIMARY, merge: true, outline: true }
    ]
  },
  // ... more rules
];
```

2. **Register the theme** in the geometry processor or configuration.

## Performance Considerations

### Merge for Performance

Merging reduces draw calls significantly:

```typescript
// Good for performance - single merged mesh
{ merge: true, newName: "HCAL_merged" }

// More flexible but slower - individual meshes
{ merge: false }
```

### Outline Threshold

Higher threshold = fewer edges = better performance:

```typescript
{
  outline: true,
  outlineThresholdAngle: 60  // Only show sharp edges
}
```

### Simplification

For complex geometries:

```typescript
{
  simplifyMeshes: true,
  simplifyRatio: 0.5  // Keep 50% of vertices
}
```

## Debugging Rules

### Check Console Output

The geometry processor logs timing information:

```
[processRuleSets] Applying 25 theme rules...
[processRuleSets] Applying rules took >0.5s: 1234.5 for DRICH_assembly
```

### Verify Patterns

Use the browser console to test patterns:

```javascript
// In browser dev tools
import outmatch from 'outmatch';
const pattern = outmatch('**/v_upstream*');
pattern('BeamPipe_assembly/v_upstream_coating');  // true
pattern('BeamPipe_assembly/v_upstream_coating/Left');  // false
```

## API Reference

### Main Functions

```typescript
// Clear skip flags before processing
clearGeometryEditingFlags(root: Object3D): void

// Apply a single rule to a node
editThreeNodeContent(node: Object3D, rule: EditThreeNodeRule): void

// Check if node was already processed
isAlreadyProcessed(obj: Object3D): boolean

// Check if node or any ancestor was processed
isInProcessedBranch(obj: Object3D): boolean
```

### ThreeGeometryProcessor

```typescript
class ThreeGeometryProcessor {
  // Apply rulesets to detectors
  processRuleSets(
    ruleSets: DetectorThreeRuleSet[],
    detectors: Subdetector[]
  ): void
}
```

### Loading Rules from JSON

Rules can be loaded from JSONC files:

```typescript
import { ruleSetsFromObj } from './three-geometry.processor';

// Parse JSON with material support
const ruleSets = ruleSetsFromObj(jsonData);
```

JSON format supports `materialJson` for Three.js materials:

```json
{
  "name": "MyDetector*",
  "rules": [
    {
      "patterns": ["**/*box*"],
      "color": "0xA5D6A7",
      "materialJson": {
        "type": "MeshStandardMaterial",
        "color": 10809767,
        "roughness": 0.5,
        "metalness": 0.3
      }
    }
  ]
}
```
