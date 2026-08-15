---
name: OpenRouter setup declined — fall back to requestSecrets
description: When the user pastes a third-party API key in chat and the managed AI-integrations proxy setup is declined, request their own key as a proper secret instead of reusing the pasted value or asking again in chat.
---

A user pasted a live OpenRouter API key directly in a chat message. Two safe paths exist to give the app access to OpenRouter: (1) the Replit-managed AI Integrations proxy (`setupReplitAIIntegrations`), which needs no key handling at all, or (2) `requestSecrets` to have the user submit their own key through the secure secrets UI.

**Why:** A key pasted in plaintext chat must never be echoed, logged, or hand-copied into files/env by the agent — that would embed a live credential in conversation history/logs outside the secrets system. If the managed-proxy path requires an account upgrade the user declines, do not keep retrying that same setup call.

**How to apply:** If the managed integration path is declined or unavailable, call `requestSecrets` with a clear `userMessage` explaining what the key powers, and use the resulting env var (e.g. `OPENROUTER_API_KEY`) — never the value pasted in chat.
