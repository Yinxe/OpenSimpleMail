#!/bin/sh
set -e

# The image starts as root only to take ownership of the data directory, then
# drops to the unprivileged `node` user for the actual process. A bind-mounted
# ./data is created by Docker as root, and SQLite cannot open the database
# without write access to that directory.
if [ "$(id -u)" = "0" ]; then
  data_dir="$(dirname "${DATABASE_PATH:-/app/data/open-simple-mail.db}")"
  mkdir -p "$data_dir"

  # Recurse only when the mount point itself is not owned by `node` yet, so a
  # restart does not walk a large attachment cache for nothing.
  if [ "$(stat -c '%u' "$data_dir")" != "$(id -u node)" ]; then
    echo "entrypoint: taking ownership of $data_dir for user node" >&2
    chown -R node:node "$data_dir"
  fi

  exec gosu node "$@"
fi

exec "$@"
