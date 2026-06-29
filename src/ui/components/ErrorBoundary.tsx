import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError } from '../errorLog';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render/lifecycle errors so a crash shows a readable message with the
 * stack (and a Reload) instead of an unrecoverable white page — and records it
 * to the on-device log (see {@link logError}) so the cause survives the reload.
 * This is also the diagnostic for the pinch white-screen: if the blank is a
 * React crash, this fallback replaces it; if the blank persists with nothing
 * logged, the cause is the WebKit compositor, not JavaScript.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError('render: ' + error.message, (error.stack || '') + '\n' + (info.componentStack || ''));
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: '#fff',
          color: '#1f2933',
          padding: '24px',
          font: '14px/1.5 -apple-system, system-ui, sans-serif',
          overflow: 'auto',
        }}
      >
        <h2 style={{ marginTop: 0, color: '#b4332a' }}>Something broke</h2>
        <p>The diagram view hit an error. This message is the captured cause:</p>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#f4f6f8',
            border: '1px solid #d2d9e0',
            borderRadius: 6,
            padding: 12,
          }}
        >
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        <button
          style={{
            marginTop: 12,
            padding: '8px 16px',
            background: '#2f6f9f',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
          }}
          onClick={() => {
            this.setState({ error: null });
            location.reload();
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
