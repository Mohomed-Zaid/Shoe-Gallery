import { type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-dashboard-accent to-dashboard-accent-light text-white shadow-glass-glow hover:opacity-90 border border-dashboard-accent/30',
  secondary:
    'border border-white/15 bg-white/[0.08] text-dashboard-text-primary backdrop-blur-sm hover:bg-white/[0.14] hover:border-white/25',
  outline:
    'border border-dashboard-accent/40 bg-transparent text-dashboard-text-primary hover:bg-dashboard-accent/10 hover:border-dashboard-accent/60',
  danger: 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-500 hover:to-red-400 border border-white/10',
  ghost: 'text-dashboard-text-label hover:bg-white/[0.08] hover:text-dashboard-text-primary',
};

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
