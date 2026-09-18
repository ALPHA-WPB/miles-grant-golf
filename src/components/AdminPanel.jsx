import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { getAdminStats } from '../services/adminService';

const css = `
  .admin-wrap { position:fixed; inset:0; background:#050f08; color:#e8dfc8; font-family:'Inter',sans-serif; display:flex; flex-direction:column; overflow:hidden; }
  .admin-header { display:flex; align-items:center; gap:12px; padding:16px 20px; border-bottom:0.5px solid rgba(45,90,61,0.5); flex-shrink:0; }
  .admin-back { background:rgba(255,255,255,0.06); border:0.5px solid rgba(255,255,255,0.15); border-radius:10px; color:#e8dfc8; font-size:13px; padding:8px 14px; cursor:pointer; }
  .admin-title { font-size:18px; font-weight:700; color:#c9a84c; font-family:'Playfair Display',serif; }
  .admin-body { flex:1; overflow-y:auto; padding:16px 20px 32px; display:flex; flex-direction:column; gap:16px; }
  .admin-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .admin-row-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
  .stat-card { background:rgba(255,255,255,0.04); border:0.5px solid rgba(45,90,61,0.4); border-radius:14px; padding:16px; }
  .stat-val { font-size:32px; font-weight:700; color:#c9a84c; line-height:1; }
  .stat-label { font-size:12px; color:#7a9e84; margin-top:4px; text-transform:uppercase; letter-spacing:0.05em; }
  .section-title { font-size:13px; font-weight:600; color:#c9a84c; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:8px; }
  .admin-card { background:rgba(255,255,255,0.04); border:0.5px solid rgba(45,90,61,0.4); border-radius:14px; padding:16px; }
  .location-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:0.5px solid rgba(255,255,255,0.06); font-size:14px; }
  .location-row:last-child { border-bottom:none; }
  .loc-name { color:#e8dfc8; }
  .loc-count { background:rgba(201,168,76,0.15); color:#c9a84c; font-size:12px; font-weight:600; padding:2px 8px; border-radius:20px; }
  .user-row { display:flex; flex-direction:column; gap:2px; padding:10px 0; border-bottom:0.5px solid rgba(255,255,255,0.06); }
  .user-row:last-child { border-bottom:none; }
  .user-name { font-size:14px; font-weight:600; color:#e8dfc8; }
  .user-meta { font-size:11px; color:#7a9e84; display:flex; gap:8px; flex-wrap:wrap; }
  .bar-wrap { display:flex; flex-direction:column; gap:6px; }
  .bar-row { display:flex; align-items:center; gap:8px; font-size:12px; }
  .bar-label { width:28px; color:#7a9e84; text-align:right; flex-shrink:0; }
  .bar-track { flex:1; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; }
  .bar-fill { height:100%; background:linear-gradient(90deg,#2d5a3d,#c9a84c); border-radius:3px; transition:width 0.5s; }
  .bar-count { width:24px; color:#c9a84c; font-weight:600; text-align:right; flex-shrink:0; }
  .suggestion-item { display:flex; gap:12px; padding:12px 0; border-bottom:0.5px solid rgba(255,255,255,0.06); align-items:flex-start; }
  .suggestion-item:last-child { border-bottom:none; }
  .suggestion-icon { font-size:20px; flex-shrink:0; width:32px; text-align:center; }
  .suggestion-text { flex:1; }
  .suggestion-title { font-size:14px; font-weight:600; color:#e8dfc8; }
  .suggestion-desc { font-size:12px; color:#7a9e84; margin-top:2px; line-height:1.4; }
  .suggestion-priority { font-size:10px; padding:2px 6px; border-radius:10px; margin-top:4px; display:inline-block; }
  .priority-high { background:rgba(220,80,60,0.2); color:#f08070; }
  .priority-med { background:rgba(201,168,76,0.15); color:#c9a84c; }
  .priority-low { background:rgba(45,90,61,0.3); color:#7a9e84; }
  .loading { color:#7a9e84; font-size:14px; text-align:center; padding:40px; }
  .refresh-btn { background:rgba(201,168,76,0.12); border:0.5px solid rgba(201,168,76,0.3); border-radius:8px; color:#c9a84c; font-size:12px; padding:6px 12px; cursor:pointer; margin-left:auto; }
  .member-map { width:100%; height:260px; border-radius:12px; overflow:hidden; }
  .member-map .leaflet-container { background:#0a1f12; }
`;

