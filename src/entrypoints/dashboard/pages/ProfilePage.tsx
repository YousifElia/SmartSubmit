import { useState } from 'react';
import { Card, Notice, PageHeader, Spinner } from '@/ui/kit';
import { useProfileEditor } from '@/ui/hooks';
import {
  BasicsSection,
  DemographicsSection,
  EducationSection,
  ExperienceSection,
  LanguagesSection,
  LinksSection,
  PreferencesSection,
  SkillsSection,
  WorkAuthSection,
} from '@/ui/profile/sections';
import { FillFromResume } from '@/ui/profile/FillFromResume';
import { AccountSection } from '@/ui/profile/AccountSection';

export function ProfilePage() {
  const { profile, setProfile, status } = useProfileEditor();
  const [notice, setNotice] = useState('');
  if (!profile) return <Spinner className="h-6 w-6 text-slate-400" />;
  const props = { profile, onChange: setProfile };
  return (
    <>
      <PageHeader
        title="Profile"
        description="What SmartSubmit fills into applications. Changes save automatically."
        actions={
          <>
            <span className="text-xs text-slate-400" aria-live="polite">
              {status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : ''}
            </span>
            <FillFromResume
              profile={profile}
              onFill={(next, filled) => {
                setProfile(next);
                setNotice(`Filled in your ${filled.join(', ')}. Check them below.`);
              }}
            />
          </>
        }
      />
      <div className="space-y-6">
        {notice && <Notice tone="green">{notice}</Notice>}
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
        <Card title="Skills">
          <SkillsSection {...props} />
        </Card>
        <Card title="Languages" description="The languages you speak, and how well.">
          <LanguagesSection {...props} />
        </Card>
        <Card title="Job site accounts" description="The email and password for Workday and iCIMS sign-in pages.">
          <AccountSection profileEmail={profile.email} />
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
