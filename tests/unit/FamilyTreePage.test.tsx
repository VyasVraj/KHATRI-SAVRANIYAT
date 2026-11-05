/**
 * Unit tests: FamilyTreePage & Person Detail Page Integration
 * (src/features/tree/pages/FamilyTreePage.tsx)
 * (src/features/people/pages/PersonDetailPage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { FamilyTreePage } from '@/features/tree/pages/FamilyTreePage'
import { PersonDetailPage } from '@/features/people/pages/PersonDetailPage'
import * as usePersonHook from '@/features/people/hooks/usePerson'
import * as usePersonMutationsHook from '@/features/people/hooks/usePersonMutations'
import * as authContext from '@/features/auth/context/AuthContext'
import * as familyTreeHook from '@/features/tree/hooks/useFamilyTree'
import type { Tables } from '@/types/database.types'
import type { TreeGraph } from '@/features/tree/types'

vi.mock('@/features/people/hooks/usePerson')
vi.mock('@/features/people/hooks/usePersonMutations')
vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/tree/hooks/useFamilyTree')
vi.mock('@/features/relationships', () => ({
  PersonRelationshipsList: () => <div data-testid="mock-relationships-list" />,
}))
vi.mock('@/features/family-members', () => ({
  PersonFamiliesList: () => <div data-testid="mock-families-list" />,
}))
vi.mock('@/features/connections', () => ({
  PersonConnectionSection: () => <div data-testid="mock-connection-section" />,
}))
vi.mock('@/features/claims', () => ({
  PersonClaimSection: () => <div data-testid="mock-claim-section" />,
}))


const VALID_UUID = '11111111-1111-4111-8111-111111111111'
const INVALID_UUID = 'invalid-not-a-uuid'

const MOCK_PERSON: Tables<'persons'> = {
  id: VALID_UUID,
  first_name: 'Devendra',
  middle_name: 'Kumar',
  last_name: 'Patel',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1965-06-15',
  date_of_death: null,
  birth_place: 'Ahmedabad',
  gotra: 'Kashyap',
  kul: null,
  nukh: null,
  email_contact: 'devendra.patel@example.com',
  phone: '+919876543210',
  phone_secondary: null,
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'PRIVATE',
  dob_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  user_id: 'secret-auth-user-id-999',
  created_by: 'secret-creator-user-id-888',
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-02T10:00:00Z',
  deleted_at: null,
}

describe('FamilyTreePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default authenticated session
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      session: {} as unknown as authContext.AuthContextValue['session'],
      user: {} as unknown as authContext.AuthContextValue['user'],
      profile: null,
    })

    // Default empty graph for canvas
    const emptyGraph: TreeGraph = {
      rootPersonId: VALID_UUID,
      nodes: new Map([
        [
          VALID_UUID,
          {
            id: VALID_UUID,
            person: {
              id: VALID_UUID,
              first_name: 'Devendra',
              middle_name: 'Kumar',
              last_name: 'Patel',
              gender: 'MALE',
              date_of_birth: '1965-06-15',
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
      generations: new Map([[0, [VALID_UUID]]]),
      isBounded: false,
    }

    vi.mocked(familyTreeHook.useFamilyTree).mockReturnValue({
      data: emptyGraph,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof familyTreeHook.useFamilyTree>)
  })

  it('renders invalid identifier alert when personId is not a valid UUID', () => {
    vi.mocked(usePersonHook.usePerson).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePersonHook.usePerson>)

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/people/${INVALID_UUID}/tree`]}>
        <Routes>
          <Route path="/people/:personId/tree" element={<FamilyTreePage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(html).toContain('Invalid Person Identifier')
    expect(html).toContain('The requested URL does not contain a valid person identifier.')
    expect(html).toContain('Back to census')
  })

  it('renders loading state while person record is loading', () => {
    vi.mocked(usePersonHook.usePerson).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof usePersonHook.usePerson>)

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/people/${VALID_UUID}/tree`]}>
        <Routes>
          <Route path="/people/:personId/tree" element={<FamilyTreePage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(html).toContain('Loading family tree record…')
  })

  it('renders error alert when person record fetch fails or record is not visible', () => {
    vi.mocked(usePersonHook.usePerson).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Permission denied under RLS policy'),
    } as unknown as ReturnType<typeof usePersonHook.usePerson>)

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/people/${VALID_UUID}/tree`]}>
        <Routes>
          <Route path="/people/:personId/tree" element={<FamilyTreePage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(html).toContain('Unable to Load Family Tree')
    expect(html).toContain('Permission denied under RLS policy')
    expect(html).toContain('Back to census')
  })

  it('renders root person context and embedded tree canvas on success', () => {
    vi.mocked(usePersonHook.usePerson).mockReturnValue({
      data: MOCK_PERSON,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePersonHook.usePerson>)

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/people/${VALID_UUID}/tree`]}>
        <Routes>
          <Route path="/people/:personId/tree" element={<FamilyTreePage />} />
        </Routes>
      </MemoryRouter>
    )

    // Heading and title
    expect(html).toContain('Devendra Kumar Patel’s Family Tree')
    expect(html).toContain('Interactive genealogical graph centered on Devendra Kumar Patel')

    // Root metadata
    expect(html).toContain('b. 1965')
    expect(html).toContain('Male')

    // Navigation buttons
    expect(html).toContain('Back to profile')
    expect(html).toContain('Census directory')

    // Embedded canvas
    expect(html).toContain('data-testid="family-tree-canvas"')
  })

  it('strictly preserves privacy and does not leak internal or sensitive identifiers in tree header', () => {
    vi.mocked(usePersonHook.usePerson).mockReturnValue({
      data: MOCK_PERSON,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePersonHook.usePerson>)

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/people/${VALID_UUID}/tree`]}>
        <Routes>
          <Route path="/people/:personId/tree" element={<FamilyTreePage />} />
        </Routes>
      </MemoryRouter>
    )

    // Verify internal identifiers are NOT present
    expect(html).not.toContain('secret-auth-user-id-999')
    expect(html).not.toContain('secret-creator-user-id-888')
    expect(html).not.toContain('+919876543210')
    expect(html).not.toContain('devendra.patel@example.com')
  })

  it('renders deceased lifespan indicator when person status is DECEASED', () => {
    const deceasedPerson: Tables<'persons'> = {
      ...MOCK_PERSON,
      status: 'DECEASED',
      date_of_death: '2024-11-20',
    }

    vi.mocked(usePersonHook.usePerson).mockReturnValue({
      data: deceasedPerson,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePersonHook.usePerson>)

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/people/${VALID_UUID}/tree`]}>
        <Routes>
          <Route path="/people/:personId/tree" element={<FamilyTreePage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(html).toContain('b. 1965 – d. 2024')
    expect(html).toContain('DECEASED')
  })
})

describe('PersonDetailPage Integration with Family Tree', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(usePersonMutationsHook.useSoftDeletePerson).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof usePersonMutationsHook.useSoftDeletePerson>)
  })

  it('renders "Family tree" navigation button in PersonDetailPage actions row', () => {
    vi.mocked(usePersonHook.usePerson).mockReturnValue({
      data: MOCK_PERSON,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof usePersonHook.usePerson>)

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/people/${VALID_UUID}`]}>
        <Routes>
          <Route path="/people/:personId" element={<PersonDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(html).toContain('Family tree')
    expect(html).toContain('Edit')
    expect(html).toContain('Delete')
  })
})
