import { useState } from 'react';
import { readErrors, clearErrors } from '../errorLog';

/**
 * Surfaces the on-device error log after a reload — the key diagnostic for the
 * iOS pinch white-screen, which has no console to read. If a pinch blanks the
 * page and the session-restore reload brings back THIS banner with an entry, the
 * blank was a JavaScript error (shown verbatim, copyable). If the banner stays
 * absent after a blank, no JS threw and the cause is the WebKit compositor.
 * Self-hides when the log is empty; dismiss clears it.
 */
export function DiagnosticsBanner() {
  const [errors, setErrors] = useState(readErrors);
  if (errors.length === 0) return null;

  const text = errors.map((e) => `${e.t}\n${e.msg}\n${e.stack ?? ''}`).join('\n\n———\n\n');

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: 8,
        zIndex: 99998,
        maxHeight: '40vh',
        overflow: 'auto',
        background: '#2b1416',
        color: '#ffd9d6',
        border: '1px solid #b4332a',
        borderRadius: 8,
        padding: '10px 12px',
        font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ flex: 1 }}>
          Captured {errors.length} error{errors.length > 1 ? 's' : ''} (diagnostic)
        </strong>
        <button
          style={btn}
          onClick={() => {
            void navigator.clipboard?.writeText(text);
          }}
        >
          Copy
        </button>
        <button
          style={btn}
          onClick={() => {
            clearErrors();
            setErrors([]);
          }}
        >
          Dismiss
        </button>
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</pre>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: '3px 10px',
  background: '#b4332a',
  color: '#fff',
  border: 'none',
  borderRadius: 5,
  fontSize: 12,
};
