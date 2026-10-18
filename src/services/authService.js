import { api } from '../lib/api';

export const authService = {
  async getCurrentUser() {
    try {
      return (await api('/api/me')).user;
    } catch {
      return null;
    }
  },
  signInWithGoogle() {
    window.location.href = '/api/auth/google';
  },
  signInWithApple() {
    window.location.href = '/api/auth/apple';
  },
  async signOut() {
    await api('/api/auth/signout', { method: 'POST' }).catch(() => {});
    window.location.replace('/');
  },
};
