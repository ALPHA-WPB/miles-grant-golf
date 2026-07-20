import { useState, useEffect } from 'react';
import { friendsService } from '../services/friendsService';
import toast from 'react-hot-toast';

export function Friends({ userId }) {
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [addEmail, setAddEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState('friends');

  async function load() {
    setLoading(true);
    try {
      const [f, p] = await Promise.all([
        friendsService.getFriends(userId),
        friendsService.getPendingReceived(userId),
      ]);
      setFriends(f);
      setPending(p);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [userId]);

  async function sendRequest(e) {
    e.preventDefault();
    if (!addEmail.trim()) return;
    setAdding(true);
    try {
      const receiver = await friendsService.sendRequest(userId, addEmail);
      toast.success(`Friend request sent to ${receiver.full_name || addEmail}`);
      setAddEmail('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function accept(friendship) {
    try {
      await friendsService.acceptRequest(friendship.id, friendship.requester_id);
      toast.success('Friend request accepted!');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function decline(friendshipId) {
    try {
      await friendsService.declineRequest(friendshipId);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function remove(friendshipId) {
    try {
      await friendsService.removeFriend(friendshipId);
      toast.success('Friend removed');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const cardStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '12px 14px',
  };

  const tabStyle = (active) => ({
    flex: 1,
    padding: '8px 0',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: "'Inter',sans-serif",
    fontSize: 13,
    fontWeight: active ? 700 : 400,
    color: active ? '#c9a84c' : '#7a9e84',
    borderBottom: active ? '2px solid #c9a84c' : '2px solid transparent',
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1rem 2rem', background: '#0a1c12' }}>
      <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: '#c9a84c', marginBottom: '1rem' }}>Friends</h2>

      {/* Add friend */}
      <form onSubmit={sendRequest} style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
        <input
          type="email"
          placeholder="Add by email address"
          value={addEmail}
          onChange={e => setAddEmail(e.target.value)}
          style={{ flex: 1, background: 'rgba(10,28,18,0.8)', border: '0.5px solid rgba(45,90,61,0.8)', borderRadius: 10, color: '#f0ead6', fontSize: 14, padding: '10px 12px', fontFamily: "'Inter',sans-serif", outline: 'none' }}
        />
        <button type="submit" disabled={adding} style={{
          padding: '10px 16px', borderRadius: 10, border: 'none',
          background: '#c9a84c', color: '#0f2818', fontWeight: 700, fontSize: 13,
          cursor: 'pointer', fontFamily: "'Inter',sans-serif", flexShrink: 0,
        }}>
          {adding ? '…' : 'Add'}
        </button>
      </form>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '0.5px solid rgba(45,90,61,0.4)', marginBottom: '1rem' }}>
        <button style={tabStyle(tab === 'friends')} onClick={() => setTab('friends')}>
          Friends {friends.length > 0 && `(${friends.length})`}
        </button>
        <button style={tabStyle(tab === 'pending')} onClick={() => setTab('pending')}>
          Requests {pending.length > 0 && `(${pending.length})`}
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#7a9e84', textAlign: 'center' }}>Loading…</p>
      ) : tab === 'friends' ? (
        friends.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '2rem', color: '#7a9e84' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>👥</p>
            <p>No friends yet. Add some!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {friends.map(({ friendshipId, friend }) => (
              <div key={friendshipId} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(201,168,76,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {friend?.avatar_url ? <img src={friend.avatar_url} style={{ width: 40, height: 40, borderRadius: '50%' }} /> : '⛳'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{friend?.full_name || 'Unknown'}</p>
                  <p style={{ fontSize: 11, color: '#7a9e84' }}>{friend?.email}</p>
                </div>
                <button onClick={() => remove(friendshipId)}
                  style={{ fontSize: 11, color: '#f87171', background: 'transparent', border: '0.5px solid rgba(248,113,113,0.3)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        pending.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '2rem', color: '#7a9e84' }}>
            <p>No pending requests</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(req => (
              <div key={req.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {req.requester?.avatar_url ? <img src={req.requester.avatar_url} style={{ width: 40, height: 40, borderRadius: '50%' }} /> : '👤'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{req.requester?.full_name}</p>
                  <p style={{ fontSize: 11, color: '#7a9e84' }}>{req.requester?.email}</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => accept(req)}
                    style={{ fontSize: 11, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
                    Accept
                  </button>
                  <button onClick={() => decline(req.id)}
                    style={{ fontSize: 11, color: '#f87171', background: 'transparent', border: '0.5px solid rgba(248,113,113,0.3)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
