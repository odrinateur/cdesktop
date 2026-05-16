import { useLocation } from '@tanstack/react-router';
import { RoutinesListContent } from './RoutinesListContent';
import { RoutineCreateContent } from './RoutineCreateContent';
import { RoutineDetailContent } from './RoutineDetailContent';

/**
 * Anchor-cell content for the routines section. Resolves which routines
 * sub-route is active from the URL and renders the matching content
 * component (no outer layout — SessionGrid owns the cell shell).
 */
export function RoutinesFirstCellSlot() {
  const location = useLocation();
  const pathname = location.pathname;

  if (pathname === '/routines/new' || pathname.startsWith('/routines/new/')) {
    return <RoutineCreateContent />;
  }

  // Detail: /routines/<id>. Strip leading "/routines/" and check that what's
  // left isn't another nested segment (covered by /routines/new above).
  if (pathname.startsWith('/routines/')) {
    const remainder = pathname.slice('/routines/'.length).replace(/\/$/, '');
    if (remainder.length > 0 && !remainder.includes('/')) {
      return <RoutineDetailContent routineId={remainder} />;
    }
  }

  return <RoutinesListContent />;
}
