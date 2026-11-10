import type { Catalogues } from '../../data';
import { GENERATORS } from './generators';
import { TRANSFORMERS } from './transformers';
import { COMPENSATION } from './compensation';
import { STORAGE } from './storage';
import { PROTECTION } from './protection';
import { LINE_COSTS } from './lineCosts';
import { CABLES } from './cables';
import { FUELS } from './fuels';

export const GLOBAL_CATALOGUES: Catalogues = {
  generators: GENERATORS, transformers: TRANSFORMERS, compensation: COMPENSATION, storage: STORAGE, protection: PROTECTION, lineCosts: LINE_COSTS, cables: CABLES, fuels: FUELS,
};
