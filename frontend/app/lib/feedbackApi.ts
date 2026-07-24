import { api } from './axios';

export async function submitFeedback(message: string): Promise<void> {
  await api.post('/api/v1/feedback', { message });
}
