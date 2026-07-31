import { AlertCircle } from 'lucide-react';

interface AlertProps {
  message: string;
  variant?: 'error' | 'success';
}

export function Alert({ message, variant = 'error' }: AlertProps) {
  const styles =
    variant === 'error'
      ? 'border-red-500/30 bg-red-500/10 text-red-300'
      : 'border-green-500/30 bg-green-500/10 text-green-300';

  return (
    <div className={`flex items-center gap-2 rounded-lg border p-3 ${styles}`}>
      <AlertCircle size={20} />
      <span>{message}</span>
    </div>
  );
}
