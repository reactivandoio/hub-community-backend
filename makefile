start:
	pm2 start yarn --name hub-community-manager -- run start

refresh:
	git pull
	yarn
	pm2 restart hub-community-manager

update:
	git pull
	yarn
	yarn build
	pm2 restart hub-community-manager


# ---------------------------------------------------------------------------------------------
# Desenvolvimento em Docker (REA-21): só precisa do Docker na máquina. start, refresh e update,
# acima, são do deploy de produção (pm2 no servidor) e não usam nada daqui.
#   make dev     sobe MySQL + Strapi em http://localhost:1340/admin com recarga de código
#   make test    testes como no CI          make build   build como no CI
#   make lint    (este repositório não tem lint)
#   make shell   terminal dentro do container
#   make down    para tudo                  make reset   para e apaga os volumes (banco e node_modules)
# ---------------------------------------------------------------------------------------------
DEV_COMPOSE = BACKEND_NODE_VERSION=$$(cat .nvmrc) BACKEND_GIT_DIR=$$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || echo $$PWD/.git) \
	DEV_UID=$$(id -u) DEV_GID=$$(id -g) \
	docker compose -f docker-compose.dev.yml --env-file .env.dev
DEV_RUN = $(DEV_COMPOSE) run --rm --build --no-deps backend sh -c
DEV_INSTALL = yarn install --frozen-lockfile --network-timeout 600000 --silent

.PHONY: dev down reset logs shell test build lint dev-setup

dev-setup:
	@test -f .env.dev || { cp .env.dev.example .env.dev && echo "Criei o .env.dev a partir do .env.dev.example."; }
	@touch .env
	@mkdir -p node_modules

dev: dev-setup
	$(DEV_COMPOSE) up --build

down: dev-setup
	$(DEV_COMPOSE) down

reset: dev-setup
	$(DEV_COMPOSE) down -v

logs: dev-setup
	$(DEV_COMPOSE) logs -f

shell: dev-setup
	$(DEV_COMPOSE) run --rm --build --no-deps backend bash

test: dev-setup
	$(DEV_RUN) '$(DEV_INSTALL) && yarn test && bash .github/scripts/env-scripts.test.sh'

# Strapi em produção usa NODE_ENV=production no build do admin (igual ao CI).
build: dev-setup
	$(DEV_RUN) '$(DEV_INSTALL) && NODE_ENV=production yarn build'

lint:
	@echo "Este repositório não tem lint configurado (o CI também não roda lint aqui)."
