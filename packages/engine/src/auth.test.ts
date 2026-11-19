import { describe, expect, it } from 'vitest';
import { extractRoles } from './auth.js';

describe('extractRoles', () => {
  it('reads the role from a typical /auth/me document', () => {
    expect(extractRoles({ success: true, authenticated: true, user: { id: 7, name: 'B', role: 'author', department: 'IT' } })).toEqual(['author']);
  });

  it('reads role arrays and role objects', () => {
    expect(extractRoles({ user: { roles: ['Editor', { name: 'Reviewer' }] } })).toEqual(['Editor', 'Reviewer']);
    expect(extractRoles({ data: { account: { role: { name: 'Admin', id: 1 } } } })).toEqual(['Admin']);
  });

  it('ignores tokens and unrelated fields', () => {
    expect(extractRoles({ token: 'secret', user: { email: 'a@b.c', status: 'Active' } })).toEqual([]);
  });
});
