/**
 * Conditional logger that only logs in development mode
 * In production, most logs are suppressed for performance
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
	/**
	 * Debug-level logging (only in development)
	 */
	debug: (message: string, ...args: any[]) => {
		if (isDevelopment) {
			console.log(message, ...args);
		}
	},

	/**
	 * Info-level logging (only in development)
	 */
	info: (message: string, ...args: any[]) => {
		if (isDevelopment) {
			console.log(message, ...args);
		}
	},

	/**
	 * Warning-level logging (always logged)
	 */
	warn: (message: string, ...args: any[]) => {
		console.warn(message, ...args);
	},

	/**
	 * Error-level logging (always logged)
	 */
	error: (message: string, ...args: any[]) => {
		console.error(message, ...args);
	}
};








