import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center h-full w-full"
          style={{ padding: 40, background: 'var(--bg-primary)' }}
        >
          <div
            className="rounded-2xl flex items-center justify-center"
            style={{ width: 64, height: 64, marginBottom: 20, background: 'var(--error-dim)' }}
          >
            <AlertTriangle size={28} style={{ color: 'var(--error)' }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            {this.props.fallbackLabel || 'Something went wrong'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 20, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred in this panel.'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center rounded-lg transition-colors"
            style={{
              gap: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              background: 'var(--accent)',
              color: 'var(--bg-primary)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <RotateCw size={16} />
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
