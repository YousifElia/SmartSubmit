import { AiSetup } from '@/ui/ai/AiSetup';
import { Card, PageHeader } from '@/ui/kit';

export function AiPage() {
  return (
    <>
      <PageHeader
        title="AI"
        description="SmartSubmit uses AI for two things, and only when you ask: tailoring a resume to a job, and drafting answers to open-ended questions. Autofill never needs it."
      />
      <AiSetup />
      <Card className="mt-6" title="What AI is never allowed to do">
        <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-slate-600">
          <li>Invent anything. Tailoring may reorder, rephrase and trim; every tailored resume is checked against your original, and any role, date, number, skill or award that isn’t in it is taken out before you see the result.</li>
          <li>Insert anything without you. Drafted answers wait in the panel until you choose to insert them, and tailored resumes are saved only after you review them.</li>
          <li>Act on claude.ai. SmartSubmit never signs in to or controls Claude; you paste the request and the reply yourself.</li>
        </ul>
      </Card>
    </>
  );
}
