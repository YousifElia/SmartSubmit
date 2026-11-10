import { PageHeader } from '@/ui/kit';
import { SyncAccount } from '@/ui/sync/SyncAccount';

export function SyncPage() {
  return (
    <>
      <PageHeader title="Sync" />
      <SyncAccount />
    </>
  );
}
