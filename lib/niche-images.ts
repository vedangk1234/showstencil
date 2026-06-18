// Maps niche slugs to their stock image filenames in public/niche-images/.
//
// Phase 5 (Niche taxonomy v2): the map is now keyed on the NEW 31-slug
// taxonomy (VALID_NICHE_SLUGS from lib/niches.ts). Only the 11 slugs that
// existed under the old 12-niche taxonomy currently have image assets — the
// remaining 20 new slugs return null / [] silently until assets are added.
//
// Folder names on disk in public/niche-images/ were NOT renamed during the
// taxonomy remap (option (a) — fewer filesystem changes, less deploy risk).
// Every new slug therefore needs a slug → folder name lookup in the
// NEW_SLUG_TO_FOLDER table below.
//
// Note: both old slugs 'entertainment' and 'vlog' remap to the new slug
// 'entertainment_comedy' (per supabase/migrations/20260609000000_niche_taxonomy_v2.sql).
// Only one image set can live under that key — we keep the 'entertainment'
// images. The 'vlog/' folder remains on disk but is no longer referenced.

import { isValidNicheSlug, type ValidNicheSlug } from './niches'
import { logError } from './logger'

// Maps a NEW-taxonomy slug to its on-disk folder name in public/niche-images/.
// Only slugs that currently have assets are listed; unlisted slugs return null/[].
const NEW_SLUG_TO_FOLDER: Partial<Record<ValidNicheSlug, string>> = {
  finance_crypto: 'finance',
  tech_ai_software: 'tech',
  gaming: 'gaming',
  food_drink_cooking: 'cooking',
  fitness: 'fitness',
  beauty_makeup: 'beauty',
  travel: 'travel',
  education: 'education',
  business_startups: 'business',
  entertainment_comedy: 'entertainment',
  home_diy: 'diy',
}

