# API Gateway

Simple Express gateway that proxies requests to downstream services.

## Routes

- `GET /health`
- `POST /auth/signup`, `POST /auth/login`, and other `/auth/*` routes
- `/users/*` routes
- Also supports `/api/auth/*` and `/api/users/*` (the `/api` prefix is removed before forwarding)

## Local Run

```bash
cp .env.example .env
npm install
npm start
```

## Environment Variables

- `PORT` (default `8080`)
- `AUTH_SERVICE_URL` (default `http://localhost:3001`)
- `USERS_SERVICE_URL` (default `http://localhost:3001`)
- `CORS_ORIGIN` (default `*`)

## Deploy on Render

This repository includes `render.yaml` at root. Render will deploy this gateway using:

- `rootDir: gateway`
- `buildCommand: npm install`
- `startCommand: npm start`
- `healthCheckPath: /health`

Set these env vars in Render service settings:

- `AUTH_SERVICE_URL` = URL of your auth/identity service
- `USERS_SERVICE_URL` = URL of your users/profile service
- `CORS_ORIGIN` = allowed frontend origin (or `*`)
