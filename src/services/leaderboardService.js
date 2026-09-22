import { supabase } from '../lib/supabase';

export const leaderboardService = {
  async getClubLeaderboard() {
    const { data, error } = await supabase.from('round_players')
      .select('user_id, scores(strokes), users(id, full_name, avatar_url), rounds!inner(status)')
      .eq('rounds.status', 'completed');
    if (error) throw error;
    const byUser = {};
    (data || []).forEach(row => {
      const userId = row.user_id;
      const strokes = (row.scores || []).reduce((sum, s) => sum + (s.strokes || 0), 0);
      if (!strokes) return;
      if (!byUser[userId]) {
        byUser[userId] = { user_id: userId, full_name: row.users?.full_name || 'Unknown', rounds_played: 0, total_strokes: 0 };
      }
      byUser[userId].rounds_played++;
      byUser[userId].total_strokes += strokes;
    });
    return Object.values(byUser)
      .map(u => ({ ...u, avg_score: +(u.total_strokes / u.rounds_played).toFixed(1) }))
      .sort((a, b) => a.avg_score - b.avg_score);
  },
};
