# Security

## Do Not Commit Secrets

**Never** commit any of the following to the repository:

- API keys (IBM Cloud, GitHub, npm, etc.)
- Passwords or tokens
- `.env` files with real credentials
- Files matching `*env*.keys`, `*credentials*`, `*secrets*`
- Private keys (`.pem`, `.key`)

These are excluded via `.gitignore`. If you accidentally commit a secret:

1. **Immediately revoke** the compromised key/token
2. Rotate to a new credential
3. Use `git filter-branch` or BFG Repo-Cleaner to remove from history (if already pushed)

## Configuration

- **VS Code Extension**: Use Settings (`wxo-builder.apiKey`, `wxo-builder.instanceUrl`) or environment variables (`WO_API_KEY`, `WO_INSTANCE_URL`). Values are stored in VS Code's secure storage, not in repo files.
- **Scripts**: Pass credentials via environment variables, e.g. `WO_API_KEY=xxx npm run test:remote -- toolId`
