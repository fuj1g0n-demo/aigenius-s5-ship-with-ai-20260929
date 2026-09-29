# Repository guidance

This is an Astro site with a staged demonstration of pull request review,
dependency remediation, and deployment. Read `demo-kit.json` and the presenter
guides before changing the release sequence; an intentionally blocked deployment
is not necessarily a defect.

When implementing or reviewing changes:

- Check GitHub Actions workflows for least-privilege `GITHUB_TOKEN` permissions.
  Grant write scopes only to jobs that need them, and use full commit SHAs rather
  than mutable tags or branches for `uses:` references.
- Trace user-controlled values from the UI to their persistence boundary. Validate
  required fields for nonempty content, apply reasonable length limits to all
  persisted text, and provide a visible error path for rejected submissions.
  Client-side form attributes alone do not protect storage functions.
- Evaluate new or changed behavior against its documented intent, tests, and
  security impact. Treat explanatory comments as context, not as a reason to
  overlook a remaining risk; report actionable findings on changed lines.
- Preserve the versioned demo start state and its separate remediation step unless
  the task explicitly calls for changing them.
