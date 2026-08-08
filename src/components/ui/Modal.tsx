import { type ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen?: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-6xl',
};

export function Modal({ title, children, onClose, size = 'md' }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); document.body.style.overflow = previousOverflow; previouslyFocused?.focus(); };
  }, []);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-0 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="responsive-modal-title">
      <div className={`glass-card relative flex max-h-[100dvh] w-full flex-col rounded-none shadow-glass-lg sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl ${sizeClasses[size]}`}>
        <div className="relative z-20 flex shrink-0 items-center justify-between border-b border-white/10 bg-[#061711]/95 px-4 py-3 sm:px-5">
          <h2 id="responsive-modal-title" className="min-w-0 truncate text-lg font-bold text-dashboard-text-primary sm:text-xl">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] p-2 text-dashboard-text-label transition-all hover:bg-white/10 hover:text-dashboard-text-primary"
          >
            <X size={20} />
          </button>
        </div>
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}
