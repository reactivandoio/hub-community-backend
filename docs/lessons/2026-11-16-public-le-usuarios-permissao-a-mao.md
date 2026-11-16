---
symptom: "GET /api/users (e /api/participants, /api/sw-forms, /api/communities?populate=organizers) responde 200 sem login, com e-mail, telefone, CPF e nascimento"
tags: [seguranca, lgpd, strapi, permissoes, users-permissions, populate]
evidence: fixed
card: REA-56
agent: claude
date: 2026-11-16
---
## Causa

As permissões do papel Public ficam no banco. `ensureRoles` (src/roles) só acrescentava permissões e
nunca removia, então um `find` de `user`, `participant` e `sw-form` concedido à mão no painel ficou
valendo em produção. No Strapi 5 o populate de uma relação só sai se o papel tiver o `find` do alvo
(`removeRestrictedRelations`), e por isso o mesmo `user.find` também abria `community.organizers`,
`event.managers`, `speaker.users_permissions_user`, `team.members`. Além disso, `speaker.email` é
campo próprio de uma coleção pública.

## Correção

- `revoke` por papel em `src/roles/definitions.ts`: `PUBLIC_REVOKED_ACTIONS` (leituras de usuários,
  participantes, sw-forms e das coleções de registros de pessoas) e `PERSONAL_DATA_READS` para
  authenticated e os papéis do admin. `ensureRoles` remove essas permissões a cada start, mesmo as
  dadas à mão.
- Middleware `global::hide-personal-data` (regra em `src/utils/personal-data.ts`): GET em `/api/*` que
  não vem do token de integração sai sem `email`, `phone`, `cpf`, `date_of_birth`… em qualquer nível.
  Ficam de fora `/api/users/me` e as rotas de auth. A regra fica em `src/utils` porque o Strapi
  carrega todo arquivo de `src/middlewares` como middleware (um teste ali seria carregado).
- O BFF tem de ler usuários com o token de integração antes deste deploy (ordem: BFF primeiro), senão
  `/users/<username>` quebra.

## Como conferir

Sem login: `curl -s -o /dev/null -w '%{http_code}' https://manager.hubcommunity.io/api/users` → 403;
`/api/communities?populate[0]=organizers` sem a chave `organizers` e sem `email`. No log do start:
`[roles] Revoked public permission: plugin::users-permissions.user.find` (só na primeira vez).
Testes: `src/roles/ensure-roles.test.ts`, `src/utils/personal-data.test.ts`.
