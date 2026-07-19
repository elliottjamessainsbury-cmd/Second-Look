## id
`account-model-v1`

## priority
`P1`

## purpose
Verify account gating, Supabase-backed saved films, local import, and privacy controls.

## setup
- Configure `config.js` with a Supabase project URL and anon key.
- Run `supabase/schema.sql`.
- Deploy the `delete-account` Edge Function.
- Start the static app locally.

## steps
1. Open `index.html` in a clean browser state.
2. Confirm the floating welcome dialog appears.
3. Close the dialog and confirm the page remains visible.
4. Confirm search, quick-pick, save, dismiss, and taste-answer actions prompt sign-in.
5. Confirm the cinema calendar remains browsable while logged out.
6. Use the account button to request a magic link and sign in.
7. Confirm the account button shows the display name or email prefix.
8. Open the account pane and confirm Edit details, See saved films, Export my data, Log out, and Delete account are present.
9. Save at least one film, refresh, and confirm it remains saved.
10. Open `saved.html` and confirm the saved film appears from the account.
11. Export account data and confirm it contains profile, saved film IDs, and taste data only.
12. Delete the account and confirm profile, saved films, taste profile, and auth user are removed.

## expected
- Logged-out users are read-only except for navigation and outbound cinema/review links.
- Logged-in saved films persist through Supabase.
- Row-level security prevents cross-user account data access.
- Account deletion uses the Edge Function and removes personal data.
