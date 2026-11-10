import type { SiteId } from '../../sites';
import type { DiscoveryHooks } from '../fields';

/** What SmartSubmit knows about one application system's pages. */
export interface SiteAdapter extends DiscoveryHooks {
  id: SiteId;
  /**
   * The part of the page holding the application form, or null when this
   * page has no application form (a job listing, a confirmation page).
   */
  formRoot: (doc: Document) => ParentNode | null;
}

export function textOf(node: Element | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
