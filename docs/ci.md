# Continuous integration

The GitHub Actions workflow is `.github/workflows/ci.yml`. It runs on every pull request.
If the pipeline runs elsewhere (Jenkins, Bitbucket Pipelines), run the same steps in the same order.

## Required steps

Use Node 22 (LTS). The repo has no `.nvmrc` and no `engines` field. Cache `~/.npm` keyed on `package-lock.json`.

1. `npm ci`
2. `npm run check` (`astro check && tsc --noEmit -p functions`)
3. `npm test` (`vitest --run`, never watch mode)
4. `npm run build` (without `PUBLIC_LAUNCH`, so missing Concept images only warn)
5. Secret scan over the full git history (fetch the full history, not a shallow clone):
   `docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.18.4 detect --source=/repo --redact --verbose`
   Any finding fails the pipeline.

The pipeline needs no secrets. Do not add Turnstile, MailerLite, admin or D1 credentials to CI.
The secret values live only in Cloudflare (see `.dev.vars.example` and `.env.example` for names).

## Launch build

The public launch build runs `PUBLIC_LAUNCH=true npm run build`. It fails on missing Concept images and
on an incomplete launch checklist. Run it only in the release pipeline, not on pull requests.

## Notes

- Steps 2 to 4 run in one job and step 5 in another, so a secret finding is reported even if the build fails.
- Pin third-party actions or images by version (or commit SHA) and update them deliberately.
