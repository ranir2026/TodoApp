# Todo App

The app works locally with browser storage. To enable cross-device sync:

1. Create a Supabase project.
2. Run `supabase-schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and fill in the project URL, publishable anon key, and public app URL.
4. In Supabase Authentication, enable the Email provider.
5. Start the app with `npm run dev` and create an account.

On the first sign-in, existing local todos and courses are uploaded when the account has no cloud state. Later changes sync automatically across signed-in devices.

## Development

```bash
npm install
npm run dev
```

Create a production build with `npm run build` and check code quality with `npm run lint`.
