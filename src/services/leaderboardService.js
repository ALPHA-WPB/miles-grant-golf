import { supabase } from '../lib/supabase';

// Club leaderboard: completed 18-hole and 9-hole rounds, ranked separately.
// Partial rounds are left out so scores compare fairly.
const NINE = ['front9', 'back9', 'nine'];

export const leaderboardService = {
  async getClubLeaderboard() {
    const { data, error } = await supabase.from('round_players')
      .select('user_id, scores(strokes), rounds!inner(status, round_type)')
      .eq('rounds.status', 'completed');
    if (error) throw error;
    // Names come from a public view that exposes names only (never emails)
    const ids = [...new Set((data || []).map(r => r.user_id))];
    const names = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('public_profiles').select('id, full_name').in('id', ids);
      (profs || []).forEach(p => { names[p.id] = p.full_name; });
    }
    const groups = { eighteen: {}, nine: {} };
    (data || []).forEach(row => {
      const type = row.rounds?.round_type;
      const g = type === 'all18' ? groups.eighteen : NINE.includes(type) ? groups.nine : null;
      if (!g) return;
      const strokes = (row.scores || []).reduce((sum, s) => sum + (s.strokes || 0), 0);
      if (!strokes) return;
      const u = g[row.user_id] ||= { user_id: row.user_id, full_name: names[row.user_id] || 'Golfer', rounds_played: 0, total_strokes: 0 };
      u.rounds_played++;
      u.total_strokes += strokes;
    });
    const rank = g => Object.values(g)
      .map(u => ({ ...u, avg_score: +(u.total_strokes / u.rounds_played).toFixed(1) }))
      .sort((a, b) => a.avg_score - b.avg_score);
    return { eighteen: rank(groups.eighteen), nine: rank(groups.nine) };
  },
};
