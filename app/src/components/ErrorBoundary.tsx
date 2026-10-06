import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React error boundary:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-page p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-line shadow-card p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-bad-soft text-bad-ink grid place-items-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-ink">Erro inesperado</h1>
              <p className="text-xs text-ink-soft">A página rebentou durante o render.</p>
            </div>
          </div>
          <pre className="text-xs bg-surface-page border border-line rounded p-3 overflow-x-auto text-ink-soft max-h-40">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => { this.setState({ error: null }); location.reload(); }}
              className="flex-1 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand-hover"
            >
              Recarregar
            </button>
            <button
              onClick={() => { this.setState({ error: null }); history.back(); }}
              className="px-4 py-2 rounded-md bg-white text-ink border border-line text-sm hover:bg-surface-alt"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
