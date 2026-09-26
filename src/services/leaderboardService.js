import { supabase } from '../lib/supabase';

export const leaderboardService = {
  async getClubLeaderboard() {
    const { data, error } = await supabase.from('round_players')
      .select('user_id, scores(strokes), rounds!inner(status)')
      .eq('rounds.status', 'completed');
    if (error) throw error;
    // Names come from a public view that exposes names only (never emails)
    const ids = [...new Set((data || []).map(r => r.user_id))];
    const names = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('public_profiles').select('id, full_name').in('id', ids);
      (profs || []).forEach(p => { names[p.id] = p.full_name; });
    }
    const byUser = {};
    (data || []).forEach(row => {
      const userId = row.user_id;
      const strokes = (row.scores || []).reduce((sum, s) => sum + (s.strokes || 0), 0);
      if (!strokes) return;
      if (!byUser[userId]) {
        byUser[userId] = { user_id: userId, full_name: names[userId] || 'Golfer', rounds_played: 0, total_strokes: 0 };
      }
      byUser[userId].rounds_played++;
      byUser[userId].total_strokes += strokes;
    });
    return Object.values(byUser)
      .map(u => ({ ...u, avg_score: +(u.total_strokes / u.rounds_played).toFixed(1) }))
      .sort((a, b) => a.avg_score - b.avg_score);
  },
};
