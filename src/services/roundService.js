import { api } from '../lib/api';

export const roundService = {
  createRound(teeSelection, roundType) {
    return api('/api/rounds', { method: 'POST', body: { teeSelection, roundType } });
  },
  upsertScore(roundPlayerId, holeNumber, strokes) {
    return api('/api/scores', { method: 'PUT', body: { roundPlayerId, holeNumber, strokes } });
  },
  finalizeRound(roundId, roundType) {
    return api(`/api/rounds/${roundId}/finalize`, { method: 'POST', body: { roundType } });
  },
  getRoundHistory() {
    return api('/api/rounds/history').catch(() => []);
  },
};
