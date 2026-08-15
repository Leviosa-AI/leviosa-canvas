#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
base_sha="${DPNEXT_ISOLATION_BASE_SHA:-}"
if [[ -z "$base_sha" ]] && git -C "$repo_root" show-ref --verify --quiet refs/remotes/origin/main; then
  base_sha="$(git -C "$repo_root" merge-base HEAD refs/remotes/origin/main)"
fi
base_sha="${base_sha:-9320c08}"

is_allowed() {
  case "$1" in
    packages/detail-document-next/*|packages/detail-dom-renderer-next/*|packages/detail-dom-editor-next/*|apps/detail-page-next-lab/*|vitest.dpnext.config.mts|.github/workflows/dpnext-ci.yml) return 0 ;;
    *) return 1 ;;
  esac
}

violations=()
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  is_allowed "$path" || violations+=("$path")
done < <({
  git -C "$repo_root" diff --name-only "$base_sha"...HEAD
  git -C "$repo_root" diff --name-only
  git -C "$repo_root" diff --cached --name-only
  git -C "$repo_root" ls-files --others --exclude-standard
} | sort -u)

if [[ ${#violations[@]} -gt 0 ]]; then
  printf 'Detail Page Next Canvas isolation violation:\n' >&2
  printf '  - %s\n' "${violations[@]}" >&2
  exit 1
fi

echo "Detail Page Next Canvas isolation check passed (${base_sha}..HEAD)"
