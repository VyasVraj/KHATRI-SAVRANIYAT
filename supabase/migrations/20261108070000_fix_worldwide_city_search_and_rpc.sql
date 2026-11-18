-- =============================================================================
-- Migration: 20261108070000_fix_worldwide_city_search_and_rpc.sql
--
-- Description:
--   1. Enhances search_worldwide_cities RPC to support:
--      - Cascading state/country browsing when p_query is NULL or empty
--      - Case-insensitive, prefix, word-boundary, and substring search
--      - Return cities ordered by match quality and name
--   2. Seeds core worldwide cities (including Moscow, Russia, and major hubs)
--      into public.cities with foreign keys to public.countries and public.states.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Enhanced search_worldwide_cities RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_worldwide_cities(
  p_query TEXT DEFAULT NULL,
  p_country_id UUID DEFAULT NULL,
  p_state_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  city_id UUID,
  city_name TEXT,
  state_id UUID,
  state_name TEXT,
  country_id UUID,
  country_name TEXT,
  country_code TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT := lower(trim(COALESCE(p_query, '')));
  v_effective_limit INT := LEAST(COALESCE(p_limit, 25), 100);
BEGIN
  -- When search query is empty, return cities for specified state / country
  IF v_clean = '' THEN
    IF p_state_id IS NOT NULL OR p_country_id IS NOT NULL THEN
      RETURN QUERY
      SELECT
        c.id AS city_id,
        c.name AS city_name,
        c.state_id,
        c.state AS state_name,
        c.country_id,
        c.country AS country_name,
        co.country_code
      FROM public.cities c
      LEFT JOIN public.countries co ON co.id = c.country_id
      WHERE
        (p_state_id IS NULL OR c.state_id = p_state_id)
        AND (p_country_id IS NULL OR c.country_id = p_country_id)
      ORDER BY
        CASE WHEN lower(c.name) = lower(c.state) THEN 0 ELSE 1 END,
        c.name ASC
      LIMIT v_effective_limit;
    END IF;
    RETURN;
  END IF;

  -- Filtered search matching exact, prefix, word boundary, and substring
  RETURN QUERY
  SELECT
    c.id AS city_id,
    c.name AS city_name,
    c.state_id,
    c.state AS state_name,
    c.country_id,
    c.country AS country_name,
    co.country_code
  FROM public.cities c
  LEFT JOIN public.countries co ON co.id = c.country_id
  WHERE
    (p_country_id IS NULL OR c.country_id = p_country_id)
    AND (p_state_id IS NULL OR c.state_id = p_state_id)
    AND (
      c.name ILIKE (v_clean || '%')
      OR c.name ILIKE ('% ' || v_clean || '%')
      OR c.name ILIKE ('%' || v_clean || '%')
    )
  ORDER BY
    CASE
      WHEN lower(c.name) = v_clean THEN 0
      WHEN c.name ILIKE (v_clean || '%') THEN 1
      WHEN c.name ILIKE ('% ' || v_clean || '%') THEN 2
      ELSE 3
    END,
    length(c.name) ASC,
    c.name ASC
  LIMIT v_effective_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_worldwide_cities(TEXT, UUID, UUID, INT) TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 2. Seed Essential Worldwide Locations (Moscow, Major Capitals, Diaspora Hubs)
-- -----------------------------------------------------------------------------
INSERT INTO public.cities (name, state, country, country_id, state_id, is_custom)
SELECT
  v.city_name,
  v.state_name,
  co.country_name,
  co.id,
  st.id,
  false
FROM (VALUES
  ('Moscow', 'Moscow', 'RU'),
  ('Zelenograd', 'Moscow', 'RU'),
  ('Khimki', 'Moscow', 'RU'),
  ('Podolsk', 'Moscow', 'RU'),
  ('Balashikha', 'Moscow', 'RU'),
  ('Saint Petersburg', 'Saint Petersburg', 'RU'),
  ('Novosibirsk', 'Novosibirsk', 'RU'),
  ('Yekaterinburg', 'Sverdlovsk', 'RU'),
  ('Kazan', 'Tatarstan', 'RU'),
  ('Nizhny Novgorod', 'Nizhny Novgorod', 'RU'),
  ('Samara', 'Samara', 'RU'),
  ('Dubai', 'Dubai', 'AE'),
  ('Abu Dhabi', 'Abu Dhabi', 'AE'),
  ('Sharjah', 'Sharjah', 'AE'),
  ('London', 'England', 'GB'),
  ('Birmingham', 'England', 'GB'),
  ('Leicester', 'England', 'GB'),
  ('Manchester', 'England', 'GB'),
  ('New York', 'New York', 'US'),
  ('Los Angeles', 'California', 'US'),
  ('Chicago', 'Illinois', 'US'),
  ('Houston', 'Texas', 'US'),
  ('San Jose', 'California', 'US'),
  ('Toronto', 'Ontario', 'CA'),
  ('Vancouver', 'British Columbia', 'CA'),
  ('Nairobi', 'Nairobi', 'KE'),
  ('Mombasa', 'Mombasa', 'KE'),
  ('Dar es Salaam', 'Dar es Salaam', 'TZ'),
  ('Sydney', 'New South Wales', 'AU'),
  ('Melbourne', 'Victoria', 'AU'),
  ('Singapore', 'Singapore', 'SG')
) AS v(city_name, state_name, country_code)
JOIN public.countries co ON co.country_code = v.country_code
LEFT JOIN public.states st ON st.country_id = co.id AND lower(trim(st.state_name)) = lower(trim(v.state_name))
ON CONFLICT (lower(trim(name)), lower(trim(state)), lower(trim(country))) DO UPDATE
SET country_id = EXCLUDED.country_id, state_id = EXCLUDED.state_id;

COMMIT;
