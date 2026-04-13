# Nomi Agent

> Deploy your AI agent to Telegram, Slack, and Discord in minutes — no server required.

Nomi Agent is a multi-tenant SaaS platform that manages per-user [nanoclaw](https://github.com/qwibitai/nanoclaw) AI agent instances. Each user gets an isolated container running their own agent, configurable via a web dashboard, and connectable to messaging channels.

---

## Features

- **Instant Deployment** — Spin up a personal AI agent with a few clicks
- **Bring Your Own Key** — Connect your Anthropic API key, or use our hosted LLM service
- **Messaging Channel Integration** — Connect agents to Telegram (Slack & Discord coming soon)
- **Web Dashboard** — Monitor instance status, manage channels, and configure agent behavior
- **Agent Configuration** — Edit your agent's `CLAUDE.md` prompt via Monaco editor or choose from templates
- **Secure by Default** — API keys encrypted at rest with AES-256-GCM; per-user data isolation
- **Subscription Billing** — LemonSqueezy-powered subscription management

---

## Architecture

```
┌───────────────────────────────────────────┐
│          Web UI (Next.js 16)              │
│   Onboarding · Dashboard · Billing       │
└──────────────────┬────────────────────────┘
                   │ HTTPS
                   ▼
┌───────────────────────────────────────────┐
│     Control Plane API (Next.js API)       │
│   Auth · Instances · Channels · Billing  │
└──────────────────┬────────────────────────┘
                   │ Internal HTTP
                   ▼
┌───────────────────────────────────────────┐
│    Instance Orchestrator (NestJS)         │
│   Container lifecycle · Health checks    │
└──────────────────┬────────────────────────┘
                   │ Docker Socket
                   ▼
┌───────────────────────────────────────────┐
│   nanoclaw Containers (per-user)          │
│   /data/nanoclaw-instances/{userId}/      │
│     ├── store/messages.db   (SQLite)      │
│     └── groups/main/CLAUDE.md            │
└───────────────────────────────────────────┘

External Services
  Supabase     — Auth + PostgreSQL
  LemonSqueezy — Subscriptions & Billing
```

### Monorepo Structure

```
.
├── packages/
│   ├── platform/          # Next.js 16 frontend + Control Plane API routes
│   │   └── src/
│   │       ├── app/
│   │       │   ├── auth/          # Login / Signup
│   │       │   ├── onboarding/    # 4-step onboarding flow
│   │       │   ├── dashboard/     # User dashboard & settings
│   │       │   └── api/           # Control Plane API routes
│   │       └── lib/               # Supabase, crypto, LemonSqueezy, orchestrator clients
│   │
│   ├── orchestrator/      # NestJS instance management service
│   │   └── src/
│   │       ├── instances/         # Instance CRUD
│   │       ├── containers/        # Docker lifecycle management
│   │       ├── channels/          # Telegram bot registration
│   │       ├── billing/           # Subscription sync
│   │       ├── monitor/           # Health checks
│   │       └── scheduler/         # Periodic maintenance tasks
│   │
│   └── engine/            # nanoclaw (git submodule)
│
├── supabase/              # Database schema migrations
├── docs/                  # TRD, dev plan, feature specs
└── ideas/                 # Product ideation docs
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js (App Router) | 16.x |
| Backend | NestJS | 10.x |
| Database | PostgreSQL via Supabase | — |
| Auth | Supabase Auth | — |
| Styling | Tailwind CSS | 4.x |
| Payment | LemonSqueezy | 4.x |
| Build | Turbo | 2.x |
| Runtime | Node.js | ≥ 20 |

---

## Getting Started

### Local Development

**Prerequisites:** Node.js ≥ 20, Docker

```bash
git clone --recurse-submodules https://github.com/khj-argos/nomi-agent.git
cd nomi-agent
npm install
cp .env.example .env   # fill in credentials
supabase db push
npm run dev
```

This starts:
- **Platform** at `http://localhost:3000`
- **Orchestrator** at `http://localhost:4001`

### Production (EC2 + Docker Compose)

자세한 내용은 **[docs/deployment.md](docs/deployment.md)** 를 참고하세요.

```bash
# 데이터 디렉토리
sudo mkdir -p /data/nanoclaw-instances

# agent 이미지 빌드
docker build -t nanoclaw-agent:latest -f packages/engine/container/Dockerfile packages/engine/container/

# platform + orchestrator 빌드 및 실행
cp .env.example .env  # 값 채우기
docker compose build
docker compose up -d
```

---

## Database Schema

Key tables managed by Supabase PostgreSQL:

```sql
users               — Auth user profiles
instances           — Per-user agent containers (status, config, encrypted API key)
instance_channels   — Connected messaging channels (Telegram, etc.)
subscriptions       — LemonSqueezy subscription state
```

---

## Deployment

→ **[docs/deployment.md](docs/deployment.md)**

---

## Onboarding Flow

Users are guided through a 4-step setup:

1. **Agent Name** — Name your assistant
2. **Config Path** — Choose Beginner (template) or Advanced (custom `CLAUDE.md`)
3. **Channel Connection** — Connect a Telegram bot
4. **Review** — Confirm and launch the agent container

---

## Security

- **API Key Encryption:** User Anthropic API keys are encrypted with AES-256-GCM before storage. The plaintext key is only available inside the container at startup — never exposed via the API.
- **Container Isolation:** Each user's nanoclaw instance runs in a separate Docker container with isolated filesystem and SQLite database.
- **Auth Guards:** All API routes validate Supabase JWTs. Orchestrator endpoints require an internal `ORCHESTRATOR_SECRET` header.
- **Webhook Verification:** LemonSqueezy webhooks are verified with HMAC-SHA256 signatures.

---

## Development Roadmap

- [x] Project scaffold (platform + orchestrator)
- [x] Supabase auth integration
- [x] Instance orchestration (NestJS + Docker)
- [x] Telegram channel integration
- [x] LemonSqueezy billing
- [x] Onboarding flow
- [x] Dashboard UI
- [ ] Slack & Discord channel support
- [ ] Multi-instance support per user
- [ ] Usage analytics dashboard
- [ ] Agent template marketplace

---

## Contributing

Issues and PRs are welcome. Please open an issue before submitting a large PR.

---

## License

MIT
