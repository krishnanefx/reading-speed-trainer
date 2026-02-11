import React, { useEffect, useMemo, useState } from 'react';
import { getPerfEvents, isPerfEnabled, subscribePerfEvents, type PerfEvent } from '../utils/perf';
import './PerfDiagnostics.css';

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
    <div className={`perf-diagnostics ${isOpen ? 'open' : ''}`}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="perf-diagnostics-toggle"
      >
        {isOpen ? 'Hide Perf' : 'Show Perf'} ({events.length})
      </button>
      {isOpen && (
        <div className="perf-diagnostics-list">
          {latest.map((event, idx) => (
            <div key={`${event.phase}-${event.ts}-${idx}`} className="perf-diagnostics-item">
              <div className="perf-diagnostics-row">
                <span className="perf-diagnostics-phase">{event.phase}</span>
                <span className="perf-diagnostics-duration">{event.durationMs.toFixed(1)}ms</span>
              </div>
              {event.meta && (
                <div className="perf-diagnostics-meta">
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
