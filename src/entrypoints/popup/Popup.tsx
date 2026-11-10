import { LayoutDashboard } from 'lucide-react';
import { send } from '@/core/messages';
import { Logo } from '@/ui/Logo';
import { Button } from '@/ui/kit';

export function Popup() {
  return (
    <div className="w-[320px] bg-white p-4">
      <Logo size={24} />
      <div className="mt-4">
        <Button
          className="w-full"
          icon={<LayoutDashboard size={15} />}
          onClick={async () => {
            await send('dashboard.open', {});
            window.close();
          }}
        >
          Open dashboard
        </Button>
      </div>
    </div>
  );
}
