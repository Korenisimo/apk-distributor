# Plug-and-Play Guide — Adding a New App

Total time: ~5 minutes.

---

## Prerequisites

- A React Native / Expo app repo under the `Korenisimo` GitHub account
- An Expo access token (for Expo/EAS apps)

---

## Step 1: Choose a Slug

Pick a permanent, URL-safe slug for your app. Examples:
- `hod-travel`
- `clean-time`
- `rom-evolve`

Rules: lowercase, hyphens only, no spaces, no special chars.

## Step 2: Add the Workflow File

In your app repo, create `.github/workflows/build-apk.yml`:

```yaml
name: Build & Distribute APK

on:
  push:
    branches: [main]
    paths:
      - "src/**"
      - "app/**"
      - "app.json"
      - "eas.json"
      - "package.json"
  workflow_dispatch:

jobs:
  build:
    uses: Korenisimo/apk-distributor/.github/workflows/build-and-upload.yml@main
    with:
      app-slug: "YOUR-SLUG-HERE"    # ← change this
      app-name: "Your App Name"     # ← change this
    secrets:
      EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
      R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
      R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
      R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
      R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
      DISTRIBUTOR_WEBHOOK_SECRET: ${{ secrets.DISTRIBUTOR_WEBHOOK_SECRET }}
      DISTRIBUTOR_WEBHOOK_URL: ${{ secrets.DISTRIBUTOR_WEBHOOK_URL }}
```

### Not using Expo/EAS?

If your app uses plain Gradle (no Expo), add a custom `build-command`:

```yaml
    with:
      app-slug: "my-app"
      app-name: "My App"
      build-command: |
        cd android
        ./gradlew assembleRelease
        cp app/build/outputs/apk/release/app-release.apk ../app.apk
```

## Step 3: Add GitHub Secrets

Go to your app repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

### Shared secrets (SAME for every app repo)

These 6 secrets are identical across all app repos. Copy them exactly.

| Secret | Value |
|--------|-------|
| `R2_ACCOUNT_ID` | `ee9714c4bade2c83d3dca2d5dae214dc` |
| `R2_ACCESS_KEY_ID` | `d8f479c4224bacb7980749eed203957e` |
| `R2_SECRET_ACCESS_KEY` | `f5c2490ff76f15e85748b9899a6ea12cb27369731a18d57545935e3f4d9cd79b` |
| `R2_BUCKET_NAME` | `apk-distributor` |
| `DISTRIBUTOR_WEBHOOK_SECRET` | `[ask repo owner — stored in Vercel env vars as WEBHOOK_SECRET]` |
| `DISTRIBUTOR_WEBHOOK_URL` | `https://apk-distributor.vercel.app/api/webhook/build-complete` |

### App-specific secrets

| Secret | Value |
|--------|-------|
| `EXPO_TOKEN` | Your Expo access token (get from [expo.dev/accounts/settings/access-tokens](https://expo.dev/accounts/settings/access-tokens)). Only needed for Expo/EAS apps. |

> **⚠️ CRITICAL: R2_BUCKET_NAME must be `apk-distributor`.**
> Do NOT use any other bucket name. The distributor dashboard reads from this bucket.
> Using a different bucket (e.g. `hod-travel-journal`) will cause your app to upload successfully but never appear on the dashboard.

## Native App Access Control

The distributor mobile app (APK Distributor) authenticates via `MOBILE_API_KEY` — a shared API key baked into the app at build time. This means:

- **Anyone who installs the APK can use the native app** — there is no per-user login on native
- Access is controlled by who you distribute the APK to
- The `ALLOWED_EMAILS` whitelist only applies to the **web dashboard** (Google OAuth login)

If you need per-user access control on native, you would need to add a login screen to the mobile app.

## Step 4: Push to Main

```bash
git add .github/workflows/build-apk.yml
git commit -m "Add APK distributor workflow"
git push origin main
```

Or trigger manually from GitHub Actions → "Run workflow".

## Step 5: Download

1. Wait for the GitHub Actions build to complete (~10-15 minutes)
2. Go to [apk-distributor.vercel.app](https://apk-distributor.vercel.app)
3. Sign in with Google
4. Your app appears with a download button

---

## Troubleshooting

### App shows "Registered but no build yet"

**Most common cause:** `R2_BUCKET_NAME` is set to the wrong bucket. It MUST be `apk-distributor`. Check your repo's GitHub secrets.

What happens: The APK uploads to the wrong R2 bucket, but the webhook registers the app in the correct bucket's registry. Result: app appears but has no downloadable build.

### Build fails with "EXPO_TOKEN not set"

→ Add `EXPO_TOKEN` secret to your repo. Get it from [expo.dev/accounts/settings/access-tokens](https://expo.dev/accounts/settings/access-tokens).

### Build succeeds but app doesn't appear on dashboard at all

→ The webhook failed. Check that:
1. `DISTRIBUTOR_WEBHOOK_URL` is exactly `https://apk-distributor.vercel.app/api/webhook/build-complete`
2. `DISTRIBUTOR_WEBHOOK_SECRET` matches `WEBHOOK_SECRET` on the Vercel deployment. Ask the repo owner for the current value — it is stored as a sensitive env var in Vercel and should never be committed to docs.

You can verify by checking the "Upload to R2 & notify distributor" step in the GitHub Actions log — look for `✅ Webhook notified (200)` or `⚠️ Webhook notification failed`.

### Download returns 404

→ The R2 upload failed. Check the "Upload to R2" step in GitHub Actions logs. Verify R2 credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) have write access to the `apk-distributor` bucket.

### "Not authorized" on login

→ Your email is not in the `ALLOWED_EMAILS` Vercel env var. Add it (comma-separated) in Vercel → apk-distributor → Settings → Environment Variables.

---

## Unregistering an App

To remove an app from the dashboard:
1. Delete the workflow file from your app repo
2. Manually delete `apps/{slug}/` from the `apk-distributor` R2 bucket
3. Remove the entry from `apps/registry.json` in R2

The app will no longer appear on the dashboard and downloads will stop.

---

## Architecture Reference

```
App Repo (GitHub Actions)
  ├── Build APK via EAS local build
  ├── Upload APK + metadata to R2 bucket "apk-distributor"
  └── POST webhook to Vercel → registers app in registry.json

Vercel (apk-distributor.vercel.app)
  ├── Web dashboard — Google OAuth, gated by ALLOWED_EMAILS whitelist
  │   ├── Reads registry.json from R2 → lists apps
  │   ├── Reads apps/{slug}/latest.json → shows version/size/date
  │   └── Generates signed download URLs for APK files
  └── Mobile API — Bearer MOBILE_API_KEY (no per-user auth)
      ├── GET /api/mobile/apps → lists all apps with metadata
      └── GET /api/mobile/download/[slug] → returns signed R2 download URL
```

Both the GitHub Actions workflow AND the Vercel dashboard must point to the **same R2 bucket** (`apk-distributor`). If they don't match, uploads go to one place and reads happen from another.
