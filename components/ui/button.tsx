import * as React from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'ghost';
type Size = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variantClass =
      variant === 'ghost'
        ? 'bg-transparent border-slate-700 text-slate-100 hover:bg-slate-800/60'
        : 'bg-slate-800 border-slate-700 text-slate-50 hover:bg-slate-700';

    const sizeClass = size === 'sm' ? 'px-3 py-2 text-sm' : 'px-4 py-2.5 text-base';

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md border shadow-sm transition duration-150 ease-out',
          'hover:-translate-y-[1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          variantClass,
          sizeClass,
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';
