import { supabase } from '../lib/supabase';

export const friendsService = {
  async sendRequest(userId, email) {
    const { data: user, error } = await supabase.from('users')
      .select('id, full_name').eq('email', email.toLowerCase().trim()).single();
    if (error || !user) throw new Error('No user found with that email');
    if (user.id === userId) throw new Error('You cannot add yourself');
    const { error: insertError } = await supabase.from('friends')
      .insert({ requester_id: userId, receiver_id: user.id, status: 'pending' });
    if (insertError) throw insertError.code === '23505' ? new Error('Friend request already sent') : insertError;
    return user;
  },
  async acceptRequest(friendshipId) {
    await supabase.from('friends').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendshipId);
  },
  async declineRequest(friendshipId) {
    await supabase.from('friends').delete().eq('id', friendshipId);
  },
  async getFriends(userId) {
    const { data } = await supabase.from('friends')
      .select('*, requester:requester_id(id, email, full_name, avatar_url), receiver:receiver_id(id, email, full_name, avatar_url)')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);
    return (data || []).map(f => ({
      friendshipId: f.id,
      friend: f.requester_id === userId ? f.receiver : f.requester,
    }));
  },
  async getPendingReceived(userId) {
    const { data } = await supabase.from('friends')
      .select('*, requester:requester_id(id, email, full_name, avatar_url)')
      .eq('receiver_id', userId).eq('status', 'pending');
    return data || [];
  },
  async removeFriend(friendshipId) {
    await supabase.from('friends').delete().eq('id', friendshipId);
  },
};
