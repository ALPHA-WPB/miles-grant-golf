import { supabase } from '../lib/supabase';

export const authService = {
  async signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signInAsGuest() {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    return data;
  },

  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}` },
    });
    if (error) throw error;
    return data;
  },

  async signInWithApple() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}` },
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  async upsertProfile(user) {
    const { error } = await supabase.from('users').upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email.split('@')[0],
      avatar_url: user.user_metadata?.avatar_url || null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
    // Capture location via GPS (already granted for distance tracking), fallback to IP
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
            .then(r => r.json())
            .then(data => {
              const addr = data.address || {};
              supabase.from('users').update({
                location_city: addr.city || addr.town || addr.village || addr.county || null,
                location_region: addr.state || null,
                location_country: addr.country || null,
                location_lat: latitude,
                location_lng: longitude,
              }).eq('id', user.id).then(() => {});
            }).catch(() => {});
        },
        () => {
          // GPS denied — fall back to IP geolocation
          fetch('https://ipapi.co/json/').then(r => r.json()).then(data => {
            supabase.from('users').update({
              location_city: data.city || null,
              location_region: data.region || null,
              location_country: data.country_name || null,
            }).eq('id', user.id).then(() => {});
          }).catch(() => {});
        },
        { timeout: 8000, maximumAge: 3600000 }
      );
    }
  },

  async getProfile(userId) {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error) throw error;
    return data;
  },

  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
