import { useState } from 'react';
import { readErrors, clearErrors } from '../errorLog';

/**
 * Surfaces the on-device error log after a reload — the only way to see a crash
 * on a phone with no console. Renders nothing when the log is empty; Dismiss
 * clears it, Copy puts the text on the clipboard for sharing.
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
          Captured {errors.length} error{errors.length > 1 ? 's' : ''}
        </strong>
        <button style={btn} onClick={() => void navigator.clipboard?.writeText(text)}>
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