const NICHE_IMAGES: Partial<Record<ValidNicheSlug, string[]>> = {
  finance_crypto: [
    '089b92f2cdb9ff5365132e3c1b45db51.jpg',
    '10f503ae15e9526f9278a03520c146c1.jpg',
    '1bca4ff99161534a34fcd974952a89af.jpg',
    '23804b435f0256996c76ab8e75149022.jpg',
    '3267e79a8fcb2319993c4f610aca838a.jpg',
    '3f0a8c3f68ed10dad1987dfbeeab4b6b.jpg',
    '4dd43c34a117b545aeaea77eff42583f.jpg',
    '8afb17e9d54fd68b42bc6165bc9e0dd6.jpg',
    '948892c63c2af93e73d52ef47510a11b.jpg',
    '98b72bf2b5cb52e884233fe5325a9ad2.jpg',
    'b90cbe10ddf242f7bd05f82451fd84a6.jpg',
    'd567c0cb53b31d0d4a7c8ad55f77b43b.jpg',
    'e230340a9132184097d462340d624f55.jpg',
  ],
  tech_ai_software: [
    '0f8258cc071f1d33cd732d18d18ff705.jpg',
    '214a630219466a598ecb0e2e9940cfb9.jpg',
    '44876b554e3459f8e456fd9f4fb9b494.jpg',
    '5f83412e56f3295c47f0683c045ca9bf.jpg',
    '754fdcb7e33d4d9cb2cb54baf84861ba.jpg',
    '7a1c3995916963effe9bfc1928609224.jpg',
    '7bbbbec07be5af0f9aeec7fa472437b4.jpg',
    '7e058d01d8ee1303f1eeb7d92a7b3c0c.jpg',
    'aa94081d951932d21b2f83f3737d4f10.jpg',
    'ad338c3f52896077b94173284ecb8a27.jpg',
    'b09c5d21d7d93858a2aa0819dae624f7.jpg',
    'eb2fa9f52129c969cf44b91ae7b6c9b8.jpg',
    'fc4a4cc40a5d8e4fd05bcd09c694aa4b.jpg',
  ],
  gaming: [
    '249872039a4de9d60dc3386b74f530a6.jpg',
    '2e99e7b55f52238b436429f3878418d3.jpg',
    '3be335d7f3ce543bd6bf61500e13fd7f.jpg',
    '415b83f402ebccc19cf766b09e468729.jpg',
    '4c3393933d0b563b5d66a824318716e0.jpg',
    '5d1923cf3e2a0fa90af95b8e48fb1494.jpg',
    '6012df32a8c5036e359791bec28fd69e.jpg',
    '8d52ec3e478a3e8ea7d579373d4777db.jpg',
    '92703ffd589b80305107eaf4087231e7.jpg',
    'ae5af59859ff23c178f9594e40aaef10.jpg',
    'd2711f90c4e45a1d1985fea9eaa4cbbb.jpg',
    'e031a9c428eb28c24ec1a30999691bab.jpg',
    'f83ecadb37afc2e280b2a584b4cc8dfa.jpg',
  ],
  food_drink_cooking: [
    '296491102abc0bfdb526bc28891baf57.jpg',
    '2cfb6cf727a02746c1d4fa0d13c1c5ab.jpg',
    '3dc57d19eee9d7bde823aeef98fb6877.jpg',
    '4087d237417c34f3358a5697df10c4f4.jpg',
    '5a3cb2e8c5ebb2d9b24bed67a3a67bce.jpg',
    '6b44db674de265e2cef0df9e124004d4.jpg',
    '6db75e2cfb5301329571d0c57a4759f8.jpg',
    '97139b3deb6c5afab5e0c5d107330843.jpg',
    'a3d37bc625cb7105db4b4b61e5ef838d.jpg',
    'be1260575f2c7ad230a9c3389f0ca3ee.jpg',
    'd22cc928ad611a235c34a3eb305ecceb.jpg',
    'edc50c18ad1d4fbb28ab45ca6cde00e5.jpg',
    'f4e275c59e39bb16be059059eff92e74.jpg',
  ],
  fitness: [
    '23cc498eb85be89c414cb5a9c8d96e24.jpg',
    '2daee13d2974dd3a24cd7ed8c487ff69.jpg',
    '58fc3f384170653b884db2b1a760b32d.jpg',
    '5981975b5c9d528a5e87c99394188b28.jpg',
    '910ecaa90ccbf6c60a1e60986c92e187.jpg',
    '9d1da7157baee33f7409970c5d8b8929.jpg',
    'e4d0a80aa5625df671bc9dafed256ec6.jpg',
    'eb0e8f9390b6f30a8464ecf8b9e51faf.jpg',
    'ed75c0614078b1106f03aab98087e43d.jpg',
    'f70d71e808fdce4fe660a129a737b99c.jpg',
    'f7ac93080823032e9c26c7f0d31807df.jpg',
    'fa031e49d86468a00b31b123e5018640.jpg',
    'fec20b2d9751830c020718a52aa463b6.jpg',
  ],
  beauty_makeup: [
    '163e042b2bf12875969781541f2ae4d8.jpg',
    '1d140b7d539f3ae8ea658d271eda0ceb.jpg',
    '362ff03354226fb63489bd21959d8927.jpg',
    '37f8fba3be80744e7da431723eb5c9bc.jpg',
    '3e5431afd9a042a8d679e135f04534ae.jpg',
    '3f3c07ac4e84b1bca4037ff6a30e9ab0.jpg',
    '593a7d899a2fdfec8b8c9d1609ff085c.jpg',
    '5d69b14985a03196eee28e981fbf6866.jpg',
    '8780ddb7c77889f603a7ecf11b100a3e.jpg',
    '9c72f1556f6c262739589ce57bbd6249.jpg',
    'a08517cce90e19acb0920ef2f96ac7aa.jpg',
    'b005610517241f7c504aa545e90b2b3d.jpg',
    'f31ea04508b8a5fd70bbd63963847a55.jpg',
  ],
  travel: [
    '093677f59e9e1aba8ef05e0b976fa24f.jpg',
    '163e042b2bf12875969781541f2ae4d8.jpg',
    '4d79ddb8a4bb22b208d07122a5e036fb.jpg',
    '4e8ec4570a07cfd0d953fd7c2134d486.jpg',
    '5af3455dd849ca4c9db44af2553a589c.jpg',
    '6c5afe4b8371ab8fc1913aa2fb43df62.jpg',
    '8e2354c56660d7e854384997c45fb062.jpg',
    '98fca13725fdee6097838463d82e6d29.jpg',
    '9ce70d223a604d7737ef87fe710307d6.jpg',
    'aa1e42c9b218c64ac970aa5e7c4ab503.jpg',
    'b305c619972198c84f9deb7a7f52d7cb.jpg',
    'bbd56e8cdf84abb72b0d8bb1425750a7.jpg',
    'd40c9e71bb0e91ad936024c5931dda3f.jpg',
  ],
  education: [
    '1ece6688c50eed2b8ab38777b48eed54.jpg',
    '3f41a47edd3895c6d4bd733f80ce8b5d.jpg',
    '447c7aab8845a3b738a63eab5150b8b6.jpg',
    '750f07fee119288abb80b7d8978732a6.jpg',
    'bfb3b755a790fa28c4af506d11b2c4fd.jpg',
    'c4d3121556ee080a32a42b89b5276d31.jpg',
    'cdc92899994fd964974087f0df087c68.jpg',
    'cf903c432fcfa866863a0deffa130a1c.jpg',
    'dab8e3ec3cb22c5ba45173d9cd529633.jpg',
    'e511273e60580ac9b7523a52683165d7.jpg',
    'e5945cc99bb9abb55fbcbb099e7d414a.jpg',
    'f4a901227a265dd26f0cf883500bb94e.jpg',
    'f9aec2e5be0b5231409584aeed4cb501.jpg',
  ],
  business_startups: [
    '0a4395c2e7186683e4cb66df162d54e0.jpg',
    '0ce513f4a00a15afc0ce7cdcd88def1c.jpg',
    '8c01235b6bb5bdf7e18e62c6f22fc928.jpg',
    '8f8157e554d9307756e24dc0c7311313.jpg',
    '9eb4cd66faec81d7f24a41325c77a3f1.jpg',
    'a89c31bfd4976ef745fdb9be1e6ab15d.jpg',
    'b6de75b2dc29dcb261bf807292b0490e.jpg',
    'bdc62a1930a2861d26e7c148736f59a4.jpg',
    'c35a0f6ca7b16b21bf46d50516300b70.jpg',
    'd07809bd04e4edc999787413e0c4e6f5.jpg',
    'dce55d19e5345b3030cd659c1f11bc70.jpg',
    'e43ce04200036e007068b433d1c47e4b.jpg',
    'f263259f77605c1f62e5ff16b0b70d52.jpg',
  ],
  entertainment_comedy: [
    '0ebf4f2d9476b91d9a2c112b688a42a8.jpg',
    '15d296eada716243015f100f10995fe6.jpg',
    '4f24276cb65c2a2b4f6e512e350b35a1.jpg',
    '55acff80e12a5a05d46ec5c66ec2709d.jpg',
    '7c3489427f0e2ef0115b7717d7599b0b.jpg',
    '9ac822850ed24ff2afebb84bcda290fb.jpg',
    'a3f4109aba040cefc6def1ed137869ab.jpg',
    'ac79fe2d301c6d0e36a9d72de68c9d3f.jpg',
    'bd199af1ebd8181c8882c2092c29a885.jpg',
    'c030d0a448209d203845fc92dfe89cf2.jpg',
    'c2e1e28da62900004edf0d9ff4268243.jpg',
    'd3fccaa61d055aef2cd329e5d2697458.jpg',
    'fb3d95c3b40f2de93c59251037fd1ba0.jpg',
  ],
  home_diy: [
    '00cc24411bce81db0d3a300adfefaf42.jpg',
    '09fd7eacb0ca74535de44f7fadf28de8.jpg',
    '1213bf6966a396ada402cce64b68b85e.jpg',
    '231ac5d871791801ba131345ff8ea847.jpg',
    '62a1be8200d4390e840a435e09ef94ee.jpg',
    '66d0b7177da8c3103dc2ff18ecc55461.jpg',
    '6ade1b54e00bf11b2fc4e76028987550.jpg',
    '78d828d320203f2f6bf5ee778b8397d6.jpg',
    '82e82aa9e6e3e66da445817b8fe0c8db.jpg',
    '92bc001ecf74084af124f47c46139c35.jpg',
    'b4f14ea04b3472776a2645b5408a724c.jpg',
    'dddc581827fecc56c81b8ee54203c2ed.jpg',
    'f825731834598441028f447c90458887.jpg',
  ],
}

