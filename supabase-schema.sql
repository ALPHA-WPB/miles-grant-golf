-- Run this entire file in the Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/myawiykhunjtldxnlsrr/sql/new

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own"   ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = id);
-- Allow reading other users' names (for leaderboard/friends)
CREATE POLICY "users_read_all_names" ON users FOR SELECT USING (true);

-- ROUNDS
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'in_progress',
  round_type TEXT DEFAULT 'all18',
  join_code TEXT UNIQUE,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rounds_creator_all" ON rounds FOR ALL USING (creator_id = auth.uid());
CREATE POLICY "rounds_players_read" ON rounds FOR SELECT USING (
  EXISTS (SELECT 1 FROM round_players WHERE round_players.round_id = rounds.id AND round_players.user_id = auth.uid())
);

-- ROUND_PLAYERS
CREATE TABLE IF NOT EXISTS round_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID REFERENCES rounds(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  tee_selection TEXT DEFAULT 'White',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, user_id)
);
ALTER TABLE round_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rp_read_own_rounds" ON round_players FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (SELECT 1 FROM rounds WHERE rounds.id = round_players.round_id AND rounds.creator_id = auth.uid())
);
CREATE POLICY "rp_insert_own" ON round_players FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "rp_read_all_in_round" ON round_players FOR SELECT USING (
  EXISTS (SELECT 1 FROM round_players rp2 WHERE rp2.round_id = round_players.round_id AND rp2.user_id = auth.uid())
);

-- SCORES
CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_player_id UUID REFERENCES round_players(id) ON DELETE CASCADE,
  hole_number INT,
  strokes INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_player_id, hole_number)
);
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores_own_round" ON scores FOR ALL USING (
  EXISTS (
    SELECT 1 FROM round_players rp WHERE rp.id = scores.round_player_id AND rp.user_id = auth.uid()
  )
);
CREATE POLICY "scores_read_same_round" ON scores FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM round_players rp
    JOIN round_players my ON my.round_id = rp.round_id AND my.user_id = auth.uid()
    WHERE rp.id = scores.round_player_id
  )
);

-- FRIENDS
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES users(id),
  receiver_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, receiver_id)
);
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friends_own" ON friends FOR ALL USING (requester_id = auth.uid() OR receiver_id = auth.uid());

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT,
  related_user_id UUID REFERENCES users(id),
  round_id UUID REFERENCES rounds(id),
  title TEXT,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifs_own" ON notifications FOR ALL USING (user_id = auth.uid());

-- Enable Realtime for live score sync
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE round_players;
