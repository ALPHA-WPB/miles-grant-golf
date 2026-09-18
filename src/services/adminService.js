import { supabase } from '../lib/supabase';

const ADMIN_EMAILS = ['rpdwpb@gmail.com', 'richard@wpbit.com'];

export function isAdmin(user) {
  return user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export async function captureLoginLocation(userId) {
  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    await supabase.from('users').update({
      location_city: data.city || null,
      location_region: data.region || null,
      location_country: data.country_name || null,
      last_seen_at: new Date().toISOString(),
    }).eq('id', userId);
  } catch (_) {}
}

export async function getAdminStats() {
  const [usersRes, roundsRes, recentRes, locationsRes] = await Promise.all([
    supabase.from('users').select('id, created_at', { count: 'exact' }),
    supabase.from('rounds').select('id, created_at, status', { count: 'exact' }),
    supabase.from('users').select('id, full_name, email, created_at, location_city, location_country, last_seen_at').order('created_at', { ascending: true }),
    supabase.from('users').select('id, full_name, location_city, location_country, location_region, location_lat, location_lng'),
  ]);

  const users = usersRes.data || [];
  const rounds = roundsRes.data || [];
  const recentUsers = recentRes.data || [];
  const allLocations = locationsRes.data || [];
  const userPins = allLocations.filter(u => u.location_lat && u.location_lng);

  // Group by country
  const byCountry = {};
  allLocations.forEach(u => {
    const key = u.location_country || 'Unknown';
    byCountry[key] = (byCountry[key] || 0) + 1;
  });

  // Group by city
  const byCity = {};
  allLocations.forEach(u => {
    if (u.location_city) {
      const key = `${u.location_city}, ${u.location_country || ''}`.trim();
      byCity[key] = (byCity[key] || 0) + 1;
    }
  });

  // Sign-ups per week (last 8 weeks)
  const now = new Date();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(now);
    start.setDate(start.getDate() - (7 * (7 - i)));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { label: `W${i + 1}`, start, end, count: 0 };
  });
  users.forEach(u => {
    const d = new Date(u.created_at);
    weeks.forEach(w => { if (d >= w.start && d < w.end) w.count++; });
  });

  const activeRounds = rounds.filter(r => r.status === 'active').length;

  return {
    totalUsers: usersRes.count ?? users.length,
    totalRounds: roundsRes.count ?? rounds.length,
    activeRounds,
    byCountry: Object.entries(byCountry).sort((a, b) => b[1] - a[1]),
    byCity: Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 10),
    recentUsers,
    weeklySignups: weeks,
    userPins,
  };
}
