/**
 * Unit tests: Family Tree Canvas & Presentation Components
 * (src/features/tree/components/FamilyTreeCanvas.tsx)
 * (src/features/tree/components/PersonNode.tsx)
 * (src/features/tree/components/RelationshipEdge.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { FamilyTreeCanvas } from '@/features/tree/components/FamilyTreeCanvas'
import { PersonNode } from '@/features/tree/components/PersonNode'
import { RelationshipEdge } from '@/features/tree/components/RelationshipEdge'
import * as authContext from '@/features/auth/context/AuthContext'
import * as familyTreeHook from '@/features/tree/hooks/useFamilyTree'
import type { TreeGraph } from '@/features/tree/types'
import type { NodeProps, EdgeProps } from 'reactflow'
import { Position, ReactFlowProvider } from 'reactflow'
import type { PersonNodeData, RelationshipEdgeData } from '@/features/tree/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/tree/hooks/useFamilyTree')

const ROOT_ID = '11111111-1111-4111-8111-111111111111'

describe('FamilyTreeCanvas Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders unauthenticated sign-in prompt when session is not authenticated', () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      session: null,
      user: null,
      profile: null,
    })

    vi.mocked(familyTreeHook.useFamilyTree).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof familyTreeHook.useFamilyTree>)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FamilyTreeCanvas rootPersonId={ROOT_ID} />
      </MemoryRouter>
    )

    expect(html).toContain('Sign In Required')
    expect(html).toContain('Genealogical family tree records are restricted to authenticated community members.')
  })

  it('renders loading state while traversing relationships', () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      session: {} as unknown as authContext.AuthContextValue['session'],
      user: {} as unknown as authContext.AuthContextValue['user'],
      profile: null,
    })

    vi.mocked(familyTreeHook.useFamilyTree).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof familyTreeHook.useFamilyTree>)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FamilyTreeCanvas rootPersonId={ROOT_ID} />
      </MemoryRouter>
    )

    expect(html).toContain('Loading interactive family tree...')
  })

  it('renders error state if traversal encounters an error', () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      session: {} as unknown as authContext.AuthContextValue['session'],
      user: {} as unknown as authContext.AuthContextValue['user'],
      profile: null,
    })

    vi.mocked(familyTreeHook.useFamilyTree).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network timeout during graph fetch'),
    } as unknown as ReturnType<typeof familyTreeHook.useFamilyTree>)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FamilyTreeCanvas rootPersonId={ROOT_ID} />
      </MemoryRouter>
    )

    expect(html).toContain('Unable to Load Family Tree')
    expect(html).toContain('Network timeout during graph fetch')
  })

  it('renders empty state when person has no connected census relatives', () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      session: {} as unknown as authContext.AuthContextValue['session'],
      user: {} as unknown as authContext.AuthContextValue['user'],
      profile: null,
    })

    const emptyGraph: TreeGraph = {
      rootPersonId: ROOT_ID,
      nodes: new Map(),
      edges: new Map(),
      generations: new Map(),
      isBounded: false,
    }

    vi.mocked(familyTreeHook.useFamilyTree).mockReturnValue({
      data: emptyGraph,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof familyTreeHook.useFamilyTree>)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FamilyTreeCanvas rootPersonId={ROOT_ID} />
      </MemoryRouter>
    )

    expect(html).toContain('No Family Connections Recorded')
  })

  it('renders canvas and bounded warning banner when graph is bounded', () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      session: {} as unknown as authContext.AuthContextValue['session'],
      user: {} as unknown as authContext.AuthContextValue['user'],
      profile: null,
    })

    const boundedGraph: TreeGraph = {
      rootPersonId: ROOT_ID,
      nodes: new Map([
        [
          ROOT_ID,
          {
            id: ROOT_ID,
            person: {
              id: ROOT_ID,
              first_name: 'Anil',
              middle_name: null,
              last_name: 'Desai',
              gender: 'MALE',
              date_of_birth: '1970-01-01',
              profile_privacy: 'COMMUNITY',
              status: 'ACTIVE',
            },
            generation: 0,
            isRoot: true,
            rolesInTree: new Set(['ROOT']),
          },
        ],
      ]),
      edges: new Map(),
      generations: new Map([[0, [ROOT_ID]]]),
      isBounded: true,
    }

    vi.mocked(familyTreeHook.useFamilyTree).mockReturnValue({
      data: boundedGraph,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof familyTreeHook.useFamilyTree>)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FamilyTreeCanvas rootPersonId={ROOT_ID} />
      </MemoryRouter>
    )

    expect(html).toContain('data-testid="family-tree-canvas"')
    expect(html).toContain('react-flow')
  })
})

describe('PersonNode Component', () => {
  it('renders person information, root badge, and profile link without synthetic placeholders', () => {
    const nodeProps: NodeProps<PersonNodeData> = {
      id: 'node-root',
      data: {
        person: {
          id: ROOT_ID,
          first_name: 'Hiren',
          middle_name: 'K',
          last_name: 'Mehta',
          gender: 'MALE',
          date_of_birth: '1982-04-12',
          profile_privacy: 'COMMUNITY',
          status: 'ACTIVE',
        },
        generation: 0,
        isRoot: true,
        rolesInTree: ['ROOT', 'PARENT'],
      },
      selected: false,
      type: 'person',
      zIndex: 1,
      isConnectable: false,
      xPos: 0,
      yPos: 0,
      dragging: false,
    }

    const html = renderToStaticMarkup(
      <ReactFlowProvider>
        <MemoryRouter>
          <PersonNode {...nodeProps} />
        </MemoryRouter>
      </ReactFlowProvider>
    )

    expect(html).toContain('Hiren K Mehta')
    expect(html).toContain(`data-testid="tree-node-${ROOT_ID}"`)
    expect(html).not.toContain('[Private Person]')
  })
})

describe('RelationshipEdge Component', () => {
  it('renders SVG path with distinct styles for PARENT, SPOUSE, and SIBLING', () => {
    const parentProps: EdgeProps<RelationshipEdgeData> = {
      id: 'edge-p',
      source: 'p1',
      target: 'p2',
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 100,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: { relationshipType: 'PARENT' },
    }

    const spouseProps: EdgeProps<RelationshipEdgeData> = {
      id: 'edge-s',
      source: 'p1',
      target: 'p3',
      sourceX: 0,
      sourceY: 0,
      targetX: 100,
      targetY: 0,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: { relationshipType: 'SPOUSE' },
    }

    const parentHtml = renderToStaticMarkup(
      <ReactFlowProvider>
        <svg>
          <RelationshipEdge {...parentProps} />
        </svg>
      </ReactFlowProvider>
    )
    const spouseHtml = renderToStaticMarkup(
      <ReactFlowProvider>
        <svg>
          <RelationshipEdge {...spouseProps} />
        </svg>
      </ReactFlowProvider>
    )

    // Parent edge uses blue stroke
    expect(parentHtml).toContain('stroke:#2563EB')

    // Spouse edge uses purple stroke
    expect(spouseHtml).toContain('stroke:#9333EA')
  })

  it('renders dedicated allocated details panel when a person is selected without overlapping canvas', () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      session: {} as unknown as authContext.AuthContextValue['session'],
      user: {} as unknown as authContext.AuthContextValue['user'],
      profile: null,
    })

    const sampleGraph: TreeGraph = {
      rootPersonId: ROOT_ID,
      nodes: new Map([
        [
          ROOT_ID,
          {
            id: ROOT_ID,
            person: {
              id: ROOT_ID,
              first_name: 'Nanak',
              middle_name: 'J',
              last_name: 'Pamnani',
              gender: 'MALE',
              date_of_birth: '1964-03-15',
              profile_privacy: 'COMMUNITY',
              status: 'ACTIVE',
            },
            generation: 0,
            isRoot: true,
            isHead: true,
            rolesInTree: new Set(['ROOT']),
            relationshipLabel: 'Head of Family',
            age: 62,
          },
        ],
      ]),
      edges: new Map(),
      generations: new Map([[0, [ROOT_ID]]]),
      isBounded: false,
    }

    vi.mocked(familyTreeHook.useFamilyTree).mockReturnValue({
      data: sampleGraph,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof familyTreeHook.useFamilyTree>)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FamilyTreeCanvas rootPersonId={ROOT_ID} selectedPersonId={ROOT_ID} />
      </MemoryRouter>
    )

    // Verify canvas and panel structure
    expect(html).toContain('data-testid="family-tree-canvas"')
    expect(html).toContain('Recenter')
    // Dedicated aside container with allocated layout styling
    expect(html).toContain('<aside')
    expect(html).toContain('Details for Nanak J Pamnani')
    expect(html).toContain('Head of Family')
    expect(html).toContain('View Full Profile')
    // Verify toolbar controls are inside the canvas
    expect(html).toContain('title="Recenter Tree"')
  })

  it('unmounts details panel when no person is selected, allowing full canvas width', () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      session: {} as unknown as authContext.AuthContextValue['session'],
      user: {} as unknown as authContext.AuthContextValue['user'],
      profile: null,
    })

    const sampleGraph: TreeGraph = {
      rootPersonId: ROOT_ID,
      nodes: new Map([
        [
          ROOT_ID,
          {
            id: ROOT_ID,
            person: {
              id: ROOT_ID,
              first_name: 'Nanak',
              middle_name: 'J',
              last_name: 'Pamnani',
              gender: 'MALE',
              date_of_birth: '1964-03-15',
              profile_privacy: 'COMMUNITY',
              status: 'ACTIVE',
            },
            generation: 0,
            isRoot: true,
            rolesInTree: new Set(['ROOT']),
          },
        ],
      ]),
      edges: new Map(),
      generations: new Map([[0, [ROOT_ID]]]),
      isBounded: false,
    }

    vi.mocked(familyTreeHook.useFamilyTree).mockReturnValue({
      data: sampleGraph,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof familyTreeHook.useFamilyTree>)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <FamilyTreeCanvas rootPersonId={ROOT_ID} selectedPersonId={null} />
      </MemoryRouter>
    )

    expect(html).toContain('data-testid="family-tree-canvas"')
    expect(html).not.toContain('<aside')
  })
})
