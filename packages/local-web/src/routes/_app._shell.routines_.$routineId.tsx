import { createFileRoute, useParams } from '@tanstack/react-router';
import { RoutineDetailContent } from '@/shared/components/routines/RoutineDetailContent';

export const Route = createFileRoute('/_app/_shell/routines_/$routineId')({
  component: RoutineDetailLeaf,
});

function RoutineDetailLeaf() {
  const { routineId } = useParams({
    from: '/_app/_shell/routines_/$routineId',
  });
  return <RoutineDetailContent routineId={routineId} />;
}
