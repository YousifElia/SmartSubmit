import { useCallback, useEffect, useRef, useState } from 'react';
import * as db from '@/core/storage/db';
import type { CollectionMap, CollectionName, Profile, Rec, Settings } from '@/core/types';

/** Tiny hash router: `#/resumes/abc` → `/resumes/abc`. */
export function useHashRoute(): [string, (route: string) => void] {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((next: string) => {
    window.location.hash = next;
  }, []);
  return [route, navigate];
}

/**
 * Load a value from storage and reload it whenever a relevant change is made
 * by any context (this page, the background's sync, another tab).
 */
export function useLive<T>(
  load: () => Promise<T>,
  relevant: (change: db.StoreChange) => boolean,
  deps: unknown[] = [],
): T | undefined {
  const [value, setValue] = useState<T>();
  const loadRef = useRef(load);
  loadRef.current = load;
  const relevantRef = useRef(relevant);
  relevantRef.current = relevant;

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void loadRef.current().then((v) => {
        if (alive) setValue(v);
      });
    };
    refresh();
    const off = db.onStoreChange((changes) => {
      if (changes.some((c) => relevantRef.current(c))) refresh();
    });
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}

export function useCollection<C extends CollectionName>(collection: C): Rec<CollectionMap[C]>[] | undefined {
  return useLive(
    () => db.list(collection),
    (c) => c.kind === 'record' && c.collection === collection,
    [collection],
  );
}

export function useSettings(): [Settings | undefined, (update: (current: Settings) => Settings) => Promise<void>] {
  const settings = useLive(
    () => db.getSettings(),
    (c) => c.kind === 'settings',
  );
  const update = useCallback(async (fn: (current: Settings) => Settings) => {
    await db.saveSettings(fn(await db.getSettings()));
  }, []);
  return [settings, update];
}

export type SaveStatus = 'idle' | 'saving' | 'saved';

/**
 * Edit the profile with autosave. Local edits show immediately and are
 * written after a short pause; changes arriving from sync are picked up as
 * long as there is no unsaved local edit.
 */
export function useProfileEditor(): {
  profile: Profile | undefined;
  setProfile: (next: Profile) => void;
  status: SaveStatus;
} {
  const [profile, setLocal] = useState<Profile>();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const latest = useRef<Profile | undefined>(undefined);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!pending.current || !latest.current) return;
    const value = latest.current;
    await db.saveProfile(value);
    if (latest.current === value) {
      pending.current = false;
      setStatus('saved');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void db.getProfile().then((p) => {
      if (alive) {
        latest.current = p;
        setLocal(p);
      }
    });
    const off = db.onStoreChange((changes) => {
      if (pending.current) return;
      if (changes.some((c) => c.kind === 'record' && c.collection === 'profile')) {
        void db.getProfile().then((p) => {
          if (alive && !pending.current) {
            latest.current = p;
            setLocal(p);
          }
        });
      }
    });
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      alive = false;
      off();
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  const setProfile = useCallback(
    (next: Profile) => {
      latest.current = next;
      pending.current = true;
      setLocal(next);
      setStatus('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 400);
    },
    [flush],
  );

  return { profile, setProfile, status };
}

/** A debounced copy of `value`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