/**
 * Returns the path for a single niche image by 1-based index, or null if the
 * niche has no image assets yet. Index is clamped to the available image count.
 *
 * Behaviour:
 *   - Valid slug with images       → image path string
 *   - Valid new slug without images → null (silent — expected for new slugs)
 *   - Invalid slug                  → null, with a warn-level error_logs entry
 */
export function getNicheImage(nicheSlug: string, index: number): string | null {
  if (!isValidNicheSlug(nicheSlug)) {
    void logError({
      route: 'lib/niche-images/getNicheImage',
      error: `Unknown niche slug: "${nicheSlug}"`,
      severity: 'warn',
    })
    return null
  }
  const images = NICHE_IMAGES[nicheSlug]
  const folder = NEW_SLUG_TO_FOLDER[nicheSlug]
  if (!images || !folder) return null
  const clamped = Math.max(0, Math.min(index - 1, images.length - 1))
  return `/niche-images/${folder}/${images[clamped]}`
}

/**
 * Returns {count} image paths for the niche in a deterministic order based on
 * seed. Same seed → same order, so the UI is stable across refreshes but
 * changes when the user regenerates (new generated_at timestamp = new seed).
 *
 * Behaviour:
 *   - Valid slug with images       → array of length {count}
 *   - Valid new slug without images → [] (silent — expected for new slugs)
 *   - Invalid slug                  → [], with a warn-level error_logs entry
 */
export function getShuffledNicheImages(
  nicheSlug: string,
  count: number,
  seed: number,
): string[] {
  if (!isValidNicheSlug(nicheSlug)) {
    void logError({
      route: 'lib/niche-images/getShuffledNicheImages',
      error: `Unknown niche slug: "${nicheSlug}"`,
      severity: 'warn',
    })
    return []
  }
  const sourceImages = NICHE_IMAGES[nicheSlug]
  const folder = NEW_SLUG_TO_FOLDER[nicheSlug]
  if (!sourceImages || !folder) return []

  const images = [...sourceImages]

  // Fisher-Yates shuffle with seeded LCG random
  let s = seed
  function seededRandom() {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }

  for (let i = images.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1))
    ;[images[i], images[j]] = [images[j], images[i]]
  }

  // If count > available images, wrap around with modulo
  const result: string[] = []
  for (let i = 0; i < count; i++) {
    result.push(`/niche-images/${folder}/${images[i % images.length]}`)
  }
  return result
}
