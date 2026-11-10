import { send } from '@/core/messages';
import { setWriteForwarder } from '@/core/storage/db';

/**
 * Set up an extension page (dashboard, popup): every write goes through the
 * background script, which is the store's single writer.
 */
export function initClient(): void {
  setWriteForwarder((mutations) => send('db.mutate', { mutations }));
}
