import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { Upload, FileText, Image as ImageIcon, X, Paperclip, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  value: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
  maxSizeMB?: number;
  /** Legenda abaixo da área (tipos aceites, tamanho máximo, etc). */
  hint?: string;
  /** Mostrado como preview quando já há um ficheiro guardado no servidor
   *  (nome + handler opcional para abrir). */
  current?: { name: string; onOpen?: () => void } | null;
  disabled?: boolean;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function pickIcon(file: File | null) {
  if (!file) return Upload;
  if (file.type.startsWith('image/')) return ImageIcon;
  if (file.type === 'application/pdf') return FileText;
  return Paperclip;
}

export function FileDropzone({
  value,
  onChange,
  accept = 'application/pdf,image/*',
  maxSizeMB = 15,
  hint,
  current,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick() {
    if (!disabled) inputRef.current?.click();
  }

  function assign(file: File | null) {
    if (!file) { onChange(null); setError(null); return; }
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > maxSizeMB) {
      setError(`Ficheiro demasiado grande (máx. ${maxSizeMB} MB).`);
      return;
    }
    setError(null);
    onChange(file);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    assign(e.target.files?.[0] || null);
    // permite re-selecionar o mesmo ficheiro depois
    e.target.value = '';
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) assign(file);
  }

  const Icon = pickIcon(value);
  const hasFile = !!value;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onInputChange}
        className="hidden"
        disabled={disabled}
      />

      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={pick}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick())}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex items-center gap-3 px-4 py-4 rounded-lg border-2 border-dashed transition-all cursor-pointer select-none',
          'bg-white',
          over && !disabled && 'border-brand bg-brand-soft/60 scale-[1.01]',
          !over && !hasFile && !disabled && 'border-line hover:border-brand/60 hover:bg-brand-soft/30',
          hasFile && 'border-good/40 bg-good-soft/40',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        <div className={cn(
          'w-10 h-10 rounded-md grid place-items-center shrink-0',
          hasFile ? 'bg-good-soft text-good-ink' : 'bg-brand-soft text-brand',
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          {hasFile ? (
            <>
              <p className="text-sm font-medium text-ink truncate">{value!.name}</p>
              <p className="text-xs text-ink-soft">
                {formatBytes(value!.size)} · <span className="text-brand hover:underline">substituir</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">
                <span className="text-brand">Carregar ficheiro</span> ou arrasta para aqui
              </p>
              <p className="text-xs text-ink-soft">{hint || `PDF, JPG ou PNG · até ${maxSizeMB} MB`}</p>
            </>
          )}
        </div>
        {hasFile && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); assign(null); }}
            className="p-1.5 rounded-md hover:bg-bad-soft text-ink-soft hover:text-bad-ink"
            title="Remover"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && <p className="text-xs text-bad-ink">{error}</p>}

      {!hasFile && current && (
        <div className="flex items-center gap-2 bg-brand-soft/70 border border-brand/20 rounded-md px-3 py-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
          <span className="text-ink flex-1 truncate">
            Anexo atual: <strong>{current.name}</strong>
          </span>
          {current.onOpen && (
            <button
              type="button"
              onClick={current.onOpen}
              className="text-brand hover:underline text-xs font-medium"
            >
              Abrir
            </button>
          )}
        </div>
      )}
    </div>
  );
}
