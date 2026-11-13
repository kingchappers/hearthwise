# Auth0 setup for the deployed site

The AWS deployment signs people in with Auth0. Nothing in the repository can create these settings: you make them once in the Auth0 dashboard. Each one below says what you see if it is missing.

The self-hosted container does not use Auth0.

## 1. The API

Auth0 dashboard, Applications, APIs, Create API.

- **Identifier:** the same value as the `auth0_audience` variable and `VITE_AUTH0_AUDIENCE` (for example `https://hearthwise-api`). It is a name, not a web address that has to exist.
- **Signing algorithm:** RS256.
- **Allow Offline Access:** on. The app asks for `offline_access` so it can renew the sign-in without a pop-up. Without it, sign-in fails or the session ends within a day.

## 2. The single-page application

Applications, Applications, Create Application, **Single Page Web Applications**.

- **Application Properties, Grant Types** (Advanced Settings): include **Authorization Code** and **Refresh Token**.
- **Refresh Token Rotation:** on. The app keeps its tokens in the browser, so rotation limits what a stolen one is worth.
- **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins:** each includes the site's address (for example `https://hearth.example.com`), with no path and no trailing slash. Add `http://localhost:5173` only for local development.

## 3. Give the application access to the API

This is the step that is easy to miss. APIs, your API, **Application Access** tab, your application, **User Access: Authorized**.

## 4. The first-login Action

Optional, but it is how you hear that someone new has signed in. Install `infra/auth0/first-login.js` as described in the comment at its top. It needs the `alerts_topic_arn` output of the main stack and an access key for the `hearthwise-auth0-alerts` IAM user, which you create by hand in the AWS console (OpenTofu never creates the key). AWS also emails a confirmation link to the alert address: until you click it, no alert is delivered.

## If sign-in does not work

| Symptom | Cause | Fix |
|---|---|---|
| Sign in returns you to the home page with `Client "<id>" is not authorized to access resource server "<audience>"` in the address (the app shows this and points here; the message includes the phrase `is not authorized to access resource server`) | The application has no user access to the API | Section 3 |
| Sign-in loops, or ends after a short time | Allow Offline Access is off, or Refresh Token is not a grant type | Sections 1 and 2 |
| `Callback URL mismatch` on the Auth0 page | The site's address is not in Allowed Callback URLs | Section 2 |
| Sign-out leaves you on an Auth0 error page | The site's address is not in Allowed Logout URLs | Section 2 |
| Signed in, but every request is refused as unauthorized | The API identifier differs from `auth0_audience` | Section 1 |
