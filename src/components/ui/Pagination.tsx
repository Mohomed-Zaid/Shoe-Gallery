import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface PaginationProps {
  page?: number;
  currentPage?: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page: suppliedPage, currentPage, totalPages, onPageChange }: PaginationProps) {
  const page = suppliedPage ?? currentPage ?? 1;
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-dashboard-text-sub">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft size={16} />
          Previous
        </Button>
        <Button variant="secondary" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Next
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
