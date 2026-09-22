import { useState, useEffect } from 'react';
import { friendsService } from '../services/friendsService';
import toast from 'react-hot-toast';

export default function Friends({ userId }) {
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([friendsService.getFriends(userId), friendsService.getPendingReceived(userId)])
      .then(([f, p]) => { setFriends(f); setPending(p); })
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleAdd(e) {
    e.preventDefault();
    try {
      const user = await friendsService.sendRequest(userId, email);
      toast.success(`Request sent to ${user.full_name}`);
      setEmail('');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleAccept(friendshipId) {
    try {
      await friendsService.acceptRequest(friendshipId);
      setPending(p => p.filter(p => p.id !== friendshipId));
      setFriends(await friendsService.getFriends(userId));
      toast.success('Friend added!');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDecline(friendshipId) {
    try {
      await friendsService.declineRequest(friendshipId);
      setPending(p => p.filter(p => p.id !== friendshipId));
    } catch { /* ignore */ }
  }

  return (
    <div style={{flex:1, overflowY:"auto", padding:"1rem 1rem 2rem", background:"#0a1c12"}}>
      <h2 style={{fontFamily:"'Playfair Display',serif", fontSize:22, color:"#c9a84c", marginBottom:"1rem"}}>Friends</h2>
      <form onSubmit={handleAdd} style={{display:"flex", gap:8, marginBottom:"1rem"}}>
        <input type="email" placeholder="Add friend by email" value={email} onChange={e => setEmail(e.target.value)}
          style={{flex:1, background:"rgba(10,28,18,0.8)", border:"0.5px solid rgba(45,90,61,0.8)", borderRadius:10, color:"#f0ead6", fontSize:14, padding:"10px 12px", fontFamily:"'Inter',sans-serif", outline:"none"}} />
        <button type="submit" style={{padding:"10px 16px", borderRadius:10, border:"none", background:"#c9a84c", color:"#0f2818", fontWeight:700, fontSize:13, cursor:"pointer"}}>Add</button>
      </form>

      {pending.length > 0 && (
        <div style={{marginBottom:"1rem"}}>
          <p style={{fontSize:11, color:"#7a9e84", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8}}>Pending requests</p>
          {pending.map(p => (
            <div key={p.id} style={{background:"rgba(201,168,76,0.08)", border:"0.5px solid rgba(201,168,76,0.3)", borderRadius:12, padding:"10px 12px", display:"flex", alignItems:"center", gap:10, marginBottom:6}}>
              <div style={{flex:1}}>
                <p style={{fontWeight:600, fontSize:13}}>{p.requester?.full_name || "Unknown"}</p>
                <p style={{fontSize:11, color:"#7a9e84"}}>{p.requester?.email}</p>
              </div>
              <button onClick={() => handleAccept(p.id)}
                style={{padding:"6px 12px", borderRadius:8, border:"none", background:"#c9a84c", color:"#0f2818", fontWeight:700, fontSize:12, cursor:"pointer"}}>Accept</button>
              <button onClick={() => handleDecline(p.id)}
                style={{padding:"6px 10px", borderRadius:8, border:"0.5px solid rgba(248,113,113,0.3)", background:"transparent", color:"#f87171", fontSize:12, cursor:"pointer"}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p style={{color:"#7a9e84"}}>Loading...</p>
      ) : friends.length === 0 ? (
        <p style={{color:"#7a9e84", textAlign:"center", paddingTop:"1rem", fontSize:13}}>No friends yet. Add someone above!</p>
      ) : (
        <div style={{display:"flex", flexDirection:"column", gap:8}}>
          {friends.map(({friendshipId, friend}) => (
            <div key={friendshipId} style={{background:"rgba(255,255,255,0.04)", border:"0.5px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"12px 14px", display:"flex", alignItems:"center", gap:12}}>
              <div style={{width:36, height:36, borderRadius:"50%", background:"rgba(45,90,61,0.6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:"#c9a84c"}}>
                {(friend?.full_name || friend?.email || "?")[0].toUpperCase()}
              </div>
              <div style={{flex:1}}>
                <p style={{fontWeight:600, fontSize:14}}>{friend?.full_name || "Unknown"}</p>
                <p style={{fontSize:11, color:"#7a9e84"}}>{friend?.email}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
