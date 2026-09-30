import { ActiveWorkout } from '@/features/training/components/active-workout';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ActiveWorkout id={id} />;
}
