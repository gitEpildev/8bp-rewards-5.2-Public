export type UserRole = 'Owner' | 'Admin' | 'Member';

/**
 * Get user role based on Discord ID
 * Role hierarchy: Owner > Admin > Member
 * @param discordId - Discord user ID
 * @returns User role
 */
export function getUserRole(discordId: string): UserRole {
	const vpsOwners = process.env.VPS_OWNERS?.split(',').map(id => id.trim()) || [];
	if (vpsOwners.includes(discordId)) {
		return 'Owner';
	}
	
	const allowedAdmins = process.env.ALLOWED_ADMINS?.split(',').map(id => id.trim()) || [];
	if (allowedAdmins.includes(discordId)) {
		return 'Admin';
	}
	
	return 'Member';
}











