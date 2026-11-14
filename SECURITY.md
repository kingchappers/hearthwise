# Security

## Reporting a problem

Please report a vulnerability privately through GitHub's "Report a vulnerability" button on this repository's Security tab, not in a public issue. Include what you found and how to reproduce it. I will reply and agree a way to fix it before anything is made public.

## What the code does today (phase 1, step 2)

- **Every API request is authenticated.** A JWT checked against Auth0's keys in `auth0` mode, a session lookup in `local` mode. The user id comes from the credential, never from the request.
- **Local login** keeps one account per email (case and spacing ignored), hashes passwords, throttles failures per email, sets `__Host-` Secure session cookies when served over HTTPS, and refuses state-changing requests from another origin. An unknown email and a wrong password get the same answer. After first-run setup, the only way to make an account is an invite link.
- **Households.** Every household route goes through `withHousehold`, which finds the household from the caller's own membership record; a household id in a request is never read. A household holds two people at most.
- **Invite links** carry 32 random bytes in the address fragment (so they stay out of logs). Only the SHA-256 is stored. A link works once, expires after 7 days, and can be revoked. A link of the wrong shape is answered as expired before anything is looked up, and an invited sign-up that keeps naming emails that already have accounts burns the link, so a link cannot be used to list accounts.
- **Alerts.** Sign-ups, new households, accepted invites and member removals are logged and sent to an SNS topic. Messages carry ids and the event type, never emails or names, and a failed alert never fails the request. The Auth0 first-login Action publishes with an access key that can only publish to that topic; the key is made by hand and never stored in OpenTofu state.
- **First-run setup** needs a one-time code printed in the container's log.
- **Responses** carry security headers; errors never include internal detail.
- **Secrets** are never committed. The VAPID private key lives in SSM Parameter Store, not in the repository or in OpenTofu state.

- **Writes are replay-safe.** Every household write carries a client-made `mutationId`. It is stored in the same transaction as the write, with an 8-day expiry, so a retry (a flaky connection, a reload) returns the first answer and writes nothing, and a retried delete can never undo a later restore.
- **Whose task it is.** A change to who has a task, when it is due or how it repeats, a delete, and a restore need the other person's say (a proposal) when the task is theirs or is for both. The server decides this from the stored task, never from the request. A task cannot be given to someone who is not in the household yet.
- **Tombstones are final for edits.** An edit to a deleted task is refused (410); only a restore brings it back.

## Infrastructure

Hearthwise shares an AWS account with another app, so the deploy role is deliberately narrow. See `infra/initialSetup/README.md`. In short: it is trusted from `main` only, cannot change itself, can only create roles under a permissions boundary, and can read and write only its own state. Known limits that AWS cannot scope by name (API Gateway APIs and CloudWatch Logs resource policies) are recorded in `docs/DECISIONS.md`.

## Later steps

Notifications arrive in step 6 and get a dedicated security review before merge (`/security-review` plus a human read-through), as step 2 did.
