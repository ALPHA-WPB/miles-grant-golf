import { supabase } from '../lib/supabase';

export const friendsService = {
  async sendRequest(requesterId, receiverEmail) {
    const { data: receiver, error: fErr } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('email', receiverEmail.toLowerCase().trim())
      .single();
    if (fErr || !receiver) throw new Error('No user found with that email');

    if (receiver.id === requesterId) throw new Error('You cannot add yourself');

    const { error } = await supabase
      .from('friends')
      .insert({ requester_id: requesterId, receiver_id: receiver.id, status: 'pending' });
    if (error) {
      if (error.code === '23505') throw new Error('Friend request already sent');
      throw error;
    }

    await supabase.from('notifications').insert({
      user_id: receiver.id,
      type: 'friend_request',
      related_user_id: requesterId,
      title: 'Friend Request',
      message: 'sent you a friend request',
    });

    return receiver;
  },

  async acceptRequest(friendshipId, requesterId) {
    const { error } = await supabase
      .from('friends')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', friendshipId);
    if (error) throw error;

    await supabase.from('notifications').insert({
      user_id: requesterId,
      type: 'friend_accepted',
      title: 'Friend Request Accepted',
      message: 'accepted your friend request',
    });
  },

  async declineRequest(friendshipId) {
    const { error } = await supabase.from('friends').delete().eq('id', friendshipId);
    if (error) throw error;
  },

  async getFriends(userId) {
    const { data, error } = await supabase
      .from('friends')
      .select('*, requester:requester_id(id, email, full_name, avatar_url), receiver:receiver_id(id, email, full_name, avatar_url)')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);
    if (error) throw error;

    return (data || []).map(f => ({
      friendshipId: f.id,
      friend: f.requester_id === userId ? f.receiver : f.requester,
    }));
  },

  async getPendingReceived(userId) {
    const { data, error } = await supabase
      .from('friends')
      .select('*, requester:requester_id(id, email, full_name, avatar_url)')
      .eq('receiver_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    return data || [];
  },

  async removeFriend(friendshipId) {
    const { error } = await supabase.from('friends').delete().eq('id', friendshipId);
    if (error) throw error;
  },
};
