import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

const baseInput = cn(
  'w-full px-3 py-2 text-sm text-ink bg-white border border-line rounded-md',
  'placeholder:text-ink-muted',
  'transition-colors',
  'hover:border-ink-muted',
  'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20',
  'disabled:bg-surface-alt disabled:text-ink-soft disabled:cursor-not-allowed disabled:hover:border-line',
  'read-only:bg-surface-alt read-only:text-ink-soft read-only:hover:border-line',
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest }, ref,
) { return <input ref={ref} className={cn(baseInput, className)} {...rest} />; });

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest }, ref,
) { return <textarea ref={ref} rows={rows} className={cn(baseInput, 'resize-y', className)} {...rest} />; });

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, style, ...rest }, ref,
) {
  return (
    <select ref={ref}
            className={cn(baseInput, 'appearance-none bg-no-repeat pr-9 cursor-pointer', className)}
            style={{
              // Forçar cor do texto e background mesmo quando o browser aplica estilo nativo (Chrome tende a usar GrayText)
              color: '#0a0a0a',
              backgroundColor: '#ffffff',
              backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%234f46e5' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 10px center',
              colorScheme: 'light',
              ...style,
            }}
            {...rest}>
      {children}
    </select>
  );
});
