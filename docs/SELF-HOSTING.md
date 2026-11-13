# Self-hosting Hearthwise

Hearthwise runs as one container: a Node server, the built app, and Caddy for HTTPS, with all data in a single SQLite file. It uses the same code as the AWS deployment. Sign-in is Hearthwise's own email and password (`AUTH_MODE=local`), so it needs no Auth0 account.

**What works today (phase 1, step 2):** first-run setup, several accounts, households of two with invite links, sessions, backups and the store command line tool. Tasks and the shopping list arrive in steps 3 to 7 (`docs/ROADMAP.md`); upgrading is a new image tag and a restart.

## What you need

- A machine that runs Docker and Docker Compose.
- For built-in HTTPS: a domain name pointing at the machine, and ports 80 and 443 open. Otherwise: a reverse proxy you control that provides HTTPS.

## Run it with built-in HTTPS

1. Copy `compose.example.yml` to `compose.yml`.
2. Set `TLS_DOMAIN` to your hostname and `TLS_EMAIL` to your email address (used only by Caddy for certificate notices).
3. Start it: `docker compose up -d`.

Caddy gets and renews the certificate itself. Cookies are marked Secure and the proxy headers are trusted, because Caddy is the proxy.

## Run it behind your own proxy

Use `compose.plain.example.yml`. The app speaks plain HTTP on port 8080, published on the loopback address only. Set `APP_ORIGIN` to the public `https://` address, and set `TRUST_PROXY` to `true` only when a proxy you control sets the `X-Forwarded-*` headers and nothing else can reach the port. Never publish the port to the internet.

On a home network with no HTTPS proxy, delete the `APP_ORIGIN` and `TRUST_PROXY` lines: cookies are then not marked Secure. If you keep them, every sign-in and setup request is refused with a 403, because the browser's origin will not match the address you set.

## First-run setup

A fresh install has no account. The first time the container starts it prints a one-time setup code in its log, so a stranger who finds the address first cannot claim the install:

```bash
docker compose logs hearthwise | grep "Setup code"
```

The code is also saved as `SETUP_CODE.txt` in the data folder until it is used. Open the app, enter the code, your email, a name and a password. The file is removed once setup completes. After that, setup is closed and there is no open sign-up.

## Accounts, households and invites

The first account makes a household (a name and a time zone). A household holds at most two people. To add the second person, open Settings, choose **Create invite link**, and send them the link. The link:

- works once, and expires after 7 days;
- carries its secret after the `#`, so it never appears in a server log;
- is shown only when you create it (copy it then; you can revoke an open invite from the same place and make a new one).

The invited person opens the link, chooses an email, a name and a password, and lands in your household. That is the only way to add an account after first-run setup. The household's creator can remove the other person from Settings; their account stays, and they can be invited again.

Accounts made by step 1 are not carried over (the keys changed). If you ran step 1 with data you want to keep, back up the database, then delete `hearthwise.sqlite` and set up again.

## Settings

All settings are environment variables on the container.

| Variable | Default | What it does |
|---|---|---|
| `TLS_DOMAIN` | unset | Turns on built-in HTTPS for this hostname. Also sets `APP_ORIGIN`, `TRUST_PROXY` and Secure cookies. |
| `TLS_EMAIL` | unset | Contact address for the certificate. |
| `APP_ORIGIN` | derived from `TLS_DOMAIN` | The public address, such as `https://hearth.example.com` (no path). Used for the Origin check and Secure cookies. |
| `TRUST_PROXY` | on with `TLS_DOMAIN`, else off | Believe `X-Forwarded-*` headers. Turn on only behind a proxy you control. |
| `COOKIE_SECURE` | on when `APP_ORIGIN` is `https:` | Force cookies Secure on or off. |
| `PORT` | `8080` | Port for the plain HTTP server. |
| `DATA_DIR` | `/data` | Where `hearthwise.sqlite` and the setup code file live. Keep it on a volume. |
| `BACKUP_DIR` | `/data/backups` | Where daily backups are written. |
| `BACKUP_HOUR` | `3` | The first hourly check at or after this hour takes the daily backup, in the container's time zone (`TZ`, default UTC). |
| `BACKUP_KEEP` | `7` | Newest backups kept. `0` turns backups off. |

The container refuses to start, and lists every problem, if a setting is invalid.

## Backups

The container takes a backup when it starts and once a day after `BACKUP_HOUR`, and keeps the newest `BACKUP_KEEP`. Each is a consistent copy of the database named `hearthwise-YYYYMMDD-HHMMSS.sqlite`, readable only by the app user.

Only files with that exact name are ever listed or deleted, so other files in the folder are left alone.

### Check your backups are working

Do this once after the first start, and again after any change to the volumes:

```bash
docker compose exec hearthwise ls -l /data/backups
```

You should see at least one `hearthwise-….sqlite` file, owned by uid `10001` with mode `-rw-------`. An empty folder, or a permissions error in `docker compose logs hearthwise`, means backups are not being written. The image creates `/data/backups` owned by the app user, so a new named volume mounted there works; a folder you bind-mount yourself must be owned by uid `10001`.

A backup on the same disk protects against a bad upgrade, not against losing the disk. Copy the backups volume somewhere else regularly.

### Restoring

1. Stop the container: `docker compose stop`.
2. Replace `hearthwise.sqlite` in the data volume with the backup you want, and delete `hearthwise.sqlite-wal` and `hearthwise.sqlite-shm` if they are there.
3. Start it: `docker compose up -d`.

To take a one-off copy by hand: `docker compose exec -e STORE=sqlite hearthwise node build/store-cli/store-cli.js backup --out /data/manual-backup.sqlite`. It never overwrites an existing file.

## Forgot your password

There is no "forgot password" email, and nothing in the app can reset a password: that would let anyone who reaches the page take over the install. Resetting is something only the person who runs the server can do:

```bash
docker compose exec -it -e STORE=sqlite hearthwise node build/store-cli/store-cli.js reset-password you@example.com
```

Give the email address of the account. It asks for the new password (the password is never read from the command line or the environment), sets it, ends that person's signed-in sessions and clears their sign-in lock-out. Nobody else is affected, and it does not reopen first-run setup.

## Updating

Pull the new image and restart: `docker compose pull && docker compose up -d`. Take a backup first (see above). The image is also published with a version tag, so you can pin one in `compose.yml`.

## Where things are

| What | Where |
|---|---|
| Database | `DATA_DIR/hearthwise.sqlite` (with `-wal` and `-shm` files while running) |
| Backups | `BACKUP_DIR` |
| Setup code | `DATA_DIR/SETUP_CODE.txt`, until used |
| Logs | `docker compose logs hearthwise` |
