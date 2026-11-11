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
  /**
   * Whether this frame is where the site's content lives, and so the one to
   * answer the toolbar when no frame has a form. Normally the top frame.
   */
  contentFrame?: (win: Window, doc: Document) => boolean;
}

export function textOf(node: Element | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
