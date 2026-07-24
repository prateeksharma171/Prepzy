import { api } from './axios';
import type { AdminUser, FeedbackEntry } from './types';

export async function listUsers(): Promise<AdminUser[]> {
  const res = await api.get<AdminUser[]>('/api/v1/admin/users');
  return res.data;
}

export async function getUser(id: string): Promise<AdminUser> {
  const res = await api.get<AdminUser>(`/api/v1/admin/users/${id}`);
  return res.data;
}

export async function setUserActive(id: string, isActive: boolean): Promise<AdminUser> {
  const res = await api.patch<AdminUser>(`/api/v1/admin/users/${id}/status`, { is_active: isActive });
  return res.data;
}

export async function listFeedback(): Promise<FeedbackEntry[]> {
  const res = await api.get<FeedbackEntry[]>('/api/v1/admin/feedback');
  return res.data;
}
