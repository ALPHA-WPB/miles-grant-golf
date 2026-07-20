import { supabase } from '../lib/supabase';

function makeJoinCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export const roundService = {
  async createRound(userId, teeSelection, roundType) {
    const joinCode = makeJoinCode();
    const { data: round, error: rErr } = await supabase
      .from('rounds')
      .insert({ creator_id: userId, join_code: joinCode, round_type: roundType, status: 'in_progress' })
      .select()
      .single();
    if (rErr) throw rErr;

    const { data: rp, error: pErr } = await supabase
      .from('round_players')
      .insert({ round_id: round.id, user_id: userId, tee_selection: teeSelection })
      .select()
      .single();
    if (pErr) throw pErr;

    return { round, roundPlayer: rp };
  },

  async joinRoundByCode(code, userId, teeSelection) {
    const { data: rounds, error: fErr } = await supabase
      .from('rounds')
      .select('*')
      .eq('join_code', code.toUpperCase())
      .eq('status', 'in_progress');
    if (fErr) throw fErr;
    if (!rounds || rounds.length === 0) throw new Error('Round not found or already finished');

    const round = rounds[0];

    const { data: existing } = await supabase
      .from('round_players')
      .select('id')
      .eq('round_id', round.id)
      .eq('user_id', userId);
    if (existing && existing.length > 0) throw new Error('You are already in this round');

    const { data: allPlayers } = await supabase
      .from('round_players')
      .select('id')
      .eq('round_id', round.id);
    if (allPlayers && allPlayers.length >= 4) throw new Error('Round is full (4 players max)');

    const { data: rp, error: pErr } = await supabase
      .from('round_players')
      .insert({ round_id: round.id, user_id: userId, tee_selection: teeSelection })
      .select()
      .single();
    if (pErr) throw pErr;

    return { round, roundPlayer: rp };
  },

  async getRoundWithPlayers(roundId) {
    const { data, error } = await supabase
      .from('rounds')
      .select('*, round_players(*, users(id, full_name, email, avatar_url)), scores(*)')
      .eq('id', roundId)
      .single();
    if (error) throw error;
    return data;
  },

  async upsertScore(roundPlayerId, holeNumber, strokes) {
    const { data, error } = await supabase
      .from('scores')
      .upsert(
        { round_player_id: roundPlayerId, hole_number: holeNumber, strokes, updated_at: new Date().toISOString() },
        { onConflict: 'round_player_id,hole_number' }
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async finalizeRound(roundId) {
    const { error } = await supabase
      .from('rounds')
      .update({ status: 'completed', end_time: new Date().toISOString() })
      .eq('id', roundId);
    if (error) throw error;
  },

  async getActiveRoundForUser(userId) {
    const { data: rps } = await supabase
      .from('round_players')
      .select('round_id')
      .eq('user_id', userId);
    if (!rps || rps.length === 0) return null;

    const roundIds = rps.map(r => r.round_id);
    const { data: rounds } = await supabase
      .from('rounds')
      .select('*')
      .in('id', roundIds)
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false })
      .limit(1);

    return rounds?.[0] || null;
  },

  async getRoundHistory(userId) {
    const { data: rps } = await supabase
      .from('round_players')
      .select('round_id')
      .eq('user_id', userId);
    if (!rps || rps.length === 0) return [];

    const roundIds = rps.map(r => r.round_id);
    const { data, error } = await supabase
      .from('rounds')
      .select('*, round_players(*, users(full_name), scores(*))')
      .in('id', roundIds)
      .eq('status', 'completed')
      .order('end_time', { ascending: false })
      .limit(20);
    if (error) throw error;
    return data || [];
  },

  subscribeToRound(roundId, callback) {
    return supabase
      .channel(`round-${roundId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, callback)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'round_players', filter: `round_id=eq.${roundId}` }, callback)
      .subscribe();
  },
};
