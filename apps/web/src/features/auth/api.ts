import { apiRequest } from '@/lib/api';
import type { authUserResponseSchema } from '@atlas/schemas';
import { type LoginInput, type RegisterInput } from '@atlas/schemas';

export const authApi = {
  me: () => apiRequest<typeof authUserResponseSchema>('/auth/me'),
  register: (input: RegisterInput) =>
    apiRequest<typeof authUserResponseSchema>('/auth/register', { method: 'POST', body: input }),
  login: (input: LoginInput) =>
    apiRequest<typeof authUserResponseSchema>('/auth/login', { method: 'POST', body: input }),
  logout: () => apiRequest<null>('/auth/logout', { method: 'POST' }),
};
