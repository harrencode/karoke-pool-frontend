# Deploy the frontend on Vercel

The Vercel project uses `karoke-pool-frontend/` as its Root Directory. The separate FastAPI backend is optional and is not deployed by this configuration. Solo works immediately without environment variables; Karaoke Pool shows its unavailable notice until a reachable backend is configured.

## Import from GitHub

1. Push the project files to a GitHub repository, including `karoke-pool-frontend/package-lock.json` and `karoke-pool-frontend/vercel.json`.
2. In Vercel, choose **Add New → Project**, then import that repository.
3. Set **Root Directory** to **`karoke-pool-frontend`**. This must be selected in Vercel; the configuration file cannot set it for you.
4. Confirm **Framework Preset: Next.js** and **Node.js: 22.x**. The package also declares Node 22.x.
5. The included configuration runs **`npm ci`** and **`npm run build`**. Leave **Output Directory** at the Next.js default; do not set it to `out`, `public` or `.next/standalone`.
6. Leave environment variables empty for Solo, then click **Deploy**.
7. Open the resulting HTTPS URL. Test Add a song, YouTube playback, microphone permission and monitoring with headphones. Open `/pool` and confirm it reports unavailable while the backend is absent.

Select the Hobby plan when the project meets its personal/non-commercial usage terms. Its usage limits still apply.

## Optional Karaoke Pool backend

Deploy `backend/` independently as one long-running FastAPI instance, using `backend/README.md`. The current service keeps rooms in memory and requires a single worker/replica; it is not prepared for stateless function scaling. Redis/shared room state would be needed to change that architecture.

In the frontend Vercel project's **Environment Variables**, add:

```text
NEXT_PUBLIC_POOL_API_URL=https://your-pool-backend.example
```

Use the actual public HTTPS backend origin, without `/health`, `/api`, a WebSocket path, or a trailing query string. Do not use `localhost`, a private LAN address, or a Docker service hostname. This public URL is included in browser JavaScript and is not a secret. Set the variable for the deployment environments where Pool should be enabled, then redeploy; Next.js embeds `NEXT_PUBLIC_` values at build time.

On the backend, set:

```text
ALLOWED_ORIGINS=https://your-project.vercel.app
```

Use the exact frontend origin from the deployment. Add a custom domain or any preview origin you want to test as additional comma-separated entries. The service checks both REST CORS and WebSocket origins. Do not use an unrestricted wildcard. Configure TURN URLs/credentials on the backend for restricted networks; never put the TURN shared secret in Vercel's public frontend variables.

If the service is unavailable, Solo remains usable and Pool displays its notice with Retry/Solo options.

## Local development and Docker

`npm run dev` still serves the frontend locally and allows this computer's LAN IPv4 addresses for Next.js development resources. Localhost Pool development defaults to port 8000 when the public URL is blank. Microphone access from a LAN device still needs trusted HTTPS.

Outside Vercel, `next.config.mjs` retains standalone output for the existing Dockerfile. Vercel's automatic `VERCEL=1` environment flag selects the native Next.js output. No Dockerfile or start command is needed on Vercel.

## Verify before deploying

From `karoke-pool-frontend/`:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

To reproduce the Vercel output mode locally in PowerShell:

```powershell
$env:VERCEL = '1'
npm run build
Remove-Item Env:VERCEL
```

The configuration is prepared for deployment. No Vercel account has been connected and no deployment has been created by this repository preparation.

References: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [monorepo Root Directory setup](https://vercel.com/docs/monorepos), [Vercel project configuration](https://vercel.com/docs/project-configuration).
