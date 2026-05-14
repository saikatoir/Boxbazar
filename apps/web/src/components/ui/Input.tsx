import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const base =
  'block w-full rounded-lg border border-neutral-300 bg-white text-sm text-neutral-900 placeholder:text-neutral-400 ' +
  'shadow-sm transition-colors ' +
  'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 ' +
  'disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(base, 'h-9 px-3', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cn(base, 'min-h-[72px] px-3 py-2', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(base, 'h-9 px-3 pr-8 appearance-none bg-no-repeat', className)} style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='none' stroke='%236b7280' stroke-width='2'><path d='M6 8l4 4 4-4'/></svg>\")",
        backgroundPosition: 'right 0.6rem center',
      }} {...rest}>
        {children}
      </select>
    );
  },
);

export function Label({
  htmlFor,
  required,
  className,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('block text-xs font-medium text-neutral-700 mb-1.5', className)}
    >
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-neutral-500">{children}</p>;
}
