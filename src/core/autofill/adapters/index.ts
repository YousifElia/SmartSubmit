import type { SiteId } from '../../sites';
import { ashby } from './ashby';
import { generic } from './generic';
import { greenhouse } from './greenhouse';
import { icims } from './icims';
import { lever } from './lever';
import { smartrecruiters } from './smartrecruiters';
import type { SiteAdapter } from './types';
import { workday } from './workday';

const ADAPTERS: Partial<Record<SiteId, SiteAdapter>> = {
  greenhouse,
  lever,
  ashby,
  workday,
  icims,
  smartrecruiters,
  generic,
};

/** The adapter for a site, falling back to generic form handling. */
export function adapterFor(site: SiteId): SiteAdapter {
  return ADAPTERS[site] ?? { ...generic, id: site };
}

export type { SiteAdapter } from './types';
