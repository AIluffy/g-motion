import { cn } from './cn';

export function linkButtonClass(variant: 'primary' | 'ghost' = 'primary') {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium shadow-sm transition duration-150 ease-out',
    'hover:-translate-y-[1px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500',
    variant === 'ghost'
      ? 'border-slate-700 bg-transparent px-3 py-2 text-slate-100 hover:bg-slate-800/60'
      : 'border-slate-700 bg-slate-800 px-4 py-2.5 text-slate-50 hover:bg-slate-700',
  );
}
