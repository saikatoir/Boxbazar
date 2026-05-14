import { type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-14 px-6 bg-white border border-neutral-200/80 rounded-xl shadow-card',
        className,
      )}
    >
      {icon && (
        <div className="w-11 h-11 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 mb-3">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {description && (
        <p className="text-xs text-neutral-500 mt-1 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
