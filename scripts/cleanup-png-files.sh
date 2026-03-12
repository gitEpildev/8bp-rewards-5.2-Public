#!/bin/bash

# Comprehensive PNG cleanup script
# 1. Removes duplicate confirmation screenshots (keeps latest per user per day)
# 2. Removes old screenshots (older than 7 days by default, configurable)
# 3. Removes old verification bot images (older than 60 days)
# 4. Keeps all assets, avatars, and logos

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCREENSHOT_RETENTION_DAYS=${SCREENSHOT_RETENTION_DAYS:-7}
VERIFICATION_RETENTION_DAYS=${VERIFICATION_RETENTION_DAYS:-60}
DRY_RUN=${DRY_RUN:-false}

echo "🧹 Comprehensive PNG Cleanup Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Started at: $(date -Iseconds)"
echo "Project root: ${ROOT_DIR}"
echo "Screenshot retention: ${SCREENSHOT_RETENTION_DAYS} days"
echo "Verification retention: ${VERIFICATION_RETENTION_DAYS} days"
echo "Dry run: ${DRY_RUN}"
echo ""

TOTAL_DELETED=0
TOTAL_SIZE=0

# Function to format file size
format_size() {
	local bytes=$1
	if command -v numfmt &> /dev/null; then
		numfmt --to=iec-i --suffix=B ${bytes} 2>/dev/null || echo "${bytes} bytes"
	else
		echo "${bytes} bytes"
	fi
}

# Function to get file size
get_size() {
	local file=$1
	stat -f%z "${file}" 2>/dev/null || stat -c%s "${file}" 2>/dev/null || echo 0
}

# 1. Remove duplicate confirmation screenshots (keep latest per user per day)
echo "📁 Step 1: Removing duplicate confirmation screenshots..."
CONFIRM_DIR="${ROOT_DIR}/screenshots/confirmation"
DUPLICATES_REMOVED=0
DUPLICATES_SIZE=0

if [[ -d "${CONFIRM_DIR}" ]]; then
	# Group by user ID and date
	declare -A user_date_files
	
	while IFS= read -r file; do
		[[ -z "${file}" ]] && continue
		BASENAME=$(basename "${file}")
		
		# Extract user ID and date (YYYY-MM-DD)
		if [[ "${BASENAME}" =~ confirmation-([0-9]+)-([0-9]{4})-([0-9]{2})-([0-9]{2}) ]]; then
			USER_ID="${BASH_REMATCH[1]}"
			DATE="${BASH_REMATCH[2]}-${BASH_REMATCH[3]}-${BASH_REMATCH[4]}"
			KEY="${USER_ID}|${DATE}"
			
			if [[ -z "${user_date_files[${KEY}]:-}" ]]; then
				user_date_files[${KEY}]="${file}"
			else
				# Compare timestamps, keep the latest
				if [[ "${file}" -nt "${user_date_files[${KEY}]}" ]]; then
					# Current file is newer, delete old one
					OLD_FILE="${user_date_files[${KEY}]}"
					user_date_files[${KEY}]="${file}"
					
					SIZE=$(get_size "${OLD_FILE}")
					DUPLICATES_SIZE=$((DUPLICATES_SIZE + SIZE))
					
					if [[ "${DRY_RUN}" == "true" ]]; then
						echo "      [DRY RUN] Would delete: $(basename "${OLD_FILE}")"
					else
						rm -f "${OLD_FILE}"
					fi
					DUPLICATES_REMOVED=$((DUPLICATES_REMOVED + 1))
				else
					# Old file is newer or same, delete current
					SIZE=$(get_size "${file}")
					DUPLICATES_SIZE=$((DUPLICATES_SIZE + SIZE))
					
					if [[ "${DRY_RUN}" == "true" ]]; then
						echo "      [DRY RUN] Would delete: $(basename "${file}")"
					else
						rm -f "${file}"
					fi
					DUPLICATES_REMOVED=$((DUPLICATES_REMOVED + 1))
				fi
			fi
		fi
	done < <(find "${CONFIRM_DIR}" -type f -name "confirmation-*.png" 2>/dev/null)
	
	if [[ ${DUPLICATES_REMOVED} -gt 0 ]]; then
		echo "   ✓ Removed ${DUPLICATES_REMOVED} duplicate files ($(format_size ${DUPLICATES_SIZE}))"
	else
		echo "   ✓ No duplicates found"
	fi
	TOTAL_DELETED=$((TOTAL_DELETED + DUPLICATES_REMOVED))
	TOTAL_SIZE=$((TOTAL_SIZE + DUPLICATES_SIZE))
