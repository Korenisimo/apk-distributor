# LLM Instructions — Building & Distributing New Apps

This document is for AI coding agents (Claude, Gemini, Cursor, Copilot, etc.) assisting with creating new apps that plug into this APK distribution system.

---

## GitHub Secrets — Exact Values

Every app repo needs these 7 GitHub Actions secrets. **6 are shared** (same for all repos), **1 is app-specific**.

### Shared secrets (copy exactly for every app repo):

```
R2_ACCOUNT_ID          = ee9714c4bade2c83d3dca2d5dae214dc
R2_ACCESS_KEY_ID       = d8f479c4224bacb7980749eed203957e
R2_SECRET_ACCESS_KEY   = f5c2490ff76f15e85748b9899a6ea12cb27369731a18d57545935e3f4d9cd79b
R2_BUCKET_NAME         = apk-distributor
DISTRIBUTOR_WEBHOOK_SECRET = my-super-secret-webhook-key-2024
DISTRIBUTOR_WEBHOOK_URL    = https://apk-distributor.vercel.app/api/webhook/build-complete
```

### App-specific:

```
EXPO_TOKEN = <get from https://expo.dev/accounts/settings/access-tokens>
```

> **⚠️ CRITICAL: R2_BUCKET_NAME MUST be `apk-distributor`. NOT `hod-travel-journal` or any other bucket.**
> The Vercel dashboard reads from the `apk-distributor` R2 bucket. If the app repo uploads to a different bucket, the APK will be uploaded successfully but will NEVER appear on the dashboard. This is the #1 cause of "Registered but no build yet" errors.

### Setting secrets via GitHub UI:
Go to repo → Settings → Secrets and variables → Actions → New repository secret. Add all 7 one by one.

### Setting secrets via GitHub CLI:
```bash
# From the app repo directory:
gh secret set R2_ACCOUNT_ID --body "ee9714c4bade2c83d3dca2d5dae214dc"
gh secret set R2_ACCESS_KEY_ID --body "d8f479c4224bacb7980749eed203957e"
gh secret set R2_SECRET_ACCESS_KEY --body "f5c2490ff76f15e85748b9899a6ea12cb27369731a18d57545935e3f4d9cd79b"
gh secret set R2_BUCKET_NAME --body "apk-distributor"
gh secret set DISTRIBUTOR_WEBHOOK_SECRET --body "my-super-secret-webhook-key-2024"
gh secret set DISTRIBUTOR_WEBHOOK_URL --body "https://apk-distributor.vercel.app/api/webhook/build-complete"
gh secret set EXPO_TOKEN --body "<your-expo-token>"
```

---

## Creating a New App from Scratch

### 1. Initialize the Project

```bash
# Expo/React Native (recommended)
npx create-expo-app my-app --template blank-typescript
cd my-app

# Or plain React Native
npx react-native init MyApp --template react-native-template-typescript
cd MyApp
```

### 2. Set Up Git — CRITICAL: Use Personal Account

```bash
git init

# Set repo-scoped git config (DO NOT skip this)
git config user.email "benezrikoren@gmail.com"
git config user.name "Koren Ben Ezri"
```

**Why this matters:** The owner uses separate GitHub accounts for work and personal projects. Personal projects MUST use `benezrikoren@gmail.com` to avoid:
- Personal project activity showing on work GitHub profile
- Accidental use of work SSH keys
- Repository ownership confusion

### 3. Set Up Remote with SSH Alias

```bash
# Use the personal account SSH alias (configured in ~/.ssh/config)
git remote add origin git@github.com-korenisimo:Korenisimo/my-app.git
```

The `github.com-korenisimo` SSH alias routes to the personal GitHub account's SSH key. This is configured at the system level in `~/.ssh/config`:
```
Host github.com-korenisimo
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_korenisimo
```

### 4. Set Up EAS (Expo apps only)

```bash
npx eas-cli init
```

