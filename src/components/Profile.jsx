import { useState } from 'react';
import { authService } from '../services/authService';
import toast from 'react-hot-toast';

export function Profile({ user, profile, onSignOut, onProfileUpdate }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await authService.updateProfile(user.id, { full_name: name });
      onProfileUpdate?.(updated);
      setEditing(false);
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    try {
      await authService.signOut();
      onSignOut?.();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const cardStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '14px',
    marginBottom: 10,
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1rem 2rem', background: '#0a1c12' }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: '#c9a84c', marginBottom: '1rem' }}>Profile</h2>

      {/* Avatar + name */}
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
          ) : '⛳'}
        </div>
        <div style={{ flex: 1 }}>
          {editing ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ flex: 1, background: 'rgba(10,28,18,0.8)', border: '0.5px solid rgba(45,90,61,0.8)', borderRadius: 8, color: '#f0ead6', fontSize: 14, padding: '6px 10px', fontFamily: "'Inter',sans-serif", outline: 'none' }}
              />
              <button onClick={save} disabled={saving} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#c9a84c', color: '#0f2818', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {saving ? '…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} style={{ padding: '6px 10px', borderRadius: 8, border: '0.5px solid #2d5a3d', background: 'transparent', color: '#7a9e84', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ fontWeight: 700, fontSize: 16, color: '#f0ead6' }}>{profile?.full_name || 'Golfer'}</p>
              <button onClick={() => setEditing(true)} style={{ fontSize: 11, color: '#7a9e84', background: 'transparent', border: 'none', cursor: 'pointer' }}>✏️</button>
            </div>
          )}
          <p style={{ fontSize: 12, color: '#7a9e84', marginTop: 2 }}>{user.email}</p>
        </div>
      </div>

      {/* App info */}
      <div style={cardStyle}>
        <p style={{ fontSize: 12, color: '#7a9e84', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>About</p>
        <p style={{ fontSize: 13, color: '#a3b89a', lineHeight: 1.6 }}>
          Miles Grant Golf Companion — unofficial free app for members and guests of Miles Grant Country Club, Stuart FL.
        </p>
        <p style={{ fontSize: 11, color: '#4a6a54', marginTop: 8, lineHeight: 1.5 }}>
          Not affiliated with Miles Grant Country Club · No data sold or shared
        </p>
      </div>

      {/* Sign out */}
      <button onClick={signOut} style={{
        width: '100%', padding: '13px', borderRadius: 12,
        border: '0.5px solid rgba(248,113,113,0.3)', background: 'transparent',
        color: '#f87171', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        fontFamily: "'Inter',sans-serif",
      }}>
        Sign Out
      </button>
    </div>
  );
}
