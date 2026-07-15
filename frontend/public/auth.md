# Auth.md

How agents and API clients authenticate with the Spire Codex API.

## Anonymous access

All read endpoints under https://spire-codex.com/api are public. Unauthenticated traffic gets the browse rate tier, applied per IP and per endpoint. Current tier caps: https://spire-codex.com/api/rate-limits

## Registering for an API key

1. Sign in at https://spire-codex.com with Steam or Discord.
2. Open Settings, then the API Key tab.
3. Create a key. It is shown once and starts with `sk-codex-`. One key per account.

## Using the key

Send it as a header on every request:

    X-API-Key: sk-codex-...

Keyed requests get the registered tier (higher caps; paid supporters get the paid tier). Responses carry X-RateLimit-Limit, X-RateLimit-Remaining, and X-RateLimit-Reset so clients can pace themselves.

## Revocation

Delete the key from the same Settings tab. Revocation takes effect within seconds.

## Notes

There is no OAuth flow; authentication is API-key only. Terms: https://spire-codex.com/terms
