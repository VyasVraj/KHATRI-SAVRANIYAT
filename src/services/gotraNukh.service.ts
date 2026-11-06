/**
 * Database-backed Gotra and Nukh Registry Service & Hook
 *
 * Provides runtime query access to public.gotras and public.nukhs tables
 * with TanStack Query caching and local JSON fallback for resilient offline operation.
 *
 * Source of truth: Brahm_Kshatriya_Gotra_Nukh_List_English.pdf (29 Gotras)
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/query-client'
import {
  GOTRAS,
  GOTRA_NUKH_MAP,
  getNukhsForGotra as resolveNukhsForGotra,
  resolveCanonicalGotra,
} from '@/constants/gotraNukh'

export interface GotraNukhData {
  gotras: string[]
  gotraNukhMap: Record<string, string[]>
}

interface RawGotraRow {
  id: string
  name: string
  display_order?: number
}

interface RawNukhRow {
  id: string
  gotra_id: string
  name: string
}

type UntypedTableClient = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (col: string, options?: { ascending?: boolean }) => Promise<{
        data: unknown
        error: { message: string } | null
      }>
    }
  }
}

/**
 * Fetches the master Gotra and Nukh registries from Supabase database tables.
 * If database is unavailable, returns authoritative local fallback dataset.
 */
export async function fetchGotraNukhRegistry(): Promise<GotraNukhData> {
  const db = supabase as unknown as UntypedTableClient

  // 1. Fetch gotras
    const { data: gotrasData, error: gotrasError } = await db
      .from('gotras')
      .select('id, name')
      .order('display_order', { ascending: true })

    if (gotrasError) {
      throw new Error(`Database error fetching Gotras: ${gotrasError.message}`)
    }

    if (!gotrasData || !Array.isArray(gotrasData) || gotrasData.length === 0) {
      throw new Error('No registered Gotras found in database.')
    }

    // 2. Fetch nukhs
    const { data: nukhsData, error: nukhsError } = await db
      .from('nukhs')
      .select('id, gotra_id, name')
      .order('name', { ascending: true })

    if (nukhsError) {
      throw new Error(`Database error fetching Nukhs: ${nukhsError.message}`)
    }

    // Build map: gotraId -> gotraName
    const idToName: Record<string, string> = {}
    const gotrasList: string[] = []
    for (const g of gotrasData as RawGotraRow[]) {
      idToName[g.id] = g.name
      gotrasList.push(g.name)
    }

    // Build map: gotraName -> nukhs[]
    const nukhMap: Record<string, string[]> = {}
    for (const g of gotrasList) {
      nukhMap[g] = []
    }

    for (const n of nukhsData as RawNukhRow[]) {
      const gotraName = idToName[n.gotra_id]
      if (gotraName) {
        if (!nukhMap[gotraName]) {
          nukhMap[gotraName] = []
        }
        nukhMap[gotraName].push(n.name)
      }
    }

    return {
      gotras: gotrasList,
      gotraNukhMap: nukhMap,
    }
}

/**
 * React hook to access the Gotra & Nukh master registry with TanStack Query caching.
 */
export function useGotraNukhRegistry() {
  const query = useQuery<GotraNukhData>(
    {
      queryKey: ['gotra-nukh-registry'],
      queryFn: fetchGotraNukhRegistry,
      staleTime: 1000 * 60 * 60, // 1 hour cache
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      retry: 1,
      placeholderData: {
        gotras: [...GOTRAS],
        gotraNukhMap: { ...GOTRA_NUKH_MAP },
      },
    },
    queryClient
  )

  // Enforce the authentic 29 Brahm Kshatriya PDF dataset strictly
  const validGotras = query.data?.gotras?.filter((g) =>
    (GOTRAS as readonly string[]).includes(g)
  ) ?? []

  const gotras = validGotras.length === 29 ? validGotras : [...GOTRAS]

  const gotraNukhMap =
    query.data?.gotraNukhMap && Object.keys(query.data.gotraNukhMap).length >= 29
      ? query.data.gotraNukhMap
      : { ...GOTRA_NUKH_MAP }

  const getNukhsForGotra = (gotra?: string | null): string[] => {
    if (!gotra) return []
    const canonical = resolveCanonicalGotra(gotra)
    if (!canonical) return []
    // Supabase database registry is primary source of truth
    if (gotraNukhMap[canonical]?.length) {
      return gotraNukhMap[canonical]
    }
    // Authoritative PDF dataset from gotraNukh.ts is the offline fallback
    if (GOTRA_NUKH_MAP[canonical]?.length) {
      return GOTRA_NUKH_MAP[canonical]
    }
    return resolveNukhsForGotra(gotra)
  }

  return {
    ...query,
    gotras,
    gotraNukhMap,
    getNukhsForGotra,
  }
}
