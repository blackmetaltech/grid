// The words of the route teaching texts that come from data (terrain kinds, support families, foundations): literal locale keys per id, so a
// locale can translate them and the key-usage test sees them.
import { t } from './i18n';
import type { TileKind } from './sim/route/types';

const TERRAIN_WORD: Record<TileKind, string> = {
  field: 'terrain.field', swamp: 'terrain.swamp', river: 'terrain.river', forest: 'terrain.forest', rock: 'terrain.rock', sand: 'terrain.sand', sea: 'terrain.sea', town: 'terrain.town', road: 'terrain.road',
};
const FAMILY_WORD: Record<string, string> = { 'wood-9': 'family.wood-9', 'pcc-11': 'family.pcc-11', 'tubular-13': 'family.tubular-13', 'lattice-33': 'family.lattice-33', 'crossing-h': 'family.crossing-h' };
const FOUNDATION_WORD: Record<string, string> = { earth: 'foundation.earth', pile: 'foundation.pile', rock: 'foundation.rock' };

/** 'river', 'road', ... in words (an unknown kind is returned as given). */
export const kindWord = (k: string): string => (TERRAIN_WORD[k as TileKind] ? t(TERRAIN_WORD[k as TileKind]!) : k);
export const familyWord = (id: string): string => (FAMILY_WORD[id] ? t(FAMILY_WORD[id]!) : id);
export const foundationWord = (id: string): string => (FOUNDATION_WORD[id] ? t(FOUNDATION_WORD[id]!) : id);
