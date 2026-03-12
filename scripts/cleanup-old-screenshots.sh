#!/bin/bash

# Cleanup script for old PNG screenshots
# Removes screenshots older than 30 days (configurable via RETENTION_DAYS)
# Keeps verification bot images and assets

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RETENTION_DAYS=${RETENTION_DAYS:-30}
VERIFICATION_RETENTION_DAYS=${VERIFICATION_SCREENSHOT_RETENTION_DAYS:-7}
DRY_RUN=${DRY_RUN:-false}

# Backend screenshot dirs (use RETENTION_DAYS)
SCREENSHOT_DIRS=(
	"screenshots/confirmation"
	"screenshots/final-page"
	"screenshots/go-click"
	"screenshots/id-entry"
	"screenshots/login"
	"screenshots/shop-page"
	"screenshots/validation"
	"backend/screenshots"
)

# Verification-bot proof images (use VERIFICATION_SCREENSHOT_RETENTION_DAYS, default 7)
VERIFICATION_DIRS=(
	"services/verification-bot/verifications"
)

# Portable file size (GNU stat -c%s, BSD stat -f%z)
get_file_size() {
	local f="$1"
	if stat -c%s "$f" 2>/dev/null; then
		return 0
	fi
	if stat -f%z "$f" 2>/dev/null; then
		return 0
	fi
	echo 0
}

echo "🧹 PNG Cleanup Script started at $(date -Iseconds)"
echo "Project root: ${ROOT_DIR}"
echo "Retention (backend): ${RETENTION_DAYS} days"
echo "Retention (verification-bot): ${VERIFICATION_RETENTION_DAYS} days"
echo "Dry run: ${DRY_RUN}"

TOTAL_DELETED=0
TOTAL_SIZE=0

process_dir() {
	local dir="$1"
	local retention_days="$2"
	local TARGET="${ROOT_DIR}/${dir}"
	if [[ ! -d "${TARGET}" ]]; then
		echo "   ⏭️  Skipping ${dir} (directory not found)"
		return 0
	fi

	echo ""
	echo "   📁 Processing ${dir} (older than ${retention_days} days)..."
	
	OLD_FILES=$(find "${TARGET}" -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) -mtime +${retention_days} 2>/dev/null || true)
	
	if [[ -z "${OLD_FILES}" ]]; then
		echo "      ✓ No old files found"
		return 0
	fi
	
	local FILE_COUNT=0
	local DIR_SIZE=0
	
	while IFS= read -r file; do
		[[ -z "${file}" ]] && continue
		
		if [[ -f "${file}" ]]; then
			local SIZE
			SIZE=$(get_file_size "$file")
			DIR_SIZE=$((DIR_SIZE + SIZE))
			FILE_COUNT=$((FILE_COUNT + 1))
			
			if [[ "${DRY_RUN}" == "true" ]]; then
				echo "      [DRY RUN] Would delete: $(basename "${file}") ($(numfmt --to=iec-i --suffix=B ${SIZE} 2>/dev/null || echo "${SIZE} bytes"))"
			else
				rm -f "${file}"
			fi
		fi
	done <<< "${OLD_FILES}"
	
	if [[ ${FILE_COUNT} -gt 0 ]]; then
		TOTAL_DELETED=$((TOTAL_DELETED + FILE_COUNT))
		TOTAL_SIZE=$((TOTAL_SIZE + DIR_SIZE))
		
		if [[ "${DRY_RUN}" == "true" ]]; then
			echo "      📊 Would delete ${FILE_COUNT} files (${DIR_SIZE} bytes)"
		else
			local SIZE_READABLE
			SIZE_READABLE=$(numfmt --to=iec-i --suffix=B ${DIR_SIZE} 2>/dev/null || echo "${DIR_SIZE} bytes")
			echo "      ✓ Deleted ${FILE_COUNT} files (${SIZE_READABLE})"
		fi
	fi
}

for dir in "${SCREENSHOT_DIRS[@]}"; do
	process_dir "$dir" "$RETENTION_DAYS"
done

for dir in "${VERIFICATION_DIRS[@]}"; do
	process_dir "$dir" "$VERIFICATION_RETENTION_DAYS"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "${DRY_RUN}" == "true" ]]; then
	echo "🔍 DRY RUN COMPLETE"
	echo "   Would delete: ${TOTAL_DELETED} files"
	echo "   Would free: $(numfmt --to=iec-i --suffix=B ${TOTAL_SIZE} 2>/dev/null || echo "${TOTAL_SIZE} bytes")"
else
	echo "✅ Cleanup complete!"
	echo "   Deleted: ${TOTAL_DELETED} files"
	SIZE_READABLE=$(numfmt --to=iec-i --suffix=B ${TOTAL_SIZE} 2>/dev/null || echo "${TOTAL_SIZE} bytes")
	echo "   Freed: ${SIZE_READABLE}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
