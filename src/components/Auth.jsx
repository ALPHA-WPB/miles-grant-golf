import { useState } from 'react';
import { authService } from '../services/authService';
import toast from 'react-hot-toast';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  .auth-bg { position: fixed; inset: 0; background-image: url('/course-bg.jpg'); background-size: cover; background-position: center 30%; }
  .auth-overlay { position: fixed; inset: 0; background: linear-gradient(to bottom, rgba(5,16,10,0.2) 0%, rgba(5,16,10,0.97) 52%); }
  .auth-card { background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.12); border-radius: 20px; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
  .auth-input { width: 100%; background: rgba(10,28,18,0.8); border: 0.5px solid rgba(45,90,61,0.8); border-radius: 10px; color: #f0ead6; font-size: 15px; padding: 12px 14px; font-family: 'Inter',sans-serif; outline: none; }
  .auth-input:focus { border-color: rgba(201,168,76,0.6); }
  .auth-input::placeholder { color: #4a6a54; }
  .auth-btn { width: 100%; padding: 14px; border-radius: 12px; border: none; font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'Inter',sans-serif; }
  .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .auth-btn-primary { background: linear-gradient(135deg, #c9a84c, #b8952f); color: #0f2818; }
  .auth-btn-guest { background: rgba(255,255,255,0.06); border: 0.5px solid rgba(255,255,255,0.15) !important; color: #f0ead6; }
  .auth-btn-social { background: rgba(255,255,255,0.08); border: 0.5px solid rgba(255,255,255,0.2) !important; color: #f0ead6; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .auth-divider { display: flex; align-items: center; gap: 12px; color: #4a6a54; font-size: 11px; }
  .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 0.5px; background: rgba(255,255,255,0.12); }
  .auth-help-btn { position: fixed; top: max(env(safe-area-inset-top),14px); right: 16px; z-index: 10; width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.08); border: 0.5px solid rgba(255,255,255,0.2); color: #f0ead6; font-family: 'Playfair Display',serif; font-weight: 700; font-size: 16px; cursor: pointer; }
`;

export default function Auth({ onGuest, onShowInstructions }) {
  const [mode, setMode] = useState('signin');
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
        toast.success('Account created! Check your email.');
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

  async function handleApple() {
    setLoading(true);
    try {
      await authService.signInWithApple();
    } catch (err) {
      toast.error(err.message);
      setLoading(false);
    }
  }

  return (
    <div style={{position:"relative", height:"100vh", overflow:"hidden", fontFamily:"'Inter',sans-serif", color:"#f0ead6"}}>
      <style>{css}</style>
      <div className="auth-bg" />
      <div className="auth-overlay" />
      {onShowInstructions && (
        <button className="auth-help-btn" onClick={onShowInstructions} aria-label="How this app works">?</button>
      )}
      <div style={{position:"relative", zIndex:2, height:"100vh", display:"flex", flexDirection:"column", justifyContent:"flex-end", padding:"0 1.25rem", paddingBottom:"max(env(safe-area-inset-bottom),28px)"}}>
        <div style={{textAlign:"center", marginBottom:"1.5rem"}}>
          <h1 style={{fontFamily:"'Playfair Display',serif", fontSize:38, fontWeight:700, color:"#fff", lineHeight:1.05, marginBottom:6, textShadow:"0 2px 20px rgba(0,0,0,0.8)"}}>
            Miles Grant<br/>Country Club
          </h1>
          <p style={{fontSize:12, color:"rgba(201,168,76,0.9)", letterSpacing:"0.06em", textTransform:"uppercase"}}>Golf Companion App</p>
        </div>

        <div className="auth-card" style={{padding:"1.5rem"}}>
          <p style={{fontSize:18, fontWeight:700, color:"#c9a84c", marginBottom:16, fontFamily:"'Playfair Display',serif"}}>
            {mode === "signin" ? "Sign In" : "Create Account"}
          </p>
          <form onSubmit={handleSubmit} style={{display:"flex", flexDirection:"column", gap:10}}>
            {mode === "signup" && (
              <input className="auth-input" type="text" placeholder="Full Name" value={fullName}
                onChange={e => setFullName(e.target.value)} required />
            )}
            <input className="auth-input" type="email" placeholder="Email" value={email}
              onChange={e => setEmail(e.target.value)} required />
            <input className="auth-input" type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} required minLength={6} />
            <button type="submit" className="auth-btn auth-btn-primary" disabled={loading}>
              {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="auth-divider" style={{margin:"14px 0"}}>or continue with</div>
          <div style={{display:"flex", gap:10, marginBottom:10}}>
            <button className="auth-btn auth-btn-social" style={{flex:1, padding:"12px 0"}} onClick={handleGoogle} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.84-1.6 2.41v2h2.6c1.52-1.4 2.4-3.46 2.4-5.9 0-.57-.05-1.12-.17-1.51z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2c-.71.48-1.63.76-2.7.76-2.07 0-3.83-1.4-4.46-3.29H1.86v2.07C3.18 15.27 5.92 17 8.98 17z"/>
                <path fill="#FBBC05" d="M4.52 10.53c-.16-.48-.25-.99-.25-1.53s.09-1.05.25-1.53V5.4H1.86A8.01 8.01 0 001 9c0 1.29.31 2.51.86 3.6l2.66-2.07z"/>
                <path fill="#EA4335" d="M8.98 3.58c1.17 0 2.22.4 3.04 1.2l2.28-2.27C12.95 1.19 11.14.4 8.98.4 5.92.4 3.18 2.13 1.86 4.6L4.52 6.67c.63-1.89 2.39-3.09 4.46-3.09z"/>
              </svg>
              Google
            </button>
            <button className="auth-btn auth-btn-social" style={{flex:1, padding:"12px 0"}} onClick={handleApple} disabled={loading}>
              <svg width="17" height="18" viewBox="0 0 814 1000" fill="#f0ead6">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 376.6 0 290.3 0 208.3 0 84.9 68.7 19.3 135.2 19.3c65.4 0 108.2 43.5 159.3 43.5 47.9 0 97.8-45.7 166.8-45.7 65.5 0 137.8 38.1 188.4 120.3zm-214.3-97.9c-26 28.6-65.1 50.4-104.3 50.4-6.5 0-13-.6-18.4-1.9-.6-5.2-.6-10.4-.6-15.6 0-48.7 25.4-99.1 58.6-131.7 33.2-33.2 87.5-57.8 133.6-59.1 1.3 6.5 1.9 12.9 1.9 19.4 0 48-19.4 95.8-70.8 138.5z"/>
              </svg>
              Apple
            </button>
          </div>

          <button className="auth-btn auth-btn-guest" onClick={onGuest} disabled={loading} style={{marginBottom:4}}>
            Continue as Guest
          </button>
          <p style={{fontSize:11, color:"#7a9e84", textAlign:"center", marginTop:8, lineHeight:1.5}}>
            Guests can play a full round with GPS yardage and scoring free of charge.
            Create an account to save round history, add friends, and join the club leaderboard.
          </p>

          <p style={{textAlign:"center", marginTop:14, fontSize:13, color:"#7a9e84"}}>
            {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              style={{background:"none", border:"none", color:"#c9a84c", cursor:"pointer", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:600}}>
              {mode === "signin" ? "Sign Up" : "Sign In"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
