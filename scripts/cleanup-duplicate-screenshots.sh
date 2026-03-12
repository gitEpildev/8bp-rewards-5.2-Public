#!/bin/bash

# Cleanup script to remove duplicate screenshots
# For each user, keeps only the most recent screenshot per day
# Also removes old verification bot images (older than 60 days)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFICATION_RETENTION_DAYS=${VERIFICATION_RETENTION_DAYS:-60}
DRY_RUN=${DRY_RUN:-false}

echo "🧹 Duplicate PNG Cleanup Script started at $(date -Iseconds)"
echo "Project root: ${ROOT_DIR}"
echo "Dry run: ${DRY_RUN}"

TOTAL_DELETED=0
TOTAL_SIZE=0

# Function to format file size
format_size() {
	local bytes=$1
	if command -v numfmt &> /dev/null; then
		numfmt --to=iec-i --suffix=B ${bytes}
	else
		echo "${bytes} bytes"
	fi
}

# Process confirmation screenshots - keep only latest per user per day
echo ""
echo "📁 Processing confirmation screenshots (removing duplicates)..."
CONFIRM_DIR="${ROOT_DIR}/screenshots/confirmation"
if [[ -d "${CONFIRM_DIR}" ]]; then
	# Group files by user ID and date, keep only the latest for each group
	while IFS= read -r user_date; do
		# Extract user ID and date (YYYY-MM-DD)
		USER_ID=$(echo "${user_date}" | cut -d'|' -f1)
		DATE=$(echo "${user_date}" | cut -d'|' -f2)
		
		# Find all files for this user on this date
		FILES=$(find "${CONFIRM_DIR}" -type f -name "confirmation-${USER_ID}-*${DATE}*.png" | sort)
		FILE_COUNT=$(echo "${FILES}" | grep -v '^$' | wc -l)
		
		if [[ ${FILE_COUNT} -le 1 ]]; then
			continue
		fi
		
		# Keep the latest file (last in sorted list), delete others
		KEEP_FILE=""
		DELETE_FILES=()
		
		while IFS= read -r file; do
			[[ -z "${file}" ]] && continue
			if [[ -z "${KEEP_FILE}" ]]; then
				KEEP_FILE="${file}"
			else
				DELETE_FILES+=("${file}")
			fi
		done <<< "${FILES}"
		
		# Delete duplicate files
		for file in "${DELETE_FILES[@]}"; do
			if [[ -f "${file}" ]]; then
				SIZE=$(stat -f%z "${file}" 2>/dev/null || stat -c%s "${file}" 2>/dev/null || echo 0)
				TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
				
				if [[ "${DRY_RUN}" == "true" ]]; then
					echo "      [DRY RUN] Would delete duplicate: $(basename "${file}")"
				else
					rm -f "${file}"
				fi
				TOTAL_DELETED=$((TOTAL_DELETED + 1))
			fi
		done
	done < <(find "${CONFIRM_DIR}" -type f -name "confirmation-*.png" -exec basename {} \; | \
		sed 's/confirmation-\([0-9]*\)-\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\).*/\1|\2/' | \
		sort -u)
else
	echo "   ⏭️  Directory not found"
fi

# Clean up old verification bot images
echo ""
echo "📁 Processing verification bot images (older than ${VERIFICATION_RETENTION_DAYS} days)..."
VERIFY_DIR="${ROOT_DIR}/services/verification-bot/verifications"
if [[ -d "${VERIFY_DIR}" ]]; then
	OLD_VERIFY=$(find "${VERIFY_DIR}" -type f -name "*.png" -mtime +${VERIFICATION_RETENTION_DAYS} 2>/dev/null || true)
	
	if [[ -n "${OLD_VERIFY}" ]]; then
		while IFS= read -r file; do
			[[ -z "${file}" ]] && continue
			if [[ -f "${file}" ]]; then
				SIZE=$(stat -f%z "${file}" 2>/dev/null || stat -c%s "${file}" 2>/dev/null || echo 0)
				TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
				
				if [[ "${DRY_RUN}" == "true" ]]; then
					echo "      [DRY RUN] Would delete old verification: $(basename "${file}")"
				else
					rm -f "${file}"
				fi
				TOTAL_DELETED=$((TOTAL_DELETED + 1))
			fi
		done <<< "${OLD_VERIFY}"
	fi
else
	echo "   ⏭️  Directory not found"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "${DRY_RUN}" == "true" ]]; then
	echo "🔍 DRY RUN COMPLETE"
	echo "   Would delete: ${TOTAL_DELETED} files"
	echo "   Would free: $(format_size ${TOTAL_SIZE})"
else
	echo "✅ Cleanup complete!"
	echo "   Deleted: ${TOTAL_DELETED} files"
	echo "   Freed: $(format_size ${TOTAL_SIZE})"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
