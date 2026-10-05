import { cn } from '@/lib/cn';

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg className={cn('animate-spin text-brand', className)} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingBlock({ message = 'A carregar…' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-ink-soft">
      <Spinner />
      <span className="text-sm">{message}</span>
    </div>
  );
}
