import { type ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-dashboard-text-primary sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-dashboard-text-sub">{description}</p>
        )}
      </div>
      {action && <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto sm:justify-end">{action}</div>}
    </div>
  );
}
