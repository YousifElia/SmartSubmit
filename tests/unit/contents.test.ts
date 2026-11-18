import { describe, expect, it } from 'vitest';
import { emptyEducation, emptyExperience, emptyProfile } from '@/core/defaults';
import { accountContents, nothingToKeep } from '@/core/sync/contents';
import type { Job, Referral, Resume } from '@/core/types';

const job = (id: string, status: Job['status']): Job =>
  ({ id, key: id, site: 'greenhouse', url: '', title: 'Intern', company: 'Acme', location: '', description: '', blocks: [], capturedAt: 1, status, appliedAt: null, resumeRef: null, notes: '', score: null }) as Job;

describe('accountContents', () => {
  it('lists every part of the profile, the resumes, applications and the rest', () => {
    const profile = emptyProfile();
    profile.firstName = 'Avery';
    profile.lastName = 'Testerson';
    profile.email = 'avery@example.com';
    profile.links.linkedin = 'https://linkedin.com/in/avery';
    profile.education = [{ ...emptyEducation(), school: 'University of Windsor' }];
    profile.experience = [
      { ...emptyExperience(), title: 'Developer', company: 'Example Robotics' },
      { ...emptyExperience(), title: 'TA', company: 'University of Windsor' },
      { ...emptyExperience(), title: 'Cashier', company: 'Corner Store' },
    ];
    profile.skills = ['Python', 'Go'];
    profile.languages = [{ id: 'l', language: 'English', level: 'native' }];
    profile.workAuth.CA!.authorized = 'yes';
    const rows = accountContents({
      profile,
      resumes: [{ id: 'r1', name: 'General', file: { id: 'f', name: 'a.pdf', mime: 'application/pdf', size: 1 } } as Resume, { id: 'r2', name: 'Data roles', file: null } as Resume],
      jobs: [job('j1', 'applied'), job('j2', 'interviewing'), job('j3', 'started')],
      answers: [],
      tailored: [],
      referrals: [{ company: 'Acme' } as Referral, { company: 'acme ' } as Referral, { company: 'Initech' } as Referral],
      jobSiteAccount: { email: '', password: 'x' },
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.about).toMatchObject({ detail: 'Avery Testerson with email', filled: true });
    expect(by.links).toMatchObject({ count: 1, detail: 'LinkedIn' });
    expect(by.experience).toMatchObject({ count: 3, detail: 'Developer at Example Robotics, TA at University of Windsor and 1 more' });
    expect(by.languages).toMatchObject({ count: 1, detail: 'English' });
    expect(by.questions).toMatchObject({ filled: true, detail: 'work authorization' });
    expect(by.resumes).toMatchObject({ count: 2, detail: 'General, Data roles (1 uploaded file)' });
    expect(by.jobs).toMatchObject({ count: 3, detail: '2 applied, 1 saved or started' });
    expect(by.answers).toMatchObject({ count: 0, detail: 'None yet', filled: false });
    expect(by.referrals).toMatchObject({ count: 3, detail: 'at 2 companies' });
    expect(by.jobsite).toMatchObject({ detail: 'Saved', filled: true });
    expect(nothingToKeep(rows)).toBe(false);
  });

  it('knows when there is nothing at all to keep', () => {
    const rows = accountContents({ profile: emptyProfile(), resumes: [], jobs: [], answers: [], tailored: [], referrals: [], jobSiteAccount: null });
    expect(nothingToKeep(rows)).toBe(true);
    expect(rows.find((r) => r.key === 'about')?.detail).toBe('Not filled in yet');
  });
});
