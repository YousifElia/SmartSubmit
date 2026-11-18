import { useEffect, type ReactNode } from 'react';
import {
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  RefreshCw,
  Settings as SettingsIcon,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Logo } from '@/ui/Logo';
import { cx, Spinner } from '@/ui/kit';
import { useHashRoute, useSettings } from '@/ui/hooks';
import { Onboarding } from './Onboarding';
import { OverviewPage } from './pages/OverviewPage';
import { ProfilePage } from './pages/ProfilePage';
import { ResumesPage } from './pages/ResumesPage';
import { AnswersPage } from './pages/AnswersPage';
import { JobsPage } from './pages/JobsPage';
import { TailorPage } from './pages/TailorPage';
import { ReferralsPage } from './pages/ReferralsPage';
import { AiPage } from './pages/AiPage';
import { SyncPage } from './pages/SyncPage';
import { SettingsPage } from './pages/SettingsPage';

interface NavItem {
  route: string;
  label: string;
  icon: ReactNode;
}

const NAV: NavItem[] = [
  { route: '/', label: 'Overview', icon: <LayoutDashboard size={17} /> },
  { route: '/profile', label: 'Profile', icon: <UserRound size={17} /> },
  { route: '/resumes', label: 'Resumes', icon: <FileText size={17} /> },
  { route: '/answers', label: 'Saved answers', icon: <MessageSquareText size={17} /> },
  { route: '/jobs', label: 'Applications', icon: <BriefcaseBusiness size={17} /> },
  { route: '/referrals', label: 'Referrals', icon: <UsersRound size={17} /> },
  { route: '/ai', label: 'AI', icon: <Sparkles size={17} /> },
  { route: '/sync', label: 'Sync', icon: <RefreshCw size={17} /> },
  { route: '/settings', label: 'Settings', icon: <SettingsIcon size={17} /> },
];

function Page({ route, navigate }: { route: string; navigate: (r: string) => void }) {
  const [, section = '', arg = ''] = route.split('/');
  switch (section) {
    case '':
      return <OverviewPage navigate={navigate} />;
    case 'profile':
      return <ProfilePage />;
    case 'resumes':
      return <ResumesPage resumeId={arg} navigate={navigate} />;
    case 'answers':
      return <AnswersPage />;
    case 'jobs':
      return <JobsPage navigate={navigate} />;
    case 'tailor':
      return <TailorPage jobId={arg} navigate={navigate} />;
    case 'referrals':
      return <ReferralsPage jobId={arg} navigate={navigate} />;
    case 'ai':
      return <AiPage />;
    case 'sync':
      return <SyncPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <OverviewPage navigate={navigate} />;
  }
}

export function App() {
  const [route, navigate] = useHashRoute();
  const [settings, updateSettings] = useSettings();

  // First run: send the user through setup.
  useEffect(() => {
    if (settings && !settings.onboarded && !route.startsWith('/welcome')) navigate('/welcome');
  }, [settings, route, navigate]);

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-400">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (route.startsWith('/welcome')) {
    return (
      <Onboarding
        onDone={async () => {
          await updateSettings((s) => ({ ...s, onboarded: true }));
          navigate('/');
        }}
      />
    );
  }

  const active = `/${route.split('/')[1] ?? ''}`;
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5">
        <div className="px-2.5 pb-6">
          <Logo />
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Sections">
          {NAV.map((item) => {
            const isActive = item.route === active || (item.route === '/resumes' && active === '/tailor');
            return (
              <a
                key={item.route}
                href={`#${item.route}`}
                aria-current={isActive ? 'page' : undefined}
                className={cx(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-ink',
                )}
              >
                {item.icon}
                {item.label}
              </a>
            );
          })}
        </nav>
        <p className="mt-auto px-2.5 text-[11px] leading-relaxed text-slate-400">
          Your data stays on this device unless you turn on sync. SmartSubmit never submits an application for you.
        </p>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-4xl">
          <Page route={route} navigate={navigate} />
        </div>
      </main>
    </div>
  );
}
