import { Card, PageHeader, Spinner } from '@/ui/kit';
import { useProfileEditor } from '@/ui/hooks';
import {
  BasicsSection,
  DemographicsSection,
  EducationSection,
  ExperienceSection,
  LinksSection,
  PreferencesSection,
  WorkAuthSection,
} from '@/ui/profile/sections';

export function ProfilePage() {
  const { profile, setProfile, status } = useProfileEditor();
  if (!profile) return <Spinner className="h-6 w-6 text-slate-400" />;
  const props = { profile, onChange: setProfile };
  return (
    <>
      <PageHeader
        title="Profile"
        description="What SmartSubmit fills into applications. Changes save automatically."
        actions={
          <span className="text-xs text-slate-400" aria-live="polite">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : ''}
          </span>
        }
      />
      <div className="space-y-6">
        <Card title="About you">
          <BasicsSection {...props} />
        </Card>
        <Card title="Links">
          <LinksSection {...props} />
        </Card>
        <Card title="Education" description="Most recent first.">
          <EducationSection {...props} />
        </Card>
        <Card title="Work experience" description="Most recent first.">
          <ExperienceSection {...props} />
        </Card>
        <Card title="Work authorization">
          <WorkAuthSection {...props} />
        </Card>
        <Card title="Common questions">
          <PreferencesSection {...props} />
        </Card>
        <Card title="Voluntary self-identification">
          <DemographicsSection {...props} />
        </Card>
      </div>
    </>
  );
}
