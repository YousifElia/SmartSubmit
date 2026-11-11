/**
 * Firefox's built-in data consent.
 *
 * SmartSubmit keeps everything in the browser unless the person turns on
 * sync (their data goes, encrypted, to the sync server they chose) or points
 * AI at a model on another machine (their resume and the job's text go to
 * it). Firefox asks the person before either; other browsers have no such
 * step. The manifest declares both as optional (see wxt.config.ts).
 */
import { browser } from 'wxt/browser';

/** What leaves the browser in those two cases. */
export const SENT_OFF_DEVICE = ['personallyIdentifyingInfo', 'websiteContent'];

interface FirefoxPermissions {
  origins?: string[];
  data_collection?: string[];
}

const permissions = () =>
  browser.permissions as unknown as {
    request(p: FirefoxPermissions): Promise<boolean>;
    contains(p: FirefoxPermissions): Promise<boolean>;
  };

const isFirefox = () => import.meta.env?.FIREFOX === true;

/**
 * Ask to send data off the device, and for access to any extra sites at the
 * same time. Call it straight from a click: the browser only shows the prompt
 * for something the person just did. Resolves true once allowed.
 */
export function askToSend(origins: string[] = []): Promise<boolean> {
  const wanted: FirefoxPermissions = origins.length > 0 ? { origins } : {};
  if (isFirefox()) wanted.data_collection = SENT_OFF_DEVICE;
  if (!wanted.origins && !wanted.data_collection) return Promise.resolve(true);
  return permissions()
    .request(wanted)
    .catch(() => false);
}

/** Whether sending is (still) allowed: Firefox lets people withdraw it in the add-on's settings. */
export function maySend(): Promise<boolean> {
  if (!isFirefox()) return Promise.resolve(true);
  return permissions()
    .contains({ data_collection: SENT_OFF_DEVICE })
    .catch(() => false);
}
