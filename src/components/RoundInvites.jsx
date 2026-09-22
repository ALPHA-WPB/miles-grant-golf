import { useState, useEffect } from 'react';
import { roundService } from '../services/roundService';
import toast from 'react-hot-toast';

const TEE_ORDER = ['champ', 'mens', 'womens'];
const TEE_LABELS = { champ: 'Blue', mens: 'White', womens: 'Red' };
const HOLE_TEE_COLOR = { champ: '#3b82f6', mens: '#d1d5db', womens: '#ef4444' };

export default function RoundInvites({ userId, onJoin }) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [choosingTee, setChoosingTee] = useState(null);
  const [tee, setTee] = useState('mens');

  async function refresh() {
    try {
      setInvites(await roundService.getPendingInvites(userId));
    } catch {
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  async function join(invite) {
    setBusyId(invite.id);
    try {
      const { round, roundPlayer } = await roundService.acceptInvite(invite.id, invite.round_id, userId, TEE_LABELS[tee]);
      toast.success('Joined the round!');
      onJoin({ round, roundPlayer, tee, roundType: round.round_type || 'all18' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
      setChoosingTee(null);
    }
  }

  async function decline(inviteId) {
    setBusyId(inviteId);
    try {
      await roundService.declineInvite(inviteId);
      setInvites(invites => invites.filter(i => i.id !== inviteId));
      toast.success('Invite declined');
    } catch {
      toast.error('Could not decline');
    } finally {
      setBusyId(null);
    }
  }

  if (loading || invites.length === 0) return null;

  const roundTypeLabel = t => t === 'front9' ? 'Front 9' : t === 'back9' ? 'Back 9' : 'All 18';

  return (
    <div style={{marginBottom:10}}>
      {invites.map(invite => (
        <div key={invite.id} style={{background:"rgba(201,168,76,0.08)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:14, padding:"12px 14px", marginBottom:8, backdropFilter:"blur(16px)"}}>
          <p style={{fontSize:13, color:"#c9a84c", fontWeight:700, marginBottom:4}}>Round Invite</p>
          <p style={{fontSize:12, color:"#a3b89a", marginBottom:10}}>
            {roundTypeLabel(invite.rounds?.round_type)} · {new Date(invite.rounds?.created_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}
          </p>
          {choosingTee === invite.id ? (
            <>
              <p style={{fontSize:11, color:"#7a9e84", marginBottom:8}}>Choose your tee:</p>
              <div style={{display:"flex", gap:8, marginBottom:10}}>
                {TEE_ORDER.map(t => (
                  <button key={t} onClick={() => setTee(t)}
                    style={{flex:1, padding:"8px 0", borderRadius:8, cursor:"pointer", fontFamily:"'Inter',sans-serif", fontSize:13, fontWeight:tee===t?600:400,
                      background:tee===t?(t==="champ"?"rgba(30,58,95,0.9)":t==="mens"?"rgba(58,58,58,0.9)":"rgba(90,26,26,0.9)"):"rgba(255,255,255,0.05)",
                      color:tee===t?(t==="champ"?"#60a5fa":t==="mens"?"#e8e8e8":"#f87171"):"#7a9e84",
                      border:tee===t?`1.5px solid ${HOLE_TEE_COLOR[t]}`:"0.5px solid rgba(255,255,255,0.08)"}}>
                    {TEE_LABELS[t]}
                  </button>
                ))}
              </div>
              <div style={{display:"flex", gap:8}}>
                <button onClick={() => join(invite)} disabled={busyId === invite.id}
                  style={{flex:1, padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#c9a84c,#b8952f)", color:"#0f2818", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
                  {busyId === invite.id ? "..." : "Join Round"}
                </button>
                <button onClick={() => setChoosingTee(null)}
                  style={{padding:"10px 14px", borderRadius:10, border:"0.5px solid rgba(255,255,255,0.15)", background:"transparent", color:"#7a9e84", fontSize:13, cursor:"pointer"}}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div style={{display:"flex", gap:8}}>
              <button onClick={() => setChoosingTee(invite.id)}
                style={{flex:1, padding:"10px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#c9a84c,#b8952f)", color:"#0f2818", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Inter',sans-serif"}}>
                Join
              </button>
              <button onClick={() => decline(invite.id)} disabled={busyId === invite.id}
                style={{padding:"10px 14px", borderRadius:10, border:"0.5px solid rgba(248,113,113,0.3)", background:"transparent", color:"#f87171", fontSize:13, cursor:"pointer"}}>
                Decline
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
