#!/usr/bin/env bash
# Checks the container set-up end to end with throwaway values: lints the compose file, builds the real image, and starts
# the real stack (app and Postgres) under the project name qerr-local, so every container is named
# qerr-local-*. It checks that the app runs as a non-root user, that Chromium starts, that the engine renders a
# text page, that /healthz answers 200, that the login page loads and that the bootstrap admin invite is logged once.
# Nothing from the repository's .env is passed in, and everything it creates is removed at the end.
# Needs Docker running. Usage: deploy/check.sh
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
project="qerr-local"
compose=(docker compose -p "$project" -f "$repo/deploy/docker-compose.yml")
made_network=""
app="$project-app-1"

# Throwaway values for this run only. The admin address is a reserved example domain.
export POSTGRES_PASSWORD="check-$(openssl rand -hex 8)"
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
export APP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
export BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
export APP_URL="http://localhost:3000"

cleanup() {
  "${compose[@]}" down -v >/dev/null 2>&1 || true
  [ -n "$made_network" ] && docker network rm dokploy-network >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== 1. compose file, with throwaway values"
"${compose[@]}" config --quiet
echo "ok"
echo "== 1b. compose file refuses to start without the required values"
if env -u POSTGRES_PASSWORD -u BETTER_AUTH_SECRET -u APP_ENCRYPTION_KEY docker compose -f "$repo/deploy/docker-compose.yml" config --quiet 2>/dev/null; then
  echo "FAIL: config passed with no environment"; exit 1
fi
echo "ok"

# The compose file joins Dokploy's external network; locally it is created for the run and removed afterwards.
if ! docker network inspect dokploy-network >/dev/null 2>&1; then docker network create dokploy-network >/dev/null; made_network=1; fi

echo "== 2. build and start the stack"
"${compose[@]}" up -d --build

echo "== 3. runs as a non-root user"
docker exec "$app" id -u | grep -vx 0

echo "== 4. Chromium starts headless"
docker exec "$app" /usr/local/bin/chromium-container --version

echo "== 5. the engine renders one text page (the render job's own entry point)"
docker exec -w /srv/qerr "$app" node --input-type=module -e '
import { renderDesignBlock } from "./packages/engine/lib/design-render.mjs";
const r = await renderDesignBlock({ design: { template: "text", headline: "Save together,\n*see every step.*", sub: "Container render test." }, postId: "check", outDir: "out" });
if (!r.ok) { console.error(r.error); process.exit(1); }
for (const f of r.files) console.log(`${f.file} ${f.w}x${f.h}`);
'
docker exec "$app" sh -c 'ls -l /srv/qerr/out/check-feed.jpg && head -c 3 /srv/qerr/out/check-feed.jpg | od -An -tx1'

echo "== 6. migrations, /healthz and the health check"
s=""
for _ in $(seq 1 40); do
  s="$(docker inspect -f '{{.State.Health.Status}}' "$app")"; [ "$s" = healthy ] && break; sleep 3
done
echo "health: $s"
[ "$s" = healthy ]
docker exec "$app" node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{console.log('healthz',r.status);process.exit(r.status===200?0:1)})"

echo "== 7. the login page loads"
docker exec "$app" node -e "fetch('http://127.0.0.1:3000/login').then(r=>{console.log('login',r.status);process.exit(r.status===200?0:1)})"

echo "== 8. the bootstrap admin invite is logged once (the link itself is not shown here)"
n="$(docker logs "$app" 2>&1 | grep -c bootstrap.admin_invite || true)"
echo "invite lines: $n"
[ "$n" = 1 ]
echo "ALL CHECKS PASSED"
