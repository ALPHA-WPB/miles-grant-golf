import { useState } from 'react';
import { roundService } from '../services/roundService';
import toast from 'react-hot-toast';

const TEE_ORDER = ['champ', 'mens', 'womens'];
const TEE_LABELS = { champ: 'Blue', mens: 'White', womens: 'Red' };
const TEE_COLORS = { champ: '#3b82f6', mens: '#d1d5db', womens: '#ef4444' };

export function RoundLobby({ user, profile, onRoundStart }) {
  const [tee, setTee] = useState('mens');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState(null); // null | 'new' | 'join'
  const [loading, setLoading] = useState(false);

  async function createRound(roundType) {
    setLoading(true);
    try {
      const { round, roundPlayer } = await roundService.createRound(user.id, TEE_LABELS[tee], roundType);
      toast.success(`Round created! Code: ${round.join_code}`);
      onRoundStart({ round, roundPlayer, tee, roundType });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function joinRound(e) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setLoading(true);
    try {
      const { round, roundPlayer } = await roundService.joinRoundByCode(joinCode, user.id, TEE_LABELS[tee]);
      toast.success(`Joined round!`);
      onRoundStart({ round, roundPlayer, tee, roundType: round.round_type || 'all18' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; }
    .setup-bg { position: fixed; inset: 0; background-image: url('/course-bg.jpg'); background-size: cover; background-position: center 30%; }
    .setup-overlay { position: fixed; inset: 0; background: linear-gradient(to bottom, rgba(5,16,10,0.2) 0%, rgba(5,16,10,0.55) 38%, rgba(5,16,10,0.96) 62%, rgba(5,16,10,1) 100%); }
    .glass { background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.1); border-radius: 16px; backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07); }
  `;

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden', fontFamily: "'Inter',sans-serif", color: '#f0ead6' }}>
      <style>{css}</style>
      <div className="setup-bg" />
      <div className="setup-overlay" />

      <div style={{ position: 'relative', zIndex: 2, height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 1.25rem', paddingBottom: 'calc(16px + max(env(safe-area-inset-bottom), 8px))' }}>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 38, fontWeight: 700, color: '#fff', lineHeight: 1.05, marginBottom: 4, textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}>
            Miles Grant<br />Country Club
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(240,234,214,0.6)' }}>
            Welcome, {profile?.full_name || user.email.split('@')[0]}
          </p>
        </div>

        {/* Tee selector */}
        <div className="glass" style={{ padding: '0.85rem 1.1rem 1rem', marginBottom: '0.75rem' }}>
          <p style={{ fontSize: 10, color: '#7a9e84', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Your tee</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {TEE_ORDER.map(t => (
              <button key={t} onClick={() => setTee(t)} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, cursor: 'pointer',
                fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: tee === t ? 600 : 400,
                background: tee === t
                  ? (t === 'champ' ? 'rgba(30,58,95,0.9)' : t === 'mens' ? 'rgba(58,58,58,0.9)' : 'rgba(90,26,26,0.9)')
                  : 'rgba(255,255,255,0.05)',
                color: tee === t
                  ? (t === 'champ' ? '#60a5fa' : t === 'mens' ? '#e8e8e8' : '#f87171')
                  : '#7a9e84',
                border: tee === t ? `1.5px solid ${TEE_COLORS[t]}` : '0.5px solid rgba(255,255,255,0.08)',
              }}>
                {TEE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Mode selector */}
        {!mode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* New round — 3 glass buttons */}
            <div style={{ display: 'flex', gap: 10, height: 120 }}>
              {[
                { label: 'Front 9', sub: 'Holes 1–9', emoji: '🌅', type: 'front9', start: 0, end: 9 },
                { label: 'All 18', sub: 'Full Round', emoji: '⛳', type: 'all18', start: 0, end: 18 },
                { label: 'Back 9', sub: 'Holes 10–18', emoji: '🌇', type: 'back9', start: 9, end: 18 },
              ].map(opt => (
                <button key={opt.type} onClick={() => createRound(opt.type)} disabled={loading}
                  style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 5, borderRadius: 16, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
                    background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)',
                    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
                    opacity: loading ? 0.6 : 1,
                  }}>
                  <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f0ead6' }}>{opt.label}</span>
                  <span style={{ fontSize: 10, color: '#7a9e84' }}>{opt.sub}</span>
                </button>
              ))}
            </div>

            <button onClick={() => setMode('join')} style={{
              width: '100%', padding: '13px', borderRadius: 12, cursor: 'pointer',
              fontFamily: "'Inter',sans-serif", fontSize: 14, fontWeight: 600,
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
              color: '#a3b89a', backdropFilter: 'blur(12px)',
            }}>
              🔗 Join a round with a code
            </button>
          </div>
        ) : (
          <div className="glass" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <button onClick={() => setMode(null)} style={{ background: 'transparent', border: 'none', color: '#7a9e84', fontSize: 20, cursor: 'pointer', marginRight: 8 }}>←</button>
              <p style={{ fontWeight: 700, fontSize: 16, color: '#c9a84c' }}>Join a Round</p>
            </div>
            <form onSubmit={joinRound} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                placeholder="Enter 4-letter code (e.g. A3BX)"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={4}
                style={{
                  background: 'rgba(10,28,18,0.8)', border: '0.5px solid rgba(45,90,61,0.8)',
                  borderRadius: 10, color: '#f0ead6', fontSize: 22, fontWeight: 700,
                  padding: '12px 14px', fontFamily: "'Inter',sans-serif", outline: 'none',
                  textAlign: 'center', letterSpacing: '0.2em',
                }}
              />
              <button type="submit" disabled={loading || joinCode.length < 4} style={{
                padding: '13px', borderRadius: 12, border: 'none',
                background: joinCode.length < 4 ? 'rgba(201,168,76,0.3)' : 'linear-gradient(135deg, #c9a84c, #b8952f)',
                color: '#0f2818', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                fontFamily: "'Inter',sans-serif",
              }}>
                {loading ? 'Joining…' : 'Join Round'}
              </button>
            </form>
          </div>
        )}

        <p style={{ fontSize: 10, color: 'rgba(240,234,214,0.3)', textAlign: 'center', lineHeight: 1.55, marginTop: 12 }}>
          Unofficial app · Not affiliated with Miles Grant Country Club<br />
          Free for all members &amp; guests · No data sold or shared
        </p>
      </div>
    </div>
  );
}
