import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export function Modal({ open, onClose, title, children, footer, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prevOverflow; };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm overflow-y-auto"
         onClick={onClose}>
      <div className={cn('bg-white rounded-lg shadow-lg border border-line w-full my-8 max-h-[90vh] flex flex-col', sizes[size])}
           onClick={e => e.stopPropagation()}>
        {title && (
          <div className="flex justify-between items-center px-6 py-4 border-b border-line">
            <h3 className="text-lg font-semibold text-ink">{title}</h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-surface-alt text-ink-soft hover:text-ink">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer && (
          <div className="px-6 py-4 border-t border-line flex justify-end gap-2 bg-surface-page/50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
