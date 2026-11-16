import { describe, expect, it } from 'vitest';

import hidePersonalData from '../middlewares/hide-personal-data';
import { shouldHidePersonalData, stripPersonalData } from './personal-data';

// REA-56: GET /api/communities?populate=organizers answered an anonymous caller with the
// organizers' e-mail, phone, CPF and date of birth; /api/speakers with the speakers' e-mails.

const ORGANIZER = {
  id: 1, documentId: 'u1', username: 'ana', name: 'Ana', email: 'ana@example.com', phone: '62999990000',
  cpf: '52998224725', date_of_birth: '1990-01-01',
  speaker: { id: 4, name: 'Ana', email: 'ana.speaker@example.com', avatar: { url: '/uploads/a.jpg' } },
};
const COMMUNITIES = { data: [{ id: 5, slug: 'techstars', organizers: [ORGANIZER] }], meta: {} };

const ctx = (over: any = {}) => ({
  method: 'GET',
  path: '/api/communities',
  state: { auth: { strategy: { name: 'users-permissions' }, credentials: null } },
  body: COMMUNITIES,
  ...over,
});

const run = async (c: any) => {
  await hidePersonalData()(c, async () => {});
  return c.body;
};

describe('REA-56: dados pessoais nas leituras do Strapi', () => {
  it('um anônimo não recebe e-mail, telefone, CPF nem nascimento (nem no populate)', async () => {
    const body = await run(ctx());
    const organizer = body.data[0].organizers[0];
    for (const key of ['email', 'phone', 'cpf', 'date_of_birth']) expect(organizer).not.toHaveProperty(key);
    expect(organizer.speaker).not.toHaveProperty('email');
    expect(organizer).toMatchObject({ username: 'ana', name: 'Ana', speaker: { avatar: { url: '/uploads/a.jpg' } } });
  });

  it('uma pessoa logada lendo pela API REST também não recebe os dos outros', () => {
    expect(shouldHidePersonalData(ctx({ state: { auth: { strategy: { name: 'users-permissions' }, credentials: { id: 9 } } } }))).toBe(true);
  });

  it('o BFF (token de integração) recebe tudo', async () => {
    const body = await run(ctx({ state: { auth: { strategy: { name: 'api-token' } } } }));
    expect(body.data[0].organizers[0].cpf).toBe(ORGANIZER.cpf);
  });

  it('não mexe no próprio perfil, no login nem em escritas', () => {
    expect(shouldHidePersonalData(ctx({ path: '/api/users/me' }))).toBe(false);
    expect(shouldHidePersonalData(ctx({ path: '/api/auth/email-confirmation' }))).toBe(false);
    expect(shouldHidePersonalData(ctx({ path: '/api/connect/google/callback' }))).toBe(false);
    expect(shouldHidePersonalData(ctx({ method: 'POST', path: '/api/login-code/verify' }))).toBe(false);
    expect(shouldHidePersonalData(ctx({ path: '/uploads/a.jpg' }))).toBe(false);
  });

  it('respostas que não são JSON passam intactas', async () => {
    const buffer = Buffer.from('x');
    expect(await run(ctx({ body: buffer }))).toBe(buffer);
    expect(stripPersonalData('texto')).toBe('texto');
    expect(stripPersonalData([{ email: 'a' }, { name: 'b' }])).toEqual([{}, { name: 'b' }]);
  });
});
