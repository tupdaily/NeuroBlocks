# Supabase setup for NeuroBlocks auth

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Create a new project (or use an existing one).
3. Wait for the project to be ready.

## 2. Get your keys

1. In the Supabase dashboard, open **Project Settings** (gear icon) → **API**.
2. Copy:
   - **Project URL** → use as `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Create a `.env.local` in the `frontend` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 3. Enable Google and GitHub sign-in

### Google (fix for "redirect_uri_mismatch")

1. In Supabase: **Authentication** → **Providers** → enable **Google**.
2. Get your **exact** redirect URI:
   - Supabase dashboard → **Project Settings** (gear) → **API**.
   - Copy the **Project URL** (e.g. `https://abcdefghijk.supabase.co`).
   - Your **Authorized redirect URI for Google** is that URL + `/auth/v1/callback`:
     - Example: `https://abcdefghijk.supabase.co/auth/v1/callback`
   - Do **not** use `http://localhost:3000/auth/callback` here — that is only for Supabase URL config below; Google must redirect to **Supabase**, not your app.
3. In [Google Cloud Console](https://console.cloud.google.com/):
   - Create or select a project.
   - **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
   - Application type: **Web application**.
   - Under **Authorized redirect URIs** click **Add URI** and paste **exactly**:
     `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
     (replace `YOUR_PROJECT_REF` with the middle part of your Supabase Project URL; no trailing slash).
   - Save. Copy **Client ID** and **Client Secret**.
4. Back in Supabase **Google** provider settings, paste **Client ID** and **Client Secret** and save.

### GitHub

1. In Supabase: **Authentication** → **Providers** → enable **GitHub**.
2. In [GitHub Developer Settings](https://github.com/settings/developers):
   - **OAuth Apps** → **New OAuth App**.
   - **Authorization callback URL**:  
     `https://<YOUR_SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`
   - Create and copy **Client ID** and **Client Secret**.
3. In Supabase **GitHub** provider settings, paste **Client ID** and **Client Secret** and save.

## 4. Set your app URL for redirects

1. In Supabase: **Authentication** → **URL Configuration**.
2. Set **Site URL** to your app URL, e.g.:
   - Local: `http://localhost:3000`
   - Production: `https://your-domain.com`
3. Add **Redirect URLs** (one per line) if you use extra redirect URLs, e.g.:
   - `http://localhost:3000/auth/callback`
   - `https://your-domain.com/auth/callback`

After this, sign in with Google and GitHub will work and redirect back to your app.

## 5. Create the playgrounds table (for saving graphs)

To store each user’s saved playgrounds (graphs as JSON), run the migration in the Supabase SQL editor:

1. In Supabase: **SQL Editor** → **New query**.
2. Paste and run the contents of `frontend/supabase/migrations/20250214000000_create_playgrounds.sql`.

This creates the `playgrounds` table with RLS so users only see and edit their own rows. The app will then be able to list, create, and update playgrounds from the home grid and the editor toolbar.
