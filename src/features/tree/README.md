# Family Tree Feature (`src/features/tree`)

## Overview

The **Family Tree** feature provides bounded genealogical graph traversal, a pure deterministic generation-tiered layout engine, and an interactive React Flow canvas component for visualizing family relationships centered around a target census individual (`public.persons`).

---

## Architectural Principles

1. **Four-Tier Clean Separation**:
   - **Database Rows**: `public.relationships` and `public.persons` retrieved via authenticated Supabase client.
   - **Domain Graph**: In-memory `TreeGraph` data structure (`TreeNode`, `TreeEdge`, `Map<number, string[]> generations`).
   - **Layout Model**: Pure TypeScript deterministic coordinate calculator (`computeTreeLayout`) returning fixed `(x, y)` coordinates.
   - **Presentation Canvas**: Interactive `FamilyTreeCanvas` powered by React Flow with custom nodes, edges, controls, and legend.

2. **PERSON != USER**:
   - Tree nodes strictly represent human census entities (`public.persons`), not authentication users (`auth.users`).

3. **Privacy-First & Zero Synthetic Placeholders**:
   - **Gate 1**: Only authenticated sessions have access to `public.relationships`. Unauthenticated visitors receive a sign-in prompt.
   - **Gate 2**: PostgreSQL Row-Level Security enforces dual-endpoint privacy. If an individual or relationship is hidden/restricted, the traversal terminates at the visible boundary. **The tree engine never manufactures synthetic placeholders (`[Private Person]`, etc.)**.

4. **Bounded Traversal Safety**:
   - Generation bounds: `-2` (grandparents) to `+2` (grandchildren).
   - Lateral bounds: `1` hop only (direct spouses and siblings of the root person; indirect in-laws are excluded).
   - Hard limits: Maximum `100` nodes and `150` edges per tree visualization.

5. **No External Graph Engine Overhead**:
   - Uses a pure, deterministic TypeScript algorithm. Zero ELK, Dagre, or heavy layout dependencies.

---

## Directory Structure

```text
src/features/tree/
├── components/
│   ├── FamilyTreeCanvas.tsx    # Primary React Flow canvas container
│   ├── PersonNode.tsx          # Custom node rendering person summary card
│   ├── RelationshipEdge.tsx    # Custom edge rendering relationship style/marker
│   ├── TreeControls.tsx        # Floating toolbar for pan, zoom, fitView, recenter
│   └── TreeLegend.tsx          # Collapsible visual legend for edge and node types
├── hooks/
│   ├── useFamilyTree.ts        # TanStack Query hook fetching bounded domain graph
│   └── useTreeLayout.ts        # Pure memoized hook computing node/edge layout coordinates
├── pages/
│   └── FamilyTreePage.tsx      # Full-page tree viewer (/people/:personId/tree)
├── services/
│   └── tree.service.ts         # Supabase client query service for bounded BFS
├── utils/
│   ├── generation-layout.ts    # Deterministic generation-tiered layout algorithm
│   └── graph-builder.ts        # Pure BFS graph builder and bounds enforcer
├── types.ts                    # Domain graph and layout types
├── index.ts                    # Barrel exports
└── README.md                   # This documentation
```

---

## Domain Model

### Generation Tiers

The tree layout positions persons along horizontal tiers according to generational distance from the root individual:

| Generation | Role | Y-Coordinate Formula |
|---|---|---|
| `-2` | Grandparents | `-2 * (NODE_HEIGHT + VERTICAL_SPACING)` |
| `-1` | Parents | `-1 * (NODE_HEIGHT + VERTICAL_SPACING)` |
| `0` | Root Person, Spouses, Siblings | `0` (Center tier) |
| `+1` | Children | `+1 * (NODE_HEIGHT + VERTICAL_SPACING)` |
| `+2` | Grandchildren | `+2 * (NODE_HEIGHT + VERTICAL_SPACING)` |

Within each generation tier, nodes are centered symmetrically around `X = 0`.

### Relationship Edge Styles

| Type | Stroke Style | Color | Arrow Marker | Semantics |
|---|---|---|---|---|
| `PARENT` | Solid | Blue (`#3b82f6`) | Yes (Parent &rarr; Child) | Directional lineage |
| `SPOUSE` | Dashed (`5 5`) | Rose (`#e11d48`) | No | Symmetric marital union |
| `SIBLING` | Dotted (`3 3`) | Teal (`#0d9488`) | No | Symmetric fraternal bond |

---

## Public API

### Hooks

- `useFamilyTree(rootPersonId: string)`:
  Fetches `TreeGraph` for the given person using TanStack Query (`staleTime: 5 mins`).
- `useTreeLayout(treeGraph?: TreeGraph | null)`:
  Computes memoized `PersonFlowNode[]` and `RelationshipFlowEdge[]` along with canvas bounding box.

### Pages

- `FamilyTreePage`:
  Full-screen dedicated tree view route mounted at `/people/:personId/tree` within `ProtectedRoute`.
  Renders root individual context, back navigation to person record (`/people/:personId`), census link, and embedded `FamilyTreeCanvas`.

### Components

- `FamilyTreeCanvas`:
  Interactive React Flow canvas component with controls and legend.
  ```tsx
  <FamilyTreeCanvas rootPersonId={personId} className="h-[600px]" />
  ```

### Services & Utils

- `fetchFamilyTreeGraph(rootPersonId: string)`: Fetches relationships and persons from Supabase.
- `buildTreeGraph(rootPerson, rawRelationships, personMap)`: Pure BFS graph builder.
- `computeTreeLayout(treeGraph)`: Pure coordinate calculation.

---

## Navigation & Person Detail Integration

1. **Person Detail to Tree**:
   On the Person Detail page (`/people/:personId`), a "Family tree" action button navigates to `ROUTES.PERSON_TREE(person.id)` (`/people/:personId/tree`).
2. **Tree to Person Detail**:
   - The tree page header provides a "Back to profile" button returning to `/people/:personId`.
   - Each rendered person node includes an external profile link directing to `/people/:id`.
