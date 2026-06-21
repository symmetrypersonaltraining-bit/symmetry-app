'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import MetricCards from '@/components/MetricCards';

interface ClientRow {
  id: string;
  name: string;
}

export default function ProgressPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const supabase = createClient();

  useEffect(() => {
    const loadClients = async () => {
      const { data } = await supabase.from('clients').select('id, name').order('name');
      if (data && data.length > 0) {
        setClients(data);
        setSelectedClientId(data[0].id);
      }
    };
    loadClients();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--brand-bg)' }}>
      <div className="page-header page-header-progress">
        <span style={{ fontSize: 20 }}>\ud83d\udcc8</span>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Progress</span>
      </div>

      {/* Client selector */}
      {clients.length > 0 && (
        <div style={{ padding: '8px 16px 0' }}>
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--brand-border)',
              background: 'var(--brand-surface)',
              color: 'var(--brand-text)',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ padding: '12px 16px 24px' }}>
        {selectedClientId && (
          <MetricCards clientId={selectedClientId} isTrainer={true} />
        )}
      </div>
    </div>
  );
}
