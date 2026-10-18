import { api } from '../lib/api';

export const leaderboardService = {
  getClubLeaderboard() {
    return api('/api/leaderboard');
  },
};
