# Security

## Reporting a problem

Please report a vulnerability privately through GitHub's "Report a vulnerability" button on this repository's Security tab, not in a public issue. Include what you found and how to reproduce it. I will reply and agree a way to fix it before anything is made public.

## What the code does today (phase 1, step 1)

- **Every API request is authenticated.** A JWT checked against Auth0's keys in `auth0` mode, a session lookup in `local` mode. The user id comes from the credential, never from the request.
- **Local login** hashes passwords, throttles failures, sets `__Host-` Secure session cookies when served over HTTPS, and refuses state-changing requests from another origin. After first-run setup, sign-up is closed.
- **First-run setup** needs a one-time code printed in the container's log.
- **Responses** carry security headers; errors never include internal detail.
- **Secrets** are never committed. The VAPID private key lives in SSM Parameter Store, not in the repository or in OpenTofu state.

## Infrastructure

Hearthwise shares an AWS account with another app, so the deploy role is deliberately narrow. See `infra/initialSetup/README.md`. In short: it is trusted from `main` only, cannot change itself, can only create roles under a permissions boundary, and can read and write only its own state. Known limits that AWS cannot scope by name (API Gateway APIs and CloudWatch Logs resource policies) are recorded in `docs/DECISIONS.md`.

## Later steps

Invite links, household membership, multi-account local login and notifications arrive in steps 2 to 6 and get a dedicated security review before merge (`/security-review` plus a human read-through).
