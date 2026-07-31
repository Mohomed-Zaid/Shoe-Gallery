import { type ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-dashboard-text-primary">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-dashboard-text-sub">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
