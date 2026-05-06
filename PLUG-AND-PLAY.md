# Plug-and-Play Guide — Adding a New App

Total time: ~5 minutes.

---

## Step 1: Choose a Slug

Pick a permanent, URL-safe slug for your app. Examples:
- `hod-travel`
- `my-fitness-app`
- `recipe-tracker`

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

Add these secrets (same values for all your app repos):

| Secret | Value |
|--------|-------|
| `R2_ACCOUNT_ID` | Your Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | R2 bucket name (same as distributor) |
| `DISTRIBUTOR_WEBHOOK_SECRET` | Same value as `WEBHOOK_SECRET` in your Vercel env |
| `DISTRIBUTOR_WEBHOOK_URL` | `https://your-distributor.vercel.app/api/webhook/build-complete` |
| `EXPO_TOKEN` | Your Expo token (only for Expo/EAS apps) |

**Pro tip:** If you have many repos under the same GitHub account, use [Organization secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-an-organization) to set these once.

## Step 4: Push to Main

```bash
git add .github/workflows/build-apk.yml
git commit -m "Add APK distributor workflow"
git push origin main
```

## Step 5: Download

1. Wait for the GitHub Actions build to complete (~5-15 minutes for first build)
2. Go to your distributor dashboard (e.g., `https://apk.yourdomain.com`)
3. Sign in with Google
4. Your app appears with a download button

---

## Troubleshooting

### Build fails with "EXPO_TOKEN not set"
→ Add `EXPO_TOKEN` secret to your repo. Get it from [expo.dev/accounts/settings/access-tokens](https://expo.dev/accounts/settings/access-tokens).

### App doesn't appear on dashboard
→ Check that `DISTRIBUTOR_WEBHOOK_URL` and `DISTRIBUTOR_WEBHOOK_SECRET` are correct. The webhook notifies the dashboard about new builds.

### Download returns 404
→ The build succeeded but APK upload failed. Check the "Upload to R2" step in GitHub Actions logs. Verify R2 credentials.

### "Not authorized" on login
→ Your email is not in the `ALLOWED_EMAILS` Vercel env var. Add it (comma-separated).

---

## Unregistering an App

To remove an app from the dashboard:
1. Delete the workflow file from your app repo
2. Manually delete `apps/{slug}/` from the R2 bucket
3. Remove the entry from `apps/registry.json` in R2

The app will no longer appear on the dashboard and downloads will stop.
