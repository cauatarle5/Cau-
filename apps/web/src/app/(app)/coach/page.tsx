import { PageHeader } from '@/components/empty-state';
import { CoachChat } from '@/features/coach/components/coach-chat';

export default function CoachPage() {
  return (
    <>
      <PageHeader title="Coach" subtitle="Pergunte sobre seus dados em linguagem natural." />
      <CoachChat />
    </>
  );
}
