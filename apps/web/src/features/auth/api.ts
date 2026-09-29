import { apiRequest } from '@/lib/api';
import { authUserResponseSchema, type LoginInput, type RegisterInput } from '@atlas/schemas';

export const authApi = {
  me: () => apiRequest('/auth/me', authUserResponseSchema),
  register: (input: RegisterInput) =>
    apiRequest('/auth/register', authUserResponseSchema, { method: 'POST', body: input }),
  login: (input: LoginInput) =>
    apiRequest('/auth/login', authUserResponseSchema, { method: 'POST', body: input }),
  logout: () => apiRequest('/auth/logout', null, { method: 'POST' }),
};
