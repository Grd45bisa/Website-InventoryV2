# DocuFlow Backend

Express API for DocuFlow. Auth uses Supabase Auth, while app-level user roles live in `public.profiles`.

## Setup

1. Copy env file:

```bash
copy .env.example .env
```

2. Fill Supabase values in `.env`:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FRONTEND_ORIGIN=http://localhost:5173
```

In production, set `FRONTEND_ORIGIN` to the Netlify app origin. Multiple origins are supported with commas, for example:

```env
FRONTEND_ORIGIN=https://gregarious-tarsier-e48dc5.netlify.app,https://your-custom-domain.com
```

3. Install dependencies:

```bash
npm install
```

4. Run the SQL in `supabase/migrations/001_auth_profiles.sql` in Supabase SQL Editor.

5. Start API:

```bash
npm run dev
```

## Endpoints

`GET /health`

Health check.

`POST /api/auth/sign-in`

```json
{
  "email": "owner@example.com",
  "password": "password"
}
```

Returns Supabase session tokens and public user profile.

`GET /api/auth/me`

Requires:

```http
Authorization: Bearer <accessToken>
```

`POST /api/auth/sign-out`

Requires:

```http
Authorization: Bearer <accessToken>
```

## Owner Account

For now, create the first owner in Supabase Auth manually, then update `public.profiles.role` to `owner`.
Later, the app settings page can call an owner-only endpoint to create users.
