import { useState } from 'react';
import { readErrors, clearErrors, readTrace, clearTrace, BUILD_ID } from '../errorLog';

/**
 * Surfaces the on-device diagnostics after a reload — the only way to debug the
 * iOS pinch white-screen on a phone with no console.
 *
 *  - The gesture BREADCRUMB trail survives even a native WebContent-process crash
 *    (which throws no JS error), so its LAST entry is the operation that killed
 *    the page. `load <BUILD_ID>` at the top also proves which build is live.
 *  - Any captured JS error is shown verbatim below it.
 *
 * Renders nothing when there's nothing to show; the buttons clear each log.
 */
export function DiagnosticsBanner() {
  const [errors, setErrors] = useState(readErrors);
  const [trace, setTrace] = useState(readTrace);

  if (errors.length === 0 && trace.length === 0) return null;

  const errText = errors.map((e) => `${e.t}\n${e.msg}\n${e.stack ?? ''}`).join('\n\n———\n\n');
  const traceText = trace.map((c) => `+${c.t}ms  ${c.msg}`).join('\n');
  const copyAll = `build=${BUILD_ID}\n\nTRACE:\n${traceText}\n\nERRORS:\n${errText}`;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: 8,
        zIndex: 99998,
        maxHeight: '45vh',
        overflow: 'auto',
        background: '#11161c',
        color: '#cfe6ff',
        border: '1px solid #2f6f9f',
        borderRadius: 8,
        padding: '10px 12px',
        font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
        boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ flex: 1 }}>
          diagnostics · build {BUILD_ID}
          {errors.length > 0 && (
            <span style={{ color: '#ffb3ad' }}> · {errors.length} error(s)</span>
          )}
        </strong>
        <button style={btn} onClick={() => void navigator.clipboard?.writeText(copyAll)}>
          Copy
        </button>
        <button
          style={btn}
          onClick={() => {
            clearTrace();
            clearErrors();
            setTrace([]);
            setErrors([]);
          }}
        >
          Dismiss
        </button>
      </div>
      {trace.length > 0 && (
        <>
          <div style={{ opacity: 0.7, marginBottom: 2 }}>last gesture trail (newest at bottom):</div>
          <pre style={pre}>{traceText}</pre>
        </>
      )}
      {errors.length > 0 && (
        <>
          <div style={{ opacity: 0.7, margin: '6px 0 2px' }}>captured errors:</div>
          <pre style={{ ...pre, color: '#ffd9d6' }}>{errText}</pre>
        </>
      )}
    </div>
  );
}

const pre: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const btn: React.CSSProperties = {
  padding: '3px 10px',
  background: '#2f6f9f',
  color: '#fff',
  border: 'none',
  borderRadius: 5,
  fontSize: 12,
};
