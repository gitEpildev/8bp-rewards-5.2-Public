/**
 * API Configuration
 * Automatically uses the correct API URL based on environment
 */

// API Configuration - use REACT_APP_API_URL if set, otherwise detect from current location
function getApiBaseUrl(): string {
  // If REACT_APP_API_URL is set at build time, use it
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // In browser, use current window location
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.host;
    return `${protocol}//${host}/8bp-rewards/api`;
  }
  
  // Fallback for SSR/build time
  const backendPort = process.env.REACT_APP_BACKEND_PORT || '2600';
  return `http://localhost:${backendPort}/api`;
}

export const API_BASE_URL = getApiBaseUrl();

// WebSocket URL - use same origin as the current page
export const getWebSocketURL = (): string => {
  // Use the current window location to determine protocol and host
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}`;
  }
  
  // Fallback for SSR: use API_BASE_URL
  const apiUrl = API_BASE_URL.replace('/api', '');
  if (apiUrl.startsWith('https://')) {
    return apiUrl.replace('https://', 'wss://');
  } else {
    return apiUrl.replace('http://', 'ws://');
  }
};

export const WEBSOCKET_URL = getWebSocketURL();

export const API_ENDPOINTS = {
  // Base URL for direct access
  BASE_URL: API_BASE_URL.replace('/api', ''),
  
  // Auth
  AUTH_STATUS: `${API_BASE_URL}/auth/status`,
  AUTH_DISCORD: `${API_BASE_URL}/auth/discord`,
  AUTH_LOGOUT: `${API_BASE_URL}/auth/logout`,
  
  // Registration
  REGISTRATION: `${API_BASE_URL}/registration`,
  
  // Admin
  ADMIN_OVERVIEW: `${API_BASE_URL}/admin/overview`,
  ADMIN_REGISTRATIONS: `${API_BASE_URL}/admin/registrations`,
  ADMIN_CLAIM_ALL: `${API_BASE_URL}/admin/claim-all`,
  ADMIN_CLAIM_USERS: `${API_BASE_URL}/admin/claim-users`,
  ADMIN_TEST_USERS: `${API_BASE_URL}/admin/test-users`,
  ADMIN_USERS: `${API_BASE_URL}/admin/users`,
  ADMIN_CLAIM_PROGRESS: `${API_BASE_URL}/admin/claim-progress`,
  ADMIN_CLAIM_PROGRESS_BY_ID: (processId: string) => `${API_BASE_URL}/admin/claim-progress/${processId}`,
  ADMIN_CLAIM_PROGRESS_CLEANUP: `${API_BASE_URL}/admin/claim-progress/cleanup`,
  ADMIN_RESET_LEADERBOARD: `${API_BASE_URL}/admin/reset-leaderboard`,
  ADMIN_RESET_LEADERBOARD_REQUEST_ACCESS: `${API_BASE_URL}/admin/reset-leaderboard/request-access`,
  ADMIN_RESET_LEADERBOARD_VERIFY_ACCESS: `${API_BASE_URL}/admin/reset-leaderboard/verify-access`,
  ADMIN_RESET_LEADERBOARD_ACCESS_STATUS: `${API_BASE_URL}/admin/reset-leaderboard/access-status`,
  ADMIN_ACTIVE_SERVICES: `${API_BASE_URL}/admin/active-services`,
  ADMIN_HEARTBEAT_SUMMARY: `${API_BASE_URL}/admin/heartbeat/summary`,
  ADMIN_USER_COUNT: `${API_BASE_URL}/admin/user-count`,
  
  // VPS Monitor Authentication
  ADMIN_VPS_REQUEST_ACCESS: `${API_BASE_URL}/admin/vps/request-access`,
  ADMIN_VPS_VERIFY_ACCESS: `${API_BASE_URL}/admin/vps/verify-access`,
  ADMIN_VPS_ACCESS_STATUS: `${API_BASE_URL}/admin/vps/access-status`,
  
  // System Status
  STATUS: `${API_BASE_URL}/status`,
  STATUS_SCHEDULER: `${API_BASE_URL}/status/scheduler`,
  
  // VPS Monitor
  VPS_MONITOR_STATS: `${API_BASE_URL}/vps-monitor/stats`,
  
  // Leaderboard
  LEADERBOARD: `${API_BASE_URL}/leaderboard`,
  
  // Contact
  CONTACT: `${API_BASE_URL}/contact`,
  
  // Validation
  VALIDATION_REVALIDATE_USER: `${API_BASE_URL}/validation/revalidate-user`,
  VALIDATION_REVALIDATE_ALL: `${API_BASE_URL}/validation/revalidate-all-invalid`,
  VALIDATION_DEREGISTERED_USERS: `${API_BASE_URL}/validation/deregistered-users`,
  
  // Admin Deregistered Users
  ADMIN_DEREGISTERED_USER_REMOVE: (eightBallPoolId: string) => `${API_BASE_URL}/admin/deregistered-users/${eightBallPoolId}/remove`,
  
  // Admin Deregistration Requests
  ADMIN_DEREGISTRATION_REQUESTS: `${API_BASE_URL}/admin/deregistration-requests`,
  ADMIN_DEREGISTRATION_REQUEST_APPROVE: (id: string) => `${API_BASE_URL}/admin/deregistration-requests/${id}/approve`,
  ADMIN_DEREGISTRATION_REQUEST_DENY: (id: string) => `${API_BASE_URL}/admin/deregistration-requests/${id}/deny`,
  
  // Public Deregistration
  DEREGISTER: `${API_BASE_URL}/deregister`,
  ADMIN_PUBLIC_DEREGISTRATION_REQUESTS: `${API_BASE_URL}/admin/public-deregistration-requests`,
  ADMIN_PUBLIC_DEREGISTRATION_APPROVE: (id: string) => `${API_BASE_URL}/admin/public-deregistration-requests/${id}/approve`,
  ADMIN_PUBLIC_DEREGISTRATION_DENY: (id: string) => `${API_BASE_URL}/admin/public-deregistration-requests/${id}/deny`,

  // User Dashboard
  USER_LINKED_ACCOUNTS: `${API_BASE_URL}/user-dashboard/linked-accounts`,
  USER_SCREENSHOTS: `${API_BASE_URL}/user-dashboard/screenshots`,
  USER_VERIFICATION_IMAGES: `${API_BASE_URL}/user-dashboard/verification-images`,
  USER_VERIFICATION_IMAGE_VIEW: (filename: string) => `${API_BASE_URL}/user-dashboard/verification-images/view/${filename}`,
  USER_DEREGISTRATION_REQUEST: `${API_BASE_URL}/user-dashboard/deregistration-request`,
  USER_DEREGISTRATION_REQUESTS: `${API_BASE_URL}/user-dashboard/deregistration-requests`,
  USER_INFO: `${API_BASE_URL}/user-dashboard/info`,
  USER_UPDATE_USERNAME: `${API_BASE_URL}/user-dashboard/update-username`,
  USER_UPLOAD_PROFILE_IMAGE: `${API_BASE_URL}/user-dashboard/profile-image`,
  USER_UPLOAD_LEADERBOARD_IMAGE: `${API_BASE_URL}/user-dashboard/leaderboard-image`,
  USER_DELETE_PROFILE_IMAGE: `${API_BASE_URL}/user-dashboard/profile-image`,
  USER_DELETE_LEADERBOARD_IMAGE: `${API_BASE_URL}/user-dashboard/leaderboard-image`,
  USER_SELECT_8BP_AVATAR: `${API_BASE_URL}/user-dashboard/eight-ball-pool-avatar`,
  USER_REMOVE_8BP_AVATAR: `${API_BASE_URL}/user-dashboard/eight-ball-pool-avatar`,
  USER_TOGGLE_DISCORD_AVATAR: `${API_BASE_URL}/user-dashboard/profile-image/discord-toggle`,
  USER_TOGGLE_DISCORD_USERNAME: `${API_BASE_URL}/user-dashboard/username/discord-toggle`,
  USER_LIST_8BP_AVATARS: `${API_BASE_URL}/user-dashboard/8bp-avatars/list`,
  
  // User Support
  USER_SUPPORT_CREATE: `${API_BASE_URL}/user-dashboard/support/create`,
  USER_SUPPORT_TICKETS: `${API_BASE_URL}/user-dashboard/support/tickets`,
  USER_SUPPORT_TICKET_MESSAGES: (ticketId: string) => `${API_BASE_URL}/user-dashboard/support/tickets/${ticketId}/messages`,
  
  // Admin Support Tickets
  ADMIN_TICKETS: `${API_BASE_URL}/admin/tickets`,
  ADMIN_TICKET_CLOSE: (ticketId: string) => `${API_BASE_URL}/admin/tickets/${ticketId}/close`,
  ADMIN_TICKET_DELETE: (ticketId: string) => `${API_BASE_URL}/admin/tickets/${ticketId}`,
  ADMIN_TICKET_ATTACHMENT_DOWNLOAD: (ticketId: string, attachmentId: string) => `${API_BASE_URL}/admin/tickets/${ticketId}/attachments/${attachmentId}/download`,
  
  // Admin Verification Images
  ADMIN_VERIFICATION_IMAGES: `${API_BASE_URL}/admin/verification-images`,
  ADMIN_VERIFICATION_IMAGE_VIEW: (filename: string) => `${API_BASE_URL}/admin/verification-images/view/${filename}`,
  ADMIN_ASSIGN_AVATARS: `${API_BASE_URL}/admin/assign-avatars`,
};

// Helper function to build admin user block endpoint
export const getAdminUserBlockEndpoint = (eightBallPoolId: string): string => {
  return `${API_BASE_URL}/admin/users/${eightBallPoolId}/block`;
};

// Helper function to build admin registration delete endpoint  
export const getAdminRegistrationDeleteEndpoint = (eightBallPoolId: string): string => {
  return `${API_BASE_URL}/admin/registrations/${eightBallPoolId}`;
};

