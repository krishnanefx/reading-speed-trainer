import React, { useEffect, useMemo, useState } from 'react';
import { getPerfEvents, isPerfEnabled, subscribePerfEvents, type PerfEvent } from '../utils/perf';

const PerfDiagnostics: React.FC = () => {
  const [events, setEvents] = useState<PerfEvent[]>(() => getPerfEvents());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isPerfEnabled()) return;
    return subscribePerfEvents(setEvents);
  }, []);

  const latest = useMemo(() => events.slice(-12).reverse(), [events]);

  if (!isPerfEnabled()) return null;

  return (
    <div
      style={{
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: 4000,
        width: isOpen ? '360px' : 'auto',
        maxHeight: isOpen ? '50vh' : 'auto',
        overflow: 'hidden',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(2, 6, 23, 0.92)',
        color: '#e2e8f0',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        fontSize: '12px',
      }}
    >
      <button
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: '100%',
          border: 0,
          background: 'transparent',
          color: 'inherit',
          textAlign: 'left',
          padding: '8px 10px',
          cursor: 'pointer',
          fontWeight: 700,
        }}
      >
        {isOpen ? 'Hide Perf' : 'Show Perf'} ({events.length})
      </button>
      {isOpen && (
        <div style={{ maxHeight: '42vh', overflowY: 'auto', padding: '0 10px 10px' }}>
          {latest.map((event, idx) => (
            <div key={`${event.phase}-${event.ts}-${idx}`} style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: '#93c5fd' }}>{event.phase}</span>
                <span style={{ color: '#fcd34d' }}>{event.durationMs.toFixed(1)}ms</span>
              </div>
              {event.meta && (
                <div style={{ opacity: 0.8, marginTop: '3px', wordBreak: 'break-word' }}>
                  {JSON.stringify(event.meta)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(PerfDiagnostics);
