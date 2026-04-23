import { cn } from '../lib/cn';

export function RunningDots({
  sizeClass = 'size-dot',
  colorClass = 'bg-brand',
}: {
  sizeClass?: string;
  colorClass?: string;
} = {}) {
  const dot = cn('rounded-full', sizeClass, colorClass);
  return (
    <div className="flex items-center gap-[2px] shrink-0">
      <span className={cn(dot, 'animate-running-dot-1')} />
      <span className={cn(dot, 'animate-running-dot-2')} />
      <span className={cn(dot, 'animate-running-dot-3')} />
    </div>
  );
}
