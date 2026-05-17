#!/usr/bin/env bash
# Write reports/index.html into the given directory, listing every
# subdirectory as an archived report. Sorted lexicographically descending,
# so YYYY-MM-DD_<sha> IDs naturally sort newest-first.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <reports-dir>" >&2
  exit 2
fi

reports_dir="$1"
if [[ ! -d "$reports_dir" ]]; then
  echo "ERROR: $reports_dir is not a directory" >&2
  exit 1
fi

entries=""
while IFS= read -r dir; do
  [[ -z "$dir" ]] && continue
  id="$(basename "$dir")"
  entries+="    <li><a href=\"./$id/\">$id</a></li>"$'\n'
done < <(find "$reports_dir" -mindepth 1 -maxdepth 1 -type d | sort -r)

cat > "$reports_dir/index.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Benchmark Reports — Archive</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 4rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #666; margin-top: 0; }
    ul { list-style: none; padding: 0; margin-top: 2rem; }
    li { padding: 0.5rem 0; border-bottom: 1px solid #eee; }
    a { color: #0366d6; text-decoration: none; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Benchmark Reports — Archive</h1>
  <p>Each entry is a self-contained point-in-time snapshot. <a href="../">↑ Latest</a></p>
  <ul>
$entries  </ul>
</body>
</html>
HTML
