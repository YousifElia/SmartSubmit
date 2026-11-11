import { Card, PageHeader } from '@/ui/kit';
import { SyncAccount } from '@/ui/sync/SyncAccount';

export function SyncPage() {
  return (
    <>
      <PageHeader
        title="Sync"
        description="Keep SmartSubmit the same in every browser you use. Everything is encrypted before it leaves this one."
      />
      <Card>
        <SyncAccount />
      </Card>
    </>
  );
}
