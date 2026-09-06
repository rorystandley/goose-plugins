# GitHub plugin for Goose

Repository access and deterministic Dependabot maintenance. The first workflow
merges eligible dependency updates; the shared REST client and read tools support
future repository workflows without adding GitHub-specific logic to Goose core.
Requires Node 18+ and either a GitHub token or an authenticated GitHub CLI. There
are no npm runtime dependencies. Supports GitHub.com.

## Install and authenticate

From a Goose checkout with this repository beside it:

```sh
npm run plugins:link
gh auth login --hostname github.com
```

Goose uses credentials in this order: `GOOSE_GITHUB_TOKEN`, `GH_TOKEN`,
`GITHUB_TOKEN`, then `gh auth token --hostname github.com` (the existing keychain
login). Tokens are never written into reports. For a fine-grained token, grant
the selected repositories Metadata, Checks and Commit statuses read access,
Pull requests read access, and Contents write access to merge. Organization
policies and SSO may require additional authorization. A GitHub CLI login with
the usual `repo` scope also works. The scheduler must run under the same user
and be able to invoke `gh`; use `GOOSE_GITHUB_GH_PATH` for an absolute executable.

## Configuration

Add to Goose's `.env`:

```dotenv
GOOSE_GITHUB_REPOSITORIES=owned
GOOSE_GITHUB_OWNER=your-github-login
GOOSE_GITHUB_AUTO_MERGE=true
# GOOSE_GITHUB_MERGE_METHOD=squash
# GOOSE_GITHUB_GH_PATH=/opt/homebrew/bin/gh
# GOOSE_GITHUB_STATE_DIR=data/github
```

`owned` dynamically discovers all writable repositories owned by the signed-in
account, including private repositories and newly created ones. Archived and
disabled repositories are excluded. To explicitly include repositories in an
organization or restrict scope, set a comma-separated list such as
`owner/repo,organization/repo`. Every read and write tool enforces that scope.
The optional owner setting prevents a changed CLI account from silently changing
the automation's identity. Merging is **disabled unless explicitly enabled**;
tool arguments cannot change the operator's policy.

## Tools

| Tool | Purpose | Risk |
| --- | --- | --- |
| `github_list_repositories` | Discover repositories in scope | safe |
| `github_list_pull_requests` | List open, closed, or all PRs | safe |
| `github_inspect_pull_request` | Read details, patches, checks, merge blockers and head SHA | safe |
| `github_check_dependabot` | Preview the whole scope, without writes | safe |
| `github_maintain_dependabot` | Run a maintenance sweep; `dryRun` defaults to true | dangerous |
| `github_merge_dependabot_pr` | Recheck and merge one PR using an inspected `headSha` | dangerous |

Ask Goose: “Check Dependabot across my repositories”, “Inspect PR 11 in
owner/repo”, or “Merge the eligible Dependabot updates”. Remote titles, bodies
and patches are untrusted data, not instructions. The recurring mission uses a
direct tool call and never asks an LLM to decide merge eligibility.

## Merge policy

A PR must be open, non-draft, created by the actual `dependabot[bot]` Bot, on a
same-repository `dependabot/` branch, with its complete commit history authored
by Dependabot. GitHub must report `mergeable: true` and `mergeable_state: clean`.
All returned current check runs and latest commit statuses must be successful
(completed neutral/skipped check runs are permitted only alongside at least one
actual success). Missing CI, failures, cancellation, pending checks, requested
changes, conflicts, stale branches and unknown merge state block the merge.
Approvals and dismissed reviews supersede earlier change requests from the same
reviewer; comments do not. Evidence is paginated and partial evidence is refused.

Major, minor, patch, grouped and GitHub Actions updates follow the same policy;
there is no version-number exemption from checks. This checks GitHub CI and
review evidence, not semantic compatibility or a local build. At least one
successful check is required; configure meaningful CI and required checks in
each repository to enforce the tests you need. It never approves PRs, bypasses
branch protections, resolves conflicts, pushes code, or changes repository
settings. PRs needing a merge queue or a branch update remain blocked for follow-up.

Immediately before merging, Goose fetches evidence again and verifies the head,
base, open/draft status and clean mergeability. The merge request includes the
exact inspected head SHA, which GitHub checks atomically. Base and check state
cannot be pinned by this REST endpoint; GitHub branch protections remain the
server-side enforcement for concurrent changes. The preferred merge method is
squash, falling back to an enabled repository method. Writes are never retried
blindly. Only a response with `merged: true` counts as a confirmed merge.

## Schedule in Goose

Append the object in `mission.example.json` to the existing `missions` array in
Goose's `data/missions.json`, then restart Goose and `goose-scheduler`. It checks
every 30 minutes with `direct: github_maintain_dependabot`, `dryRun: false` and
mission-specific `allowDangerous: true`. Global dangerous-tool approval remains
unchanged. The computer and scheduler must be running for checks to occur.
To pause, disable that mission and restart the scheduler. To disable all plugin
merges, set `GOOSE_GITHUB_AUTO_MERGE=false` and restart both processes.

The example sends no Slack messages. Sweep output appears in mission history;
`data/github/latest.json` contains the latest live report, and
`data/github/audit.jsonl` records merge attempts, outcomes and complete sweeps.
Preview calls do not overwrite these live reports. API/auth/rate-limit errors
produce `status: completed_with_errors` with explicit errors; the scheduler
completes that scan occurrence and tries a fresh scan next time. Check the
report's status and errors, not only the mission's completed status.

An exclusive `maintenance.lock` prevents overlapping writes from manual tools
and the scheduler. If a worker is killed during a merge, inspect its PID in the
lock, the audit trail and GitHub PR state before removing the stale lock. Goose's
workflow engine also blocks uncertain interrupted direct-tool runs; use its
mission restart control after reviewing the outcome. Never delete an active lock.

## Development

```sh
npm ci
npm test
```

Tests use Node's built-in test runner, mocked GitHub requests and temporary state
directories; they never access real credentials or repositories. New read tools
can use `createClient()` and the scope helpers; new write workflows should define
their own policy, approval level and tests.

API references: [pull requests and SHA-checked merging](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request),
[check runs](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference),
[commit statuses](https://docs.github.com/en/rest/commits/statuses#list-commit-statuses-for-a-reference).
