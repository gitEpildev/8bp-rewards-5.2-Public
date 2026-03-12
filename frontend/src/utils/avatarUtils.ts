/**
 * Generate Discord avatar URL from Discord ID and avatar hash
 * Handles both custom avatars and default Discord avatars
 * 
 * @param discordId - Discord user ID (must be a string)
 * @param avatarHash - Discord avatar hash (can be null for default avatars)
 * @returns Discord avatar URL or null if discordId is invalid
 */
export function getDiscordAvatarUrl(
	discordId: string | null | undefined,
	avatarHash: string | null | undefined
): string | null {
	// Validate Discord ID
	if (!discordId) {
		console.warn('Invalid Discord ID for avatar URL generation - discordId is null/undefined', {
			discordId,
			type: typeof discordId
		});
		return null;
	}

	// Convert Discord ID to string if needed (handle numbers)
	const discordIdStr = String(discordId).trim();
	if (!discordIdStr || discordIdStr === 'undefined' || discordIdStr === 'null') {
		console.warn('Invalid Discord ID string for avatar URL generation', {
			discordId,
			discordIdStr
		});
		return null;
	}

	// If avatar hash exists (not null/undefined/empty), use custom avatar
	if (avatarHash && avatarHash.trim().length > 0 && avatarHash !== 'null' && avatarHash !== 'undefined') {
		const avatarHashStr = avatarHash.trim();
		const url = `https://cdn.discordapp.com/avatars/${discordIdStr}/${avatarHashStr}.png`;
		return url;
	}

	// Otherwise, use default Discord avatar
	// Default avatars are determined by user's discriminator (discordId % 5 for new system)
	// Parse the Discord ID as a number for the modulo operation
	const discordIdNum = parseInt(discordIdStr, 10);
	if (isNaN(discordIdNum)) {
		console.error('Failed to parse Discord ID as number for default avatar', {
			discordId,
			discordIdStr
		});
		// Fallback: use index 0 for default avatar if parsing fails
		return `https://cdn.discordapp.com/embed/avatars/0.png`;
	}

	const defaultAvatarIndex = discordIdNum % 5;
	return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
}








