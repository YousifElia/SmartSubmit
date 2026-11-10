import { PageHeader } from '@/ui/kit';
import { ResumeManager } from '@/ui/resumes/ResumeManager';

export function ResumesPage(_props: { resumeId: string; navigate: (route: string) => void }) {
  return (
    <>
      <PageHeader title="Resumes" />
      <ResumeManager />
    </>
  );
}
