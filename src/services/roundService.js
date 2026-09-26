import { supabase } from '../lib/supabase';

function genJoinCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export const roundService = {
  async createRound(userId, teeSelection, roundType) {
    const joinCode = genJoinCode();
    const { data: round, error } = await supabase.from('rounds')
      .insert({ creator_id: userId, join_code: joinCode, round_type: roundType, status: 'in_progress' })
      .select().single();
    if (error) throw error;
    const { data: roundPlayer, error: rpError } = await supabase.from('round_players')
      .insert({ round_id: round.id, user_id: userId, tee_selection: teeSelection })
      .select().single();
    if (rpError) throw rpError;
    return { round, roundPlayer };
  },
  async inviteFriends(roundId, friendIds) {
    if (!friendIds.length) return;
    const rows = friendIds.map(id => ({ round_id: roundId, invited_user_id: id, status: 'pending' }));
    const { error } = await supabase.from('round_invites').insert(rows);
    if (error) throw error;
  },
  async getPendingInvites(userId) {
    const { data } = await supabase.from('round_invites')
      .select('*, rounds(id, round_type, join_code, created_at)')
      .eq('invited_user_id', userId).eq('status', 'pending');
    return data || [];
  },
  async acceptInvite(inviteId, roundId, userId, teeSelection) {
    const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).single();
    if (!round || round.status !== 'in_progress') throw new Error('This round is no longer active');
    const { data: existing } = await supabase.from('round_players')
      .select('id').eq('round_id', roundId).eq('user_id', userId);
    if (existing?.length) throw new Error('You are already in this round');
    const { data: roundPlayer, error } = await supabase.from('round_players')
      .insert({ round_id: roundId, user_id: userId, tee_selection: teeSelection })
      .select().single();
    if (error) throw error;
    await supabase.from('round_invites').update({ status: 'accepted' }).eq('id', inviteId);
    return { round, roundPlayer };
  },
  async declineInvite(inviteId) {
    await supabase.from('round_invites').update({ status: 'declined' }).eq('id', inviteId);
  },
  async upsertScore(roundPlayerId, holeNumber, strokes) {
    const { data, error } = await supabase.from('scores')
      .upsert({ round_player_id: roundPlayerId, hole_number: holeNumber, strokes, updated_at: new Date().toISOString() },
        { onConflict: 'round_player_id,hole_number' })
      .select().single();
    if (error) throw error;
    return data;
  },
  async finalizeRound(roundId, roundType) {
    const patch = { status: 'completed', end_time: new Date().toISOString() };
    if (roundType) patch.round_type = roundType;
    await supabase.from('rounds').update(patch).eq('id', roundId);
  },
  async getRoundHistory(userId) {
    const { data: rp } = await supabase.from('round_players').select('round_id').eq('user_id', userId);
    if (!rp?.length) return [];
    const roundIds = rp.map(r => r.round_id);
    const { data } = await supabase.from('rounds')
      .select('*, round_players(*, users(full_name), scores(*))')
      .in('id', roundIds).eq('status', 'completed')
      .order('end_time', { ascending: false }).limit(20);
    return data || [];
  },
  subscribeToRound(roundId, callback) {
    return supabase.channel(`round-${roundId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players', filter: `round_id=eq.${roundId}` }, callback)
      .subscribe();
  },
};
