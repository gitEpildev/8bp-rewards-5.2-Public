// Lightweight client to auto-report module activity
import axios from 'axios';

// Build heartbeat URL correctly - prevent path duplication
function getHeartbeatUrl(): string {
  if (process.env.HEARTBEAT_URL) {
    return process.env.HEARTBEAT_URL;
  }
  const publicUrl = process.env.PUBLIC_URL || 'http://localhost:2600';
  // Remove any trailing slashes and ensure we don't duplicate /8bp-rewards
  const base = publicUrl.replace(/\/+$/, '').replace(/\/8bp-rewards\/?$/, '');
  return `${base}/8bp-rewards/api/heartbeat/beat`;
}

const HEARTBEAT_URL = getHeartbeatUrl();
const DISABLE_HEARTBEAT = process.env.DISABLE_HEARTBEAT === 'true';

type Options = { service?: string };

export function initModuleHeartbeat(currentModule: NodeModule, options?: Options) {
	if (DISABLE_HEARTBEAT) return;
	const filePath = currentModule?.filename || 'unknown';
	const moduleId = currentModule?.id || filePath;
	const processId = process.pid;
	const service = options?.service;

	async function sendBeat() {
		try {
			await axios.post(HEARTBEAT_URL, { moduleId, filePath, processId, service }, { timeout: 2000 });
		} catch {
			// swallow errors, no crash
		}
	}

	// immediate beat and interval
	sendBeat();
	const intervalMs = Math.max(5000, parseInt(process.env.HEARTBEAT_INTERVAL_MS || '5000', 10));
	const timer = setInterval(sendBeat, intervalMs);

	// stop on exit
	process.on('exit', () => clearInterval(timer));
}