else
	echo "   ⏭️  Directory not found"
fi

# 2. Remove old screenshots
echo ""
echo "📁 Step 2: Removing screenshots older than ${SCREENSHOT_RETENTION_DAYS} days..."
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

OLD_REMOVED=0
OLD_SIZE=0

for dir in "${SCREENSHOT_DIRS[@]}"; do
	TARGET="${ROOT_DIR}/${dir}"
	[[ ! -d "${TARGET}" ]] && continue
	
	OLD_FILES=$(find "${TARGET}" -type f -name '*.png' -mtime +${SCREENSHOT_RETENTION_DAYS} 2>/dev/null || true)
	
	while IFS= read -r file; do
		[[ -z "${file}" ]] && continue
		[[ ! -f "${file}" ]] && continue
		
		SIZE=$(get_size "${file}")
		OLD_SIZE=$((OLD_SIZE + SIZE))
		
		if [[ "${DRY_RUN}" == "true" ]]; then
			echo "      [DRY RUN] Would delete: ${dir}/$(basename "${file}")"
		else
			rm -f "${file}"
		fi
		OLD_REMOVED=$((OLD_REMOVED + 1))
	done <<< "${OLD_FILES}"
done

if [[ ${OLD_REMOVED} -gt 0 ]]; then
	echo "   ✓ Removed ${OLD_REMOVED} old files ($(format_size ${OLD_SIZE}))"
else
	echo "   ✓ No old files found"
fi
TOTAL_DELETED=$((TOTAL_DELETED + OLD_REMOVED))
TOTAL_SIZE=$((TOTAL_SIZE + OLD_SIZE))

# 3. Remove old verification bot images
echo ""
echo "📁 Step 3: Removing verification images older than ${VERIFICATION_RETENTION_DAYS} days..."
VERIFY_DIR="${ROOT_DIR}/services/verification-bot/verifications"
VERIFY_REMOVED=0
VERIFY_SIZE=0

if [[ -d "${VERIFY_DIR}" ]]; then
	OLD_VERIFY=$(find "${VERIFY_DIR}" -type f -name "*.png" -mtime +${VERIFICATION_RETENTION_DAYS} 2>/dev/null || true)
	
	while IFS= read -r file; do
		[[ -z "${file}" ]] && continue
		[[ ! -f "${file}" ]] && continue
		
		SIZE=$(get_size "${file}")
		VERIFY_SIZE=$((VERIFY_SIZE + SIZE))
		
		if [[ "${DRY_RUN}" == "true" ]]; then
			echo "      [DRY RUN] Would delete: $(basename "${file}")"
		else
			rm -f "${file}"
		fi
		VERIFY_REMOVED=$((VERIFY_REMOVED + 1))
	done <<< "${OLD_VERIFY}"
	
	if [[ ${VERIFY_REMOVED} -gt 0 ]]; then
		echo "   ✓ Removed ${VERIFY_REMOVED} old verification images ($(format_size ${VERIFY_SIZE}))"
	else
		echo "   ✓ No old verification images found"
	fi
	TOTAL_DELETED=$((TOTAL_DELETED + VERIFY_REMOVED))
	TOTAL_SIZE=$((TOTAL_SIZE + VERIFY_SIZE))
else
	echo "   ⏭️  Directory not found"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "${DRY_RUN}" == "true" ]]; then
	echo "🔍 DRY RUN COMPLETE"
	echo "   Would delete: ${TOTAL_DELETED} files"
	echo "   Would free: $(format_size ${TOTAL_SIZE})"
	echo ""
	echo "   Breakdown:"
	echo "   - Duplicates: ${DUPLICATES_REMOVED} files ($(format_size ${DUPLICATES_SIZE}))"
	echo "   - Old screenshots: ${OLD_REMOVED} files ($(format_size ${OLD_SIZE}))"
	echo "   - Old verifications: ${VERIFY_REMOVED} files ($(format_size ${VERIFY_SIZE}))"
else
	echo "✅ Cleanup complete!"
	echo "   Deleted: ${TOTAL_DELETED} files"
	echo "   Freed: $(format_size ${TOTAL_SIZE})"
	echo ""
	echo "   Breakdown:"
	echo "   - Duplicates: ${DUPLICATES_REMOVED} files ($(format_size ${DUPLICATES_SIZE}))"
	echo "   - Old screenshots: ${OLD_REMOVED} files ($(format_size ${OLD_SIZE}))"
	echo "   - Old verifications: ${VERIFY_REMOVED} files ($(format_size ${VERIFY_SIZE}))"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
