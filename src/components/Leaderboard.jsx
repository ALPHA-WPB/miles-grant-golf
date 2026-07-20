import { useState, useEffect } from 'react';
import { leaderboardService } from '../services/leaderboardService';

export function Leaderboard({ onClose }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    leaderboardService.getClubLeaderboard()
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1rem 2rem', background: '#0a1c12' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: '#c9a84c' }}>Club Leaderboard</h2>
        {onClose && (
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#7a9e84', fontSize: 22, cursor: 'pointer' }}>×</button>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#7a9e84', textAlign: 'center', paddingTop: '2rem' }}>Loading…</p>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: '3rem', color: '#7a9e84' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>⛳</p>
          <p>No completed rounds yet.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Play a round to appear here!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((e, i) => (
            <div key={e.user_id} style={{
              background: i === 0 ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.04)',
              border: i === 0 ? '0.5px solid rgba(201,168,76,0.4)' : '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{medals[i] || `#${i + 1}`}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: 15, color: i === 0 ? '#c9a84c' : '#f0ead6' }}>{e.full_name}</p>
                <p style={{ fontSize: 11, color: '#7a9e84' }}>{e.rounds_played} round{e.rounds_played !== 1 ? 's' : ''} played</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: i === 0 ? '#c9a84c' : '#f0ead6' }}>{e.avg_score ?? '—'}</p>
                <p style={{ fontSize: 10, color: '#7a9e84' }}>avg score</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
