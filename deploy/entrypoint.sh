#!/bin/sh
# Apply database migrations, then start the server. A failed migration stops the container, so a bad release
# never runs against a half-migrated database.
set -eu
cd /srv/vesk/apps/web
npm run migrate
exec npm start
