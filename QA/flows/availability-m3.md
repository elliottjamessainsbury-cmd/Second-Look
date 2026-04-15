## id
`availability-m3`

## priority
`P0`

## purpose
Ensure the M3 availability layer stays inside the closed catalogue, fails safely without API credentials, and produces actionable retailer links.

## setup
- Use the local repository checkout
- Treat `data/curated-films.json` as the closed film universe
- Regenerate `data/availability.json` before validating it

## steps
1. Run the availability build script.
2. Confirm `data/availability.json` exists.
3. Confirm every availability entry key maps to an existing `film_id` in the curated dataset.
4. Confirm no curated `film_id` is missing from the availability output.
5. Confirm each film has retailer search links for Criterion, Amazon, and HMV.
6. Confirm ambiguous year-qualified titles use exact retailer links or metadata when present.

## expected
- The build succeeds even if TMDb or eBay credentials are missing.
- No new film records are created.
- Availability output only contains the closed-universe `film_id`s.
- Retailer search links are always generated.
- Streaming providers and eBay listings can be empty, but the file remains valid.

## notes
- This is a lightweight MVP availability check, not a full commerce validation suite.
- Missing live API credentials should degrade to partial output rather than a failed build.
