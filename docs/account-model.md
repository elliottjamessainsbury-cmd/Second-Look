# Account Model

Second Look uses a web-only account model for v1.

## Auth

- Supabase Auth with email magic links.
- No passwords, 2FA, social login, or device-native app flows in v1.
- The browser app reads Supabase settings from `config.js`.

## Stored Data

- `profiles`: email and optional display name.
- `saved_films`: film IDs the user saved.
- `taste_profiles`: liked film IDs, disliked film IDs, and lightweight affinity maps.

The app does not store raw search history, marketing preferences, advertising identifiers, or optional analytics events in v1.

## Anonymous Mode

Anonymous visitors can browse the page and cinema calendar. Actions that create personal state, including search seeds, saved films, dismissed films, and taste answers, require sign-in.

LocalStorage is limited to temporary UI state, welcome-dialog dismissal, and legacy saved films that can be imported after sign-in.

## Deployment Checklist

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Deploy `supabase/functions/delete-account`.
4. Put the public project URL and anon key into `config.js` or generate that file during deployment.
5. Configure Supabase magic-link redirect URLs for the production domain and local development URL.
