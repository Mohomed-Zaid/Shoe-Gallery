import { type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({ title, children, onClose, size = 'md' }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className={`glass-card relative w-full p-6 shadow-glass-lg ${sizeClasses[size]}`}>
        <div className="relative z-10 mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-dashboard-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.06] p-1.5 text-dashboard-text-label transition-all hover:bg-white/10 hover:text-dashboard-text-primary"
          >
            <X size={20} />
          </button>
        </div>
        <div className="relative z-10">{children}</div>
      </div>
    </div>
  );
}
