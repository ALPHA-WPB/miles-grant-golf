import { useState, useEffect } from 'react';
import { roundService } from '../services/roundService';

const HOLES = [
  { number: 1, par: 5 }, { number: 2, par: 3 }, { number: 3, par: 3 },
  { number: 4, par: 4 }, { number: 5, par: 3 }, { number: 6, par: 4 },
  { number: 7, par: 3 }, { number: 8, par: 3 }, { number: 9, par: 4 },
  { number: 10, par: 4 }, { number: 11, par: 3 }, { number: 12, par: 3 },
  { number: 13, par: 3 }, { number: 14, par: 4 }, { number: 15, par: 3 },
  { number: 16, par: 3 }, { number: 17, par: 4 }, { number: 18, par: 5 },
];
const TOTAL_PAR = HOLES.reduce((s, h) => s + h.par, 0);

export function RoundHistory({ userId }) {
  const [rounds, setRounds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    roundService.getRoundHistory(userId)
      .then(setRounds)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  function formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function scoreColor(d) {
    if (d <= -2) return '#60a5fa';
    if (d === -1) return '#4ade80';
    if (d === 0) return '#c9a84c';
    if (d === 1) return '#fb923c';
    return '#f87171';
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1rem 2rem', background: '#0a1c12' }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: '#c9a84c', marginBottom: '1rem' }}>Round History</h2>

      {loading ? (
        <p style={{ color: '#7a9e84', textAlign: 'center', paddingTop: '2rem' }}>Loading…</p>
      ) : rounds.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: '3rem', color: '#7a9e84' }}>
          <p style={{ fontSize: 32, marginBottom: 8 }}>📋</p>
          <p>No completed rounds yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rounds.map(round => {
            const myRp = round.round_players?.find(rp => rp.user_id === userId);
            const myScores = myRp?.scores || [];
            const total = myScores.reduce((s, sc) => s + (sc.strokes || 0), 0);
            const diff = total ? total - TOTAL_PAR : null;
            const isExp = expanded === round.id;

            return (
              <div key={round.id} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                overflow: 'hidden',
              }}>
                <button onClick={() => setExpanded(isExp ? null : round.id)}
                  style={{ width: '100%', background: 'transparent', border: 'none', padding: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#f0ead6' }}>
                      {round.round_type === 'front9' ? 'Front 9' : round.round_type === 'back9' ? 'Back 9' : 'All 18'}
                    </p>
                    <p style={{ fontSize: 11, color: '#7a9e84' }}>{formatDate(round.end_time)}</p>
                  </div>
                  {total ? (
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 20, fontWeight: 700, color: diff < 0 ? '#4ade80' : diff === 0 ? '#c9a84c' : '#f87171' }}>{total}</p>
                      <p style={{ fontSize: 11, color: '#7a9e84' }}>{diff >= 0 ? `+${diff}` : diff} vs par</p>
                    </div>
                  ) : (
                    <p style={{ color: '#4a6a54', fontSize: 13 }}>No scores</p>
                  )}
                  <span style={{ color: '#7a9e84', fontSize: 18 }}>{isExp ? '▾' : '›'}</span>
                </button>

                {isExp && (
                  <div style={{ borderTop: '0.5px solid rgba(45,90,61,0.4)', padding: '10px 14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4, marginBottom: 8 }}>
                      {HOLES.slice(0, 9).map(h => {
                        const sc = myScores.find(s => s.hole_number === h.number);
                        const d = sc ? sc.strokes - h.par : null;
                        return (
                          <div key={h.number} style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: 9, color: '#4a6a54' }}>{h.number}</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: d !== null ? scoreColor(d) : '#4a6a54' }}>
                              {sc ? sc.strokes : '·'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 4 }}>
                      {HOLES.slice(9).map(h => {
                        const sc = myScores.find(s => s.hole_number === h.number);
                        const d = sc ? sc.strokes - h.par : null;
                        return (
                          <div key={h.number} style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: 9, color: '#4a6a54' }}>{h.number}</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: d !== null ? scoreColor(d) : '#4a6a54' }}>
                              {sc ? sc.strokes : '·'}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {round.round_players?.length > 1 && (
                      <div style={{ marginTop: 10, borderTop: '0.5px solid rgba(45,90,61,0.4)', paddingTop: 8 }}>
                        <p style={{ fontSize: 10, color: '#7a9e84', marginBottom: 6 }}>OTHER PLAYERS</p>
                        {round.round_players.filter(rp => rp.user_id !== userId).map(rp => {
                          const t = (rp.scores || []).reduce((s, sc) => s + (sc.strokes || 0), 0);
                          return (
                            <div key={rp.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#a3b89a', marginBottom: 2 }}>
                              <span>{rp.users?.full_name || 'Player'}</span>
                              <span style={{ fontWeight: 600 }}>{t || '—'}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
