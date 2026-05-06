# 📦 APK Distributor

A unified APK distribution hub for all your personal Android apps. Push to `main` in any repo → APK auto-builds → appears on your authenticated download portal.

## What It Does

1. **Reusable GitHub Actions workflow** — any app repo calls it to build + upload APKs to Cloudflare R2
2. **Vercel dashboard** — lists all your apps with one-click download + QR codes
3. **Google OAuth + email whitelist** — only you (and people you whitelist) can access it

## Quick Start

### 1. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Korenisimo/apk-distributor)

### 2. Set Vercel Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID ([console.cloud.google.com](https://console.cloud.google.com/apis/credentials)) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `AUTH_SECRET` | Random 32+ char string (`openssl rand -base64 32`) |
| `ALLOWED_EMAILS` | Comma-separated emails allowed to sign in |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | R2 bucket name |
| `WEBHOOK_SECRET` | Random shared secret for build webhooks |

### 3. Add to Your App Repo

Copy `examples/caller-workflow.yml` to `.github/workflows/build-apk.yml` in your app repo. Change `app-slug` and `app-name`. Add the required GitHub secrets. Push to main.

See [PLUG-AND-PLAY.md](./PLUG-AND-PLAY.md) for detailed step-by-step.

## Architecture

```
App Repo A ──┐
App Repo B ──┤── GitHub Actions (reusable workflow) ──→ Cloudflare R2
App Repo C ──┘                                              │
                                                            │
                                                            ▼
                                          APK Distributor (Vercel)
                                          ├── Google OAuth login
                                          ├── Dashboard with app cards
                                          └── Signed URL downloads
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Web framework | Next.js 15 (App Router) |
| Hosting | Vercel |
| Auth | NextAuth.js v5 + Google |
| Storage | Cloudflare R2 |
| CI/CD | GitHub Actions (reusable workflows) |
| Styling | Tailwind CSS |
| Testing | Vitest (integration tests against real R2) |

## Development

```bash
npm install
cp .env.example .env.local  # fill in values
npm run dev                  # http://localhost:3000
npm test                     # run integration tests
```

## Git Config

This repo uses a personal GitHub account. The local git config is set to:
```
user.email = benezrikoren@gmail.com
user.name = Koren Ben Ezri
```

Remote uses SSH alias `github.com-korenisimo` to route to the personal account.

## Cost

| Service | Cost |
|---------|------|
| Vercel | Free (Hobby) |
| Cloudflare R2 | ~$0 (10GB free, 0 egress) |
| GitHub Actions | Free (personal repos) |
| Google OAuth | Free |
| **Total** | **$0/month** |

## Docs

- [PLUG-AND-PLAY.md](./PLUG-AND-PLAY.md) — Step-by-step: add a new app in 5 minutes
- [LLM-INSTRUCTIONS.md](./LLM-INSTRUCTIONS.md) — Guide for AI agents creating new apps