function MemberMap({ pins }) {
  const mapRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || instanceRef.current) return;
    const map = L.map(mapRef.current, {
      center: [20, 0], zoom: 2, zoomControl: true,
      attributionControl: false, scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 18,
    }).addTo(map);

    const icon = L.divIcon({
      className: '',
      html: '<div style="width:10px;height:10px;background:#c9a84c;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(201,168,76,0.8)"></div>',
      iconSize: [10, 10], iconAnchor: [5, 5],
    });

    pins.forEach(u => {
      L.marker([u.location_lat, u.location_lng], { icon })
        .bindPopup(`<b style="color:#c9a84c">${u.full_name || 'Member'}</b><br/>${u.location_city || ''}${u.location_country ? ', ' + u.location_country : ''}`)
        .addTo(map);
    });

    instanceRef.current = map;
    return () => { map.remove(); instanceRef.current = null; };
  }, [pins]);

  return <div ref={mapRef} className="member-map" />;
}

const SUGGESTIONS = [
  { icon: '📊', title: 'Handicap Tracker', desc: 'Auto-calculate and track each player\'s official handicap index from their round history.', priority: 'high' },
  { icon: '🏆', title: 'Club Leaderboards', desc: 'Weekly and monthly leaderboards by net score, gross score, and most improved.', priority: 'high' },
  { icon: '📣', title: 'Push Notifications', desc: 'Broadcast announcements to all members — tournaments, tee time openings, weather alerts.', priority: 'high' },
  { icon: '📅', title: 'Tee Time Booking', desc: 'Let members book and manage tee times directly in the app, with conflict detection.', priority: 'med' },
  { icon: '🎯', title: 'Tournament Mode', desc: 'Create club tournaments with brackets, scoring formats (stroke, match, stableford), and live scoring.', priority: 'med' },
  { icon: '👤', title: 'User Management', desc: 'Search, suspend, or promote users to members/admins. View full round history per user.', priority: 'med' },
  { icon: '📈', title: 'Score Trends', desc: 'Per-hole difficulty analytics — which holes have the highest stroke averages across all members.', priority: 'med' },
  { icon: '💬', title: 'Club Bulletin Board', desc: 'A pinned feed for club announcements visible to all logged-in members.', priority: 'low' },
  { icon: '🌦️', title: 'Weather Integration', desc: 'Show live weather and course conditions on the app home screen and admin dashboard.', priority: 'low' },
  { icon: '📸', title: 'Shot Photos', desc: 'Let players attach photos to specific holes during a round — memorable shots, course conditions.', priority: 'low' },
];

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AdminPanel({ onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  async function load() {
    setLoading(true);
    const data = await getAdminStats();
    setStats(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const maxWeek = stats ? Math.max(...stats.weeklySignups.map(w => w.count), 1) : 1;

  return (
    <>
      <style>{css}</style>
      <div className="admin-wrap">
        <div className="admin-header">
          <button className="admin-back" onClick={onClose}>← Back</button>
          <span className="admin-title">Admin Dashboard</span>
          <button className="refresh-btn" onClick={load}>↻ Refresh</button>
        </div>

        {/* Tab bar */}
        <div style={{display:'flex',gap:0,borderBottom:'0.5px solid rgba(45,90,61,0.4)',flexShrink:0}}>
          {['overview','users','locations','suggestions'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex:1, padding:'10px 4px', background:'transparent', border:'none',
              borderBottom: tab===t ? '2px solid #c9a84c' : '2px solid transparent',
              color: tab===t ? '#c9a84c' : '#7a9e84', fontSize:12, cursor:'pointer',
              textTransform:'capitalize', fontFamily:'Inter,sans-serif', fontWeight: tab===t ? 600 : 400,
            }}>{t}</button>
          ))}
        </div>

        <div className="admin-body">
          {loading && <div className="loading">Loading...</div>}

          {!loading && stats && tab === 'overview' && (
            <>
              <div className="admin-row-3">
                <div className="stat-card">
                  <div className="stat-val">{stats.totalUsers}</div>
                  <div className="stat-label">Total Members</div>
                </div>
                <div className="stat-card">
                  <div className="stat-val">{stats.totalRounds}</div>
                  <div className="stat-label">Rounds Played</div>
                </div>
                <div className="stat-card">
                  <div className="stat-val">{stats.activeRounds}</div>
                  <div className="stat-label">Active Now</div>
                </div>
              </div>

              <div className="admin-card">
                <div className="section-title">Sign-ups — Last 8 Weeks</div>
                <div className="bar-wrap">
                  {stats.weeklySignups.map(w => (
                    <div key={w.label} className="bar-row">
                      <span className="bar-label">{w.label}</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{width: `${(w.count / maxWeek) * 100}%`}} />
                      </div>
                      <span className="bar-count">{w.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="admin-card" style={{padding:'14px 16px'}}>
                <div className="section-title">Member Locations</div>
                {stats.userPins?.length > 0
                  ? <MemberMap pins={stats.userPins} />
                  : <div style={{color:'#7a9e84',fontSize:13,padding:'20px 0'}}>No GPS location data yet — populates as members log in.</div>
                }
              </div>
            </>
          )}

          {!loading && stats && tab === 'users' && (
            <div className="admin-card" style={{padding:0,overflow:'hidden'}}>
              <div style={{padding:'14px 16px 10px',borderBottom:'0.5px solid rgba(45,90,61,0.4)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span className="section-title" style={{margin:0}}>{stats.recentUsers.length} Members</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:'0.5px solid rgba(45,90,61,0.4)'}}>
                      <th style={{padding:'8px 16px',textAlign:'left',color:'#7a9e84',fontWeight:600,whiteSpace:'nowrap'}}>#</th>
                      <th style={{padding:'8px 16px',textAlign:'left',color:'#7a9e84',fontWeight:600,whiteSpace:'nowrap'}}>Name</th>
                      <th style={{padding:'8px 16px',textAlign:'left',color:'#7a9e84',fontWeight:600,whiteSpace:'nowrap'}}>Email</th>
                      <th style={{padding:'8px 16px',textAlign:'left',color:'#7a9e84',fontWeight:600,whiteSpace:'nowrap'}}>Location</th>
                      <th style={{padding:'8px 16px',textAlign:'left',color:'#7a9e84',fontWeight:600,whiteSpace:'nowrap'}}>Signed Up</th>
                      <th style={{padding:'8px 16px',textAlign:'left',color:'#7a9e84',fontWeight:600,whiteSpace:'nowrap'}}>Last Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentUsers.map((u, i) => (
                      <tr key={u.id} style={{borderBottom:'0.5px solid rgba(255,255,255,0.05)',background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.02)'}}>
                        <td style={{padding:'10px 16px',color:'#4a6a54'}}>{i+1}</td>
                        <td style={{padding:'10px 16px',color:'#e8dfc8',fontWeight:600,whiteSpace:'nowrap'}}>{u.full_name || '—'}</td>
                        <td style={{padding:'10px 16px',color:'#7a9e84',whiteSpace:'nowrap'}}>{u.email || '—'}</td>
                        <td style={{padding:'10px 16px',color:'#7a9e84',whiteSpace:'nowrap'}}>
                          {u.location_city ? `📍 ${u.location_city}${u.location_country ? `, ${u.location_country}` : ''}` : '—'}
                        </td>
                        <td style={{padding:'10px 16px',color:'#7a9e84',whiteSpace:'nowrap'}}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                        <td style={{padding:'10px 16px',color:'#7a9e84',whiteSpace:'nowrap'}}>{u.last_seen_at ? timeAgo(u.last_seen_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.recentUsers.length === 0 && <div style={{color:'#7a9e84',fontSize:13,padding:16}}>No users yet.</div>}
              </div>
            </div>
          )}

          {!loading && stats && tab === 'locations' && (
            <>
              <div className="admin-card">
                <div className="section-title">By City</div>
                {stats.byCity.map(([city, count]) => (
                  <div key={city} className="location-row">
                    <span className="loc-name">📍 {city}</span>
                    <span className="loc-count">{count}</span>
                  </div>
                ))}
                {stats.byCity.length === 0 && <div style={{color:'#7a9e84',fontSize:13}}>Location data populates as members log in.</div>}
              </div>
              <div className="admin-card">
                <div className="section-title">By Country</div>
                {stats.byCountry.map(([country, count]) => (
                  <div key={country} className="location-row">
                    <span className="loc-name">{country}</span>
                    <span className="loc-count">{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'suggestions' && (
            <div className="admin-card">
              <div className="section-title">Suggested Features</div>
              {SUGGESTIONS.map(s => (
                <div key={s.title} className="suggestion-item">
                  <div className="suggestion-icon">{s.icon}</div>
                  <div className="suggestion-text">
                    <div className="suggestion-title">{s.title}</div>
                    <div className="suggestion-desc">{s.desc}</div>
                    <span className={`suggestion-priority priority-${s.priority}`}>
                      {s.priority === 'high' ? '🔥 High value' : s.priority === 'med' ? '⭐ Medium' : '💡 Nice to have'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
