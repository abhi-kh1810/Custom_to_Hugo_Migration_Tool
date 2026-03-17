#!/bin/bash

# Check if sites.txt exists
if [ ! -f "sites.txt" ]; then
  echo "sites.txt not found in current directory"
  exit 1
fi

# Track if any migration failed
MIGRATION_FAILED=0

while IFS= read -r site || [[ -n "$site" ]]; do
  [[ -z "${site// }" ]] && continue
  site=$(echo "$site" | xargs)
  echo "Processing site: $site"
  echo "About to run: ./migrate_site.sh $site"
  if ./migrate_site.sh $site; then
    echo "Successfully processed: $site"
  else
    echo "Failed to process: $site (exit code: $?)"
    MIGRATION_FAILED=1
  fi
done < "sites.txt"

echo "Finished processing all sites from sites.txt"

# Exit with error if any migration failed
if [ $MIGRATION_FAILED -eq 1 ]; then
  echo "ERROR: One or more migrations failed!"
  exit 1
fi

exit 0