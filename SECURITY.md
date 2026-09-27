# Security review workflow

This project is configured for CodeRabbit in `.coderabbit.yaml`. Put this folder
in a GitHub repository, install the CodeRabbit GitHub App for that repository,
and open a pull request. CodeRabbit will review changed files using the
security-specific instructions in the configuration.

The referenced `coderabbitai/cursor-plugin` is a Cursor integration, not a
runtime dependency of this website. It must not be bundled into the browser
application. Use the GitHub App for repository pull-request reviews, or use the
plugin only in a separate Cursor workspace.

Generate the access password hash with:

```bash
node -e "const c=require('node:crypto');const p=process.argv[1];const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync(p,s,32).toString('hex'))" 'replace-with-a-long-random-password'
```

Set the output as `ACCESS_PASSWORD_HASH` and a separate random value as
`ACCESS_SESSION_SECRET`. Never put either value in `VITE_*` variables or commit
them.
