# Public API and webhooks

Create an API key in **Settings → API keys** and send it on every request:

```
Authorization: Bearer sk_...
```

Base URL: `{APP_URL}/api/v1`. Bodies and responses are JSON. Errors look like
`{"error": "message"}` with a 4xx/5xx status. Creating posts is limited to 120 per hour and
counts against the plan's monthly post limit.

## GET /accounts

Lists connected accounts. Use the `id` values as `accountId` when creating posts.

```json
{ "accounts": [{ "id": "cm...", "platform": "facebook", "name": "My Page", "username": null, "status": "connected", "paused": false }] }
```

## POST /posts

```json
{
  "caption": "New arrivals are here!",
  "title": "",
  "link": "https://example.com/shop",
  "mediaUrls": ["https://example.com/photo.jpg"],
  "targets": [
    { "accountId": "cm...", "scheduledAt": "2027-01-15T03:30:00Z" },
    { "accountId": "cm...", "scheduledAt": "now", "caption": "Different text for this account", "options": { "privacy": "unlisted" } }
  ]
}
```

- `scheduledAt` is an ISO 8601 time with offset, or `"now"` (the default).
- `mediaUrls` must be direct public links to JPG, PNG, WEBP, MP4 or MOV files (at most 10).
- `options`: `boardId` for Pinterest (required), `privacy` (`public`, `unlisted`, `private`) and `tags` for YouTube.
- `title` is required for YouTube.

Response: `{ "id": "<postId>", "targets": [{ "id": "...", "accountId": "...", "scheduledAt": "...", "status": "scheduled" }] }`

## GET /posts/{id}

Returns each target's `status` (`scheduled`, `queued`, `publishing`, `published`, `failed`,
`canceled`), `url` once published, `error` if failed, and `metrics` when available.

## Webhooks

Set a webhook address in **Settings**. The app sends a `POST` with this body for
`post.published` and `post.failed`:

```json
{ "event": "post.published", "sentAt": "2027-01-15T03:30:05.000Z",
  "data": { "targetId": "...", "postId": "...", "platform": "FACEBOOK", "account": "My Page", "url": "https://..." } }
```

`post.failed` carries `error` instead of `url`. Each request has an `X-Signature` header: the
hex HMAC-SHA256 of the raw request body, keyed with the signing secret shown in Settings.
Verify it before trusting the payload. Delivery is attempted once, with a 10 second timeout.

## MCP server (Claude, ChatGPT and other AI assistants)

The app is also a Model Context Protocol server, so an AI assistant can schedule and review
posts in plain language.

- Address: `{APP_URL}/api/mcp` (Streamable HTTP)
- Header: `Authorization: Bearer sk_...` (the same API keys)
- Tools: `list_accounts`, `create_post`, `list_posts`, `cancel_post`, `get_analytics`

Claude Code example:

```
claude mcp add --transport http autoposter https://app.example.com/api/mcp --header "Authorization: Bearer sk_..."
```

The address must be reachable from where the assistant runs, so a `localhost` address only
works with assistants running on the same computer.