Create `eas.json`:
```json
{
  "cli": { "version": ">= 3.0.0" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### 5. Add the Distributor Workflow

Create `.github/workflows/build-apk.yml` — copy from `examples/caller-workflow.yml` in the apk-distributor repo. Customize:
- `app-slug`: URL-safe unique identifier
- `app-name`: Human-readable display name
- `paths`: Which file changes should trigger a build

### 6. Add GitHub Secrets

Add all 7 secrets listed at the top of this document. The fastest way:

```bash
gh secret set R2_ACCOUNT_ID --body "ee9714c4bade2c83d3dca2d5dae214dc"
gh secret set R2_ACCESS_KEY_ID --body "d8f479c4224bacb7980749eed203957e"
gh secret set R2_SECRET_ACCESS_KEY --body "f5c2490ff76f15e85748b9899a6ea12cb27369731a18d57545935e3f4d9cd79b"
gh secret set R2_BUCKET_NAME --body "apk-distributor"
gh secret set DISTRIBUTOR_WEBHOOK_SECRET --body "my-super-secret-webhook-key-2024"
gh secret set DISTRIBUTOR_WEBHOOK_URL --body "https://apk-distributor.vercel.app/api/webhook/build-complete"
gh secret set EXPO_TOKEN --body "<your-expo-token>"
```

### 7. Push and Verify

```bash
git add -A
git commit -m "Initial commit"
git push -u origin main
```

The APK will build and appear on the distributor dashboard within ~15 minutes.

---

## Principles for Every App

These are the guiding standards derived from production apps in this ecosystem. Follow the principles, not rigid rules — adapt to the app's needs.

### Privacy First

- **Minimize data collection.** Only collect what the app genuinely needs. If you don't need user accounts, don't add auth.
- **Use OAuth, never passwords.** If auth is needed, use Google OAuth (via Supabase, NextAuth, or Firebase). Never implement password-based auth — it's a liability you don't need.
- **Enforce access control at the data layer.** If using a database with user data, enable Row-Level Security (Supabase) or equivalent. Never rely on client-side checks alone.
- **Sign all media URLs.** Never expose raw bucket URLs. Generate time-limited signed URLs for any downloadable content.
- **Provide data export and deletion.** GDPR Article 20 (data portability) and Article 17 (right to erasure). Even for personal apps — build the habit.
- **Serve a privacy policy.** Google Play requires one. A simple, honest page explaining what data you collect and why is sufficient.

### Security by Default

- **Validate auth server-side on every API route.** The client can lie. Always check the session/token server-side.
- **Secrets in env vars, never in code.** No API keys, tokens, or credentials in source files. Use `.env.local` for dev, Vercel env vars for prod, GitHub Secrets for CI.
- **CORS: be explicit.** Never use `Access-Control-Allow-Origin: *` in production. List your actual domains.
- **Rate limit user-facing endpoints.** Especially anything that hits external APIs (AI, payments, etc.).
- **Error monitoring with PII scrubbing.** Use Sentry or equivalent. Enable PII scrubbing so user data doesn't leak into error reports.

### Quality & Maintainability

- **TypeScript everywhere.** No `any` in production code. Type your API responses, your state, your props.
- **Keep a `.env.example`.** Document every env var the app needs. This is the onboarding experience for future you.
- **Write tests for critical paths.** Auth flows, data mutations, payment logic, API integrations. Don't test UI layout — test behavior.
- **README with setup instructions.** Future you (or future LLM) needs to know how to run this.
- **Minimal dependencies.** Every dep is a maintenance burden. Prefer built-in Node/React APIs over libraries when the difference is trivial.

### Build & Distribution

- **Every push to main = distributable artifact.** The APK Distributor reusable workflow handles this. Don't reinvent the build pipeline.
- **Keep build configs in version control.** `eas.json`, `app.json`, `package.json` — all committed.
- **Tag releases.** When shipping to Play Store, `git tag v1.0.0`. APK Distributor handles continuous beta delivery; tags mark production milestones.
- **APK signing keys: let EAS manage them.** Or store in GitHub Secrets. Never commit signing keys.

### GitHub & Account Hygiene

- **ALWAYS use personal GitHub account** (`Korenisimo`), not work account (`KorenBenEzri`).
- **Set `git config user.email benezrikoren@gmail.com`** at the repo level. Every repo. Every time.
- **Use SSH alias `github.com-korenisimo`** in remote URLs.
- **Set GitHub secrets per-repo** or at the personal account org level.
- **Never create personal project repos under the work account.** Even accidentally. If you do, transfer ownership immediately.

### Compliance & Legal

- **Every app needs a privacy policy.** Google Play requires it. Even side projects that only you use — if they're on the Play Store, they need one.
- **Every app needs terms of service.** Can be simple: "This app is provided as-is. Your data is yours."
- **Document data collection.** What do you collect? Why? Where is it stored? For how long? Answer these questions in your privacy policy.
- **If using analytics, disclose it.** Firebase Analytics, Mixpanel, whatever — mention it.
- **GDPR: data export + deletion.** CCPA: honor opt-out requests. These are legal requirements if you have users in the EU or California.
- **Keep it simple and honest.** A one-page privacy policy that truthfully describes your app is better than a 20-page legal document copied from a template.

---

## Project Structure Convention

Follow this structure for new apps (Expo/React Native):

```
my-app/
├── .github/
│   └── workflows/
│       └── build-apk.yml          ← distributor workflow (required)
├── src/                           ← all source code
│   ├── components/
│   ├── screens/
│   ├── hooks/
│   ├── utils/
│   └── types/
├── assets/                        ← images, fonts
├── app.json                       ← Expo config
├── eas.json                       ← EAS build config
├── package.json
├── tsconfig.json
├── .env.example                   ← document all env vars
├── .gitignore
└── README.md
```

---

## Checklist for a New App

- [ ] Git config set to personal email
- [ ] Remote uses `github.com-korenisimo` SSH alias
- [ ] `.github/workflows/build-apk.yml` added
- [ ] GitHub secrets configured
- [ ] `.env.example` created
- [ ] README.md with setup instructions
- [ ] Privacy policy page (if user-facing)
- [ ] Terms of service page (if user-facing)
- [ ] First push to main triggers successful build
- [ ] App appears on distributor dashboard
- [ ] Download works from dashboard
