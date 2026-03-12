// Frontend heartbeat: report loaded assets/modules periodically
import axios from 'axios';

// Build heartbeat URL correctly - use current window location to avoid path duplication
function getHeartbeatUrl(): string {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.host;
    // Use the same path structure as other API calls
    return `${protocol}//${host}/8bp-rewards/api/heartbeat/beat`;
  }
  // Fallback for SSR/build time
  const publicBase = (window as any).__PUBLIC_URL__ || (process.env.PUBLIC_URL || '');
  // Remove any trailing slashes and ensure we don't duplicate /8bp-rewards
  const base = publicBase.replace(/\/+$/, '').replace(/\/8bp-rewards\/?$/, '');
  return `${base}/8bp-rewards/api/heartbeat/beat`;
}

const HEARTBEAT_URL = getHeartbeatUrl();
const PROCESS_ID = `browser-${Math.random().toString(36).slice(2)}`;

function collectLoadedAssets(): string[] {
	const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]) || [];
	const urls = resources
		.filter(r => r.initiatorType === 'script' || r.initiatorType === 'link')
		.map(r => r.name)
		.filter(u => /\/8bp-rewards\/.+\.(js|css)(\?|$)/.test(u));
	// Dedupe
	return Array.from(new Set(urls)).slice(0, 2000);
}

async function sendBeats() {
	const assets = collectLoadedAssets();
	const now = Date.now();
	// Send a compact heartbeat per asset (batched via Promise.all, swallow errors)
	await Promise.all(
		assets.map((filePath) =>
			axios.post(HEARTBEAT_URL, {
				moduleId: filePath,
				filePath,
				processId: PROCESS_ID,
				service: 'frontend'
			}, { timeout: 1500 }).catch(() => {})
		)
	);
}

export function initFrontendHeartbeat() {
	// initial tiny delay to allow early chunks to register
	setTimeout(sendBeats, 1500);
	const intervalMs = Math.max(5000, parseInt((window as any).HEARTBEAT_INTERVAL_MS || '5000', 10));
	setInterval(sendBeats, intervalMs);
}




