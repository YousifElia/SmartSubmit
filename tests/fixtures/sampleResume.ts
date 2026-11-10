import type { ResumeDoc } from '../../src/core/types';

/** An invented student resume used across the tests. */
export function sampleResumeDoc(): ResumeDoc {
  return {
    basics: {
      name: 'Avery Testerson',
      email: 'avery.testerson@example.com',
      phone: '(519) 555-0142',
      location: 'Windsor, ON',
      links: ['https://www.linkedin.com/in/avery-testerson-example', 'https://github.com/avery-testerson-example'],
    },
    summary: '',
    education: [
      {
        school: 'University of Windsor',
        degree: 'Bachelor of Computer Science (Honours), Co-op',
        location: 'Windsor, ON',
        start: 'Sep 2023',
        end: 'May 2027',
        details: ['GPA: 3.8/4.0', 'Relevant coursework: Data Structures, Algorithms, Operating Systems, Databases'],
      },
    ],
    experience: [
      {
        company: 'Example Robotics',
        title: 'Software Developer Co-op',
        location: 'Windsor, ON',
        start: 'Jan 2025',
        end: 'Apr 2025',
        bullets: [
          'Built an internal dashboard in TypeScript and React that cut the time technicians spend finding robot fault logs from 10 minutes to under 1.',
          'Wrote Python services that stream telemetry from 40 warehouse robots into PostgreSQL, handling 2,000 messages per second.',
          'Added integration tests to the deployment pipeline, catching 3 regressions before release.',
        ],
      },
      {
        company: 'University of Windsor',
        title: 'Teaching Assistant, Data Structures',
        location: 'Windsor, ON',
        start: 'Sep 2024',
        end: 'Dec 2024',
        bullets: ['Ran weekly labs for 35 students and graded assignments in Java.', 'Held office hours and wrote practice problems on trees and graphs.'],
      },
    ],
    projects: [
      {
        name: 'ClearBudget',
        subtitle: 'React, Node.js, PostgreSQL',
        start: '',
        end: '2025',
        bullets: ['A budgeting web app with bank-statement import and spending charts, used by 50 classmates.'],
      },
    ],
    skills: [
      { category: 'Languages', items: ['Python', 'TypeScript', 'Java', 'C', 'SQL'] },
      { category: 'Tools', items: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'Git', 'Linux'] },
    ],
    extras: [{ title: 'Awards', items: ["Dean's Honour List, 2024", 'Hackathon winner, WinHacks 2025'] }],
    order: ['education', 'experience', 'projects', 'skills', 'extra:Awards'],
  };
}
