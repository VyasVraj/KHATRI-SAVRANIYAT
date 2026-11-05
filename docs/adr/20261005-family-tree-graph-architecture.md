# ADR: Family Tree Graph Model, Bounded Traversal & Generation-Tiered Layout Architecture

- **Status:** Proposed (Subtask 3 Discovery Complete; Awaiting Implementation Authorization)
- **Date:** 2026-10-05
- **Target Systems:** Phase 5 — Family Tree (Subtask 3: Tree Layout Engine & React Flow Graph Canvas)
- **Context Area:** Genealogical Graph Traversal, Privacy-Preserving Graph Modeling, Deterministic Generation Layout, React Flow Canvas Architecture

---

## 1. Context

Following the completion of:
- **Phase 5 Subtask 1**: Canonical database schema (`public.relationships`), two-gate access control (SQL privileges + RLS dual-endpoint enforcement), integrity triggers, and relationships service layer.
- **Phase 5 Subtask 2**: Person Detail relationship management UI, modal dialogs, and mutation hooks.

The platform requires a visual, interactive family tree canvas (Subtask 3) centered on a selected individual.

Genealogical graphs possess unique structural properties that differ fundamentally from standard directed acyclic graphs (DAGs) and tree structures:
1. **Multi-Parent & Blended Topologies**: A child may have one or two parents, a person may have multiple sequential spouses, and families may blend across generations.
2. **Horizontal Symmetric Edges**: Marital (`SPOUSE`) and direct sibling (`SIBLING`) relationships are symmetric and exist laterally on the same generation tier, whereas parent-child (`PARENT`) relationships are strictly directional across generation tiers.
3. **Dual-Endpoint Privacy**: If an endpoint person is private under PostgreSQL RLS, the relationship edge is invisible. The graph must handle missing, redacted, and partially visible branches without crashing or leaking the existence of hidden relationships.
4. **Performance & Scalability**: Communities comprise thousands of individuals. Unbounded recursive traversals risk database exhaustion, client memory leaks, and browser freeze.

A clear, robust architectural design is required before implementing the layout engine and React Flow canvas.

---

## 2. Decision

We establish the following architectural decisions for Phase 5 Subtask 3:

### 2.1 Four-Tier Separation of Concerns
The family tree visualization architecture enforces strict decoupling across four tiers:

```
Tier 1: Relational Database Records (public.relationships, public.persons via Supabase RLS)
                             ↓
Tier 2: Domain Graph Model (Pure business objects: TreeGraph, TreeNode, TreeEdge)
                             ↓
Tier 3: Layout Model (Deterministic geometric coordinates: LayoutGraph, LayoutNode, LayoutEdge)
                             ↓
Tier 4: Presentation / Canvas (React Flow: ReactFlowCanvas, PersonNode, RelationshipEdge)
```

- **Domain Graph Tier**: Pure domain representation containing person metadata, relationship metadata, generation depth, and role tags. Zero awareness of DOM, SVG, pixels, or React Flow.
- **Layout Model Tier**: Pure geometric calculation assigning `(x, y)` coordinates, bounding boxes, and routing waypoints based on generation tiers and family grouping.
- **Presentation Tier**: React Flow components strictly consume layout model outputs. If React Flow is updated or replaced, core domain logic and layout algorithms remain unaffected.

### 2.2 Bounded Breadth-First Search (BFS) Traversal
To guarantee finite execution, high performance, and responsive UI:
1. **Traversal Origin**: Centered on an authenticated, visible `rootPersonId`.
2. **Bounded Depth**:
   - **Upward (Ancestors)**: Maximum 2 generations (Parents at -1, Grandparents at -2).
   - **Downward (Descendants)**: Maximum 2 generations (Children at +1, Grandchildren at +2).
   - **Lateral (Partners & Siblings)**: 1 hop (Spouses and direct Siblings of discovered persons).
   - **Total Generation Span**: Clamped strictly between `[-2, +2]` (5 total generations).
