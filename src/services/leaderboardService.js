import { supabase } from '../lib/supabase';

export const leaderboardService = {
  async getClubLeaderboard() {
    const { data, error } = await supabase
      .from('round_players')
      .select('user_id, tee_selection, scores(strokes), users(id, full_name, avatar_url), rounds!inner(status)')
      .eq('rounds.status', 'completed');
    if (error) throw error;

    const map = {};
    (data || []).forEach(rp => {
      const uid = rp.user_id;
      const total = (rp.scores || []).reduce((s, sc) => s + (sc.strokes || 0), 0);
      if (!total) return;
      if (!map[uid]) {
        map[uid] = {
          user_id: uid,
          full_name: rp.users?.full_name || 'Unknown',
          avatar_url: rp.users?.avatar_url,
          rounds_played: 0,
          total_strokes: 0,
        };
      }
      map[uid].rounds_played += 1;
      map[uid].total_strokes += total;
    });

    return Object.values(map)
      .map(p => ({ ...p, avg_score: p.rounds_played ? +(p.total_strokes / p.rounds_played).toFixed(1) : null }))
      .sort((a, b) => (a.avg_score || 999) - (b.avg_score || 999));
  },

  async getRoundLeaderboard(roundId) {
    const { data, error } = await supabase
      .from('round_players')
      .select('*, users(id, full_name, avatar_url), scores(*)')
      .eq('round_id', roundId);
    if (error) throw error;

    return (data || [])
      .map(rp => ({
        ...rp,
        total: (rp.scores || []).reduce((s, sc) => s + (sc.strokes || 0), 0),
      }))
      .sort((a, b) => {
        if (!a.total) return 1;
        if (!b.total) return -1;
        return a.total - b.total;
      });
  },
};
