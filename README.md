# FieldRoutes MCP Server for Claude

Connects Claude to your FieldRoutes account so you can look up customers, check routes, view appointments, pull service history, and more — directly in conversation.

---

## Tools included

| Tool | What it does |
|---|---|
| `search_customers` | Find a customer by name, phone, email, or address |
| `get_customer` | Full details for a customer by ID |
| `get_service_history` | Past and open service tickets for a customer |
| `get_ticket` | Full details on a single service ticket |
| `get_appointments` | Scheduled appointments by date, customer, route, or tech |
| `get_routes` | Routes running on a specific date |
| `get_route_details` | All stops on a specific route |
| `get_subscriptions` | Recurring service plans for a customer |
| `get_employees` | Employee/technician list and IDs |
| `get_invoices` | Invoices and balances for a customer |

---

## Setup

### 1. Copy this project and install dependencies

```bash
npm install
```

### 2. Configure your credentials

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `FR_AUTH_KEY` — from FieldRoutes: **Admin → API → Manage Keys**
- `FR_AUTH_TOKEN` — same location
- `FR_SUBDOMAIN` — the part before `.pestroutes.com` in your URL (e.g. `crownpest`)

### 3. Build and run locally to test

```bash
npm run build
npm start
```

You should see:
```
FieldRoutes MCP server running on port 3000
MCP endpoint: http://localhost:3000/mcp
```

---

## Deploy to Railway (recommended — free tier available)

1. Go to [railway.app](https://railway.app) and sign up (free)
2. Click **New Project → Deploy from GitHub repo**
3. Connect your GitHub account and push this code to a new repo
4. Railway will detect Node.js and deploy automatically
5. In Railway, go to your project → **Variables** and add:
   - `FR_AUTH_KEY`
   - `FR_AUTH_TOKEN`
   - `FR_SUBDOMAIN`
6. Railway will give you a public URL like `https://fieldroutes-mcp-production.up.railway.app`

---

## Deploy to Render (alternative — also free)

1. Go to [render.com](https://render.com) and sign up
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Set **Build Command**: `npm install && npm run build`
5. Set **Start Command**: `npm start`
6. Under **Environment**, add `FR_AUTH_KEY`, `FR_AUTH_TOKEN`, `FR_SUBDOMAIN`
7. Deploy — Render gives you a URL like `https://fieldroutes-mcp.onrender.com`

---

## Connect to Claude

1. In the Claude desktop app, go to **Settings → Connectors**
2. Click **Add custom connector**
3. Enter your deployed URL + `/mcp`:
   ```
   https://your-app.up.railway.app/mcp
   ```
4. Save — Claude can now use all 10 FieldRoutes tools

---

## Verify endpoints against your FieldRoutes docs

The API paths in this server (`customer/search`, `appointment/search`, etc.) follow the standard
FieldRoutes REST pattern. If any return a 404, check your tenant-specific API docs at:

```
https://YOUR_SUBDOMAIN.pestroutes.com/api/docs
```

or contact FieldRoutes support to confirm the exact path for your account tier.

---

## Security notes

- Your API credentials are stored only in environment variables — never committed to code
- The server does not require its own authentication (Claude is the only caller)
- For extra security, you can add an `API_SECRET` env var and validate it as a bearer token on incoming requests
