import { useState } from 'react';
import { authService } from '../services/authService';
import toast from 'react-hot-toast';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  .auth-bg { position: fixed; inset: 0; background-image: url('/course-bg.jpg'); background-size: cover; background-position: center 30%; }
  .auth-overlay { position: fixed; inset: 0; background: linear-gradient(to bottom, rgba(5,16,10,0.3) 0%, rgba(5,16,10,0.97) 55%); }
  .auth-card { background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.12); border-radius: 20px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08); }
  .auth-input { width: 100%; background: rgba(10,28,18,0.8); border: 0.5px solid rgba(45,90,61,0.8); border-radius: 10px; color: #f0ead6; font-size: 15px; padding: 12px 14px; font-family: 'Inter',sans-serif; outline: none; }
  .auth-input:focus { border-color: rgba(201,168,76,0.6); }
  .auth-input::placeholder { color: #4a6a54; }
  .auth-btn { width: 100%; padding: 14px; border-radius: 12px; border: none; font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'Inter',sans-serif; letter-spacing: 0.02em; }
  .auth-btn-primary { background: linear-gradient(135deg, #c9a84c, #b8952f); color: #0f2818; }
  .auth-btn-google { background: rgba(255,255,255,0.08); border: 0.5px solid rgba(255,255,255,0.2); color: #f0ead6; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .auth-divider { display: flex; align-items: center; gap: 12px; }
  .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 0.5px; background: rgba(255,255,255,0.12); }
`;

export function Auth() {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!fullName.trim()) throw new Error('Please enter your name');
        await authService.signUp(email, password, fullName);
        toast.success('Account created! Check your email to confirm.');
        setMode('signin');
      } else {
        await authService.signIn(email, password);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      await authService.signInWithGoogle();
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden', fontFamily: "'Inter',sans-serif", color: '#f0ead6' }}>
      <style>{css}</style>
      <div className="auth-bg" />
      <div className="auth-overlay" />

      <div style={{ position: 'relative', zIndex: 2, height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 1.25rem', paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 38, fontWeight: 700, color: '#fff', lineHeight: 1.05, marginBottom: 6, textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}>
            Miles Grant<br />Country Club
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(201,168,76,0.8)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Golf Companion App
          </p>
        </div>

        {/* Card */}
        <div className="auth-card" style={{ padding: '1.5rem' }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#c9a84c', marginBottom: 16, fontFamily: "'Playfair Display',serif" }}>
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === 'signup' && (
              <input
                className="auth-input"
                type="text"
                placeholder="Full Name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
              />
            )}
            <input
              className="auth-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
              {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="auth-divider" style={{ margin: '14px 0', fontSize: 11, color: '#4a6a54' }}>or</div>

          <button className="auth-btn auth-btn-google" onClick={handleGoogle} disabled={loading}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.84-1.6 2.41v2h2.6c1.52-1.4 2.4-3.46 2.4-5.9 0-.57-.05-1.12-.17-1.51z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2c-.71.48-1.63.76-2.7.76-2.07 0-3.83-1.4-4.46-3.29H1.86v2.07C3.18 15.27 5.92 17 8.98 17z"/>
              <path fill="#FBBC05" d="M4.52 10.53c-.16-.48-.25-.99-.25-1.53s.09-1.05.25-1.53V5.4H1.86A8.01 8.01 0 001 9c0 1.29.31 2.51.86 3.6l2.66-2.07z"/>
              <path fill="#EA4335" d="M8.98 3.58c1.17 0 2.22.4 3.04 1.2l2.28-2.27C12.95 1.19 11.14.4 8.98.4 5.92.4 3.18 2.13 1.86 4.6L4.52 6.67c.63-1.89 2.39-3.09 4.46-3.09z"/>
            </svg>
            Continue with Google
          </button>

          <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: '#7a9e84' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              style={{ background: 'none', border: 'none', color: '#c9a84c', cursor: 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600 }}>
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(240,234,214,0.3)', marginTop: 14, lineHeight: 1.55 }}>
          Unofficial app · Not affiliated with Miles Grant Country Club<br />
          Free for all members &amp; guests · No data sold or shared
        </p>
      </div>
    </div>
  );
}