3. **Hard Bounds**:
   - Maximum nodes: **100 persons**.
   - Maximum edges: **150 relationships**.
4. **Cycle & Visited Defenses**:
   - In-memory `visitedPersons = new Set<string>()` and `visitedRelationships = new Set<string>()` prevent duplicate traversal and infinite loops.
   - Cross-generational or unexpected cycles are detected client-side; cycled edges are flagged and rendered safely without crashing.

### 2.3 Strict Privacy Boundary — Zero Synthetic Placeholders
- **No Hidden-Edge Leakage**: If an endpoint person is marked `PRIVATE` and inaccessible to the caller, PostgreSQL RLS excludes the relationship row.
- **No `[Private Person]` Placeholders**: The graph layer receives zero rows and renders zero placeholder nodes. Generating synthetic placeholder boxes like `[Private Person]` or `[Confidential Relative]` violates security by confirming to unauthorized viewers that a secret relationship exists.
- **Unauthenticated Gate 1 Enforcement**: Unauthenticated callers possess zero privileges on `public.relationships`. The tree canvas renders an unauthenticated sign-in prompt and executes zero relationship queries.

### 2.4 Layout Algorithm Selection: Custom Generation-Tiered Layout
We adopt a **Custom Generation-Tiered Genealogical Layout Algorithm** as the primary engine:
1. **Generation-to-Y Mapping**:
   $$Y = \text{generation} \times (\text{NODE\_HEIGHT} + \text{VERTICAL\_SPACING})$$
   Where Root is at $Y = 0$, Parents at $Y = -220$, Grandparents at $Y = -440$, Children at $Y = +220$, and Grandchildren at $Y = +440$.
2. **Horizontal Slotting**:
   - Spouses placed side-by-side with horizontal spacing.
   - Sibling clusters centered under their shared parent(s).
   - Root person centered horizontally at $X = 0$.
3. **Determinism**: Identical graph inputs produce byte-for-byte identical coordinate matrices.
4. **Zero Layout Dependencies**: Requires zero external layout packages (`@dagrejs/dagre` or `elkjs`), keeping bundle size minimal and logic 100% testable in Vitest.

---

## 3. Consequences

### Positive
- **Predictable & Robust**: Fixed generational Y coordinates prevent spouse warping and unnatural edge routing typical of general DAG algorithms.
- **Privacy-First**: Full alignment with database RLS; zero information leakage regarding hidden persons.
- **Performance**: Bounded BFS traversal completes in 3–4 batched query rounds, fetching fewer than 100 nodes in under 200ms.
- **Decoupled**: React Flow types never pollute the domain layer.
- **Testable**: Domain graph construction and layout coordinate assignment can be unit tested in Vitest without jsdom or browser rendering.

### Negative / Limitations
- **Distant Ancestry Boundary**: Distant relatives (beyond 2 generations up or down) are not visible on a single view. Users must click a boundary relative to re-center the tree graph on that person.
- **Complex Consanguinity**: High-degree consanguinity or multi-generational crossover marriages may produce overlapping horizontal edges, requiring orthogonal step routing.

---

## 4. Alternatives Considered

1. **Dagre Layout Engine (`@dagrejs/dagre`)**:
   - *Rejected*: Dagre treats graphs as general directed flowcharts. In family trees, it often pulls spouses into vertical parent-child tiers, introduces cycles when bidirectional links occur, and lacks genealogical grouping.
2. **Eclipse Layout Kernel (`elkjs`)**:
   - *Rejected*: ELK is powerful but adds ~1.5 MB to the client bundle, requires Web Worker orchestration to avoid UI thread blocking, and introduces high cognitive overhead.
3. **Unbounded Database Recursive CTE Query**:
   - *Rejected*: Client-driven recursive SQL queries risk high server CPU consumption and can traverse thousands of community nodes, overwhelming the frontend.
4. **Synthetic `[Private Person]` Placeholders**:
   - *Rejected*: Violates the platform threat model. Indicating that a private person exists leaks sensitive family structure (e.g. undisclosed children or unverified marriages).
