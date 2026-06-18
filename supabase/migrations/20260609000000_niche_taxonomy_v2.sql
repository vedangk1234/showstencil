-- Phase 2 — Niche taxonomy v2
--
-- Adds users.niche_description column for user-supplied descriptions when picking
-- "Other" or seeing the manual picker.
--
-- Remaps niche_id from the old 12-niche taxonomy to the new 31-niche taxonomy
-- defined in lib/niches.ts. Old free-text sub_niche values are nulled out — they
-- do not match the new constrained sub-niche list and will be repopulated by the
-- sub-niche detector on next sync under the new system.
--
-- Mappings:
--   finance       -> finance_crypto
--   tech          -> tech_ai_software
--   gaming        -> (unchanged — already valid under new taxonomy)
--   cooking       -> food_drink_cooking
--   fitness       -> (unchanged — already valid under new taxonomy)
--   beauty        -> beauty_makeup
--   travel        -> (unchanged — already valid under new taxonomy)
--   education     -> (unchanged — already valid under new taxonomy)
--   business      -> business_startups
--   entertainment -> entertainment_comedy
--   diy           -> home_diy
--   vlog          -> entertainment_comedy  (Vlogs & Daily Life is a sub-niche
--                                           under Entertainment & Comedy; the
--                                           sub_niche column will be repopulated
--                                           on next sync)

-- 1. Add niche_description column
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS niche_description TEXT;

-- 2. Remap niche_id slugs (8 real remappings — gaming, fitness, travel, education
--    are already valid under the new taxonomy and need no change).
UPDATE public.users SET niche_id = 'finance_crypto'       WHERE niche_id = 'finance';
UPDATE public.users SET niche_id = 'tech_ai_software'     WHERE niche_id = 'tech';
UPDATE public.users SET niche_id = 'food_drink_cooking'   WHERE niche_id = 'cooking';
UPDATE public.users SET niche_id = 'beauty_makeup'        WHERE niche_id = 'beauty';
UPDATE public.users SET niche_id = 'business_startups'    WHERE niche_id = 'business';
UPDATE public.users SET niche_id = 'entertainment_comedy' WHERE niche_id = 'entertainment';
UPDATE public.users SET niche_id = 'home_diy'             WHERE niche_id = 'diy';
UPDATE public.users SET niche_id = 'entertainment_comedy' WHERE niche_id = 'vlog';

-- 3. Wipe legacy free-text sub_niche values; the sub-niche detector repopulates
--    on next sync under the new constrained taxonomy.
UPDATE public.users       SET sub_niche = NULL WHERE sub_niche IS NOT NULL;
UPDATE public.competitors SET sub_niche = NULL WHERE sub_niche IS NOT NULL;
