#!/usr/bin/env bash
# Persistent “kick the tires” stack: same docker-compose.yml + env overlay pattern as readiness
# (tests/docker-compose.readiness.yml), but `compose up -d` only — no test runner, no §13 trigger flow.
#
# Binds <#1487579255616573533> → default primary session URN (agent id `main`) unless SHOGGOTH_DISCORD_ROUTES is set in `.env.shoggoth.local`.
# Prerequisites: Docker, `.env.shoggoth.local` (copy `.env.shoggoth.example`).
# Kick-tires compose attaches to external `proxy` (script creates the network if needed). Optional third compose file: SHOGGOTH_EXTRA_COMPOSE_FILE=…
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Same fallback as tests/readiness-compose.test.mjs: supplementary `docker` group may require `sg docker`.
docker_cli() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    local quoted="docker"
    for a in "$@"; do
      quoted+=" $(printf '%q' "$a")"
    done
    sg docker -c "$quoted"
  fi
}

if ! docker info >/dev/null 2>&1 && ! sg docker -c "docker info" >/dev/null 2>&1; then
  echo "docker not available (tried docker and sg docker)" >&2
  exit 1
fi

ENV_LOCAL="$ROOT/.env.shoggoth.local"
if [[ -f "$ENV_LOCAL" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_LOCAL"
  set +a
fi

if [[ -z "${DISCORD_BOT_TOKEN:-}" ]]; then
  echo "DISCORD_BOT_TOKEN is unset: copy $ROOT/.env.shoggoth.example to .env.shoggoth.local and set the Shoggoth bot token" >&2
  exit 1
fi

# Default guild channel <#1487579255616573533>: session URN leaf must match channel snowflake (Discord bridge rule).
KICK_TIRES_DEFAULT_GUILD_ID="${KICK_TIRES_DEFAULT_GUILD_ID:-695327822306345040}"
KICK_TIRES_DEFAULT_CHANNEL_ID="${KICK_TIRES_DEFAULT_CHANNEL_ID:-1487579255616573533}"
if [[ -z "${SHOGGOTH_DISCORD_ROUTES:-}" ]]; then
  aid="${SHOGGOTH_AGENT_ID:-main}"
  export SHOGGOTH_DISCORD_ROUTES="[{\"guildId\":\"${KICK_TIRES_DEFAULT_GUILD_ID}\",\"channelId\":\"${KICK_TIRES_DEFAULT_CHANNEL_ID}\",\"sessionId\":\"agent:${aid}:discord:${KICK_TIRES_DEFAULT_CHANNEL_ID}\"}]"
fi
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-shoggoth-kick}"

# Kick-tires attaches to external `proxy` (see docker-compose.kick-tires.yml) for LM at e.g. http://kiro:8000.
if ! docker_cli network inspect proxy >/dev/null 2>&1; then
  echo "creating external Docker network 'proxy' (kick-tires local LM bridge)" >&2
  docker_cli network create proxy
fi

compose_files=( -f docker-compose.yml -f docker-compose.kick-tires.yml )
if [[ -n "${SHOGGOTH_EXTRA_COMPOSE_FILE:-}" ]]; then
  extra="$SHOGGOTH_EXTRA_COMPOSE_FILE"
  [[ "$extra" = /* ]] || extra="$ROOT/$extra"
  compose_files+=( -f "$extra" )
fi

docker_cli compose "${compose_files[@]}" up -d --build

docker_cli compose "${compose_files[@]}" exec -T -u shoggoth -w /app shoggoth \
  node --import tsx/esm scripts/bootstrap-main-session.mjs

echo ""
aid_echo="${SHOGGOTH_AGENT_ID:-main}"
echo "Shoggoth is up (project ${COMPOSE_PROJECT_NAME}). Default route: agent:${aid_echo}:discord:${KICK_TIRES_DEFAULT_CHANNEL_ID} → <#${KICK_TIRES_DEFAULT_CHANNEL_ID}> (workspace …/workspaces/${aid_echo})."
echo "Default SHOGGOTH_OPERATOR_TOKEN=${SHOGGOTH_OPERATOR_TOKEN:-shoggoth-kick-operator-token} (override before up if you use control CLI)."
echo "Logs: docker compose ${compose_files[*]} logs -f shoggoth"
echo "       (if plain docker fails: sg docker -c 'docker compose ${compose_files[*]} logs -f shoggoth')"
echo "Stop: docker compose ${compose_files[*]} down"
