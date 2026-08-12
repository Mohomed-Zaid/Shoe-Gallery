import { type ReactNode } from 'react';

interface DataTableProps {
  columns: { key: string; header: string; className?: string }[];
  children: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  className?: string;
}

export function DataTable({ columns, children, emptyMessage = 'No data found', isEmpty, className = '' }: DataTableProps) {
  return (
    <div className={`dashboard-table max-w-full overflow-x-auto overscroll-x-contain ${className}`}>
      <table className="w-full min-w-max">
        <thead className="sticky top-0 z-10 border-b border-dashboard-border bg-[#071b15]/95 backdrop-blur">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-dashboard-text-label xl:px-6 ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-dashboard-border">
          {isEmpty ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-12 text-center text-dashboard-text-sub">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
