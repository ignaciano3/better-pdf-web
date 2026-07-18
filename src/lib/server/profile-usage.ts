import { CAPS } from './rate-limit';
import type { Plan } from './plan';

/**
 * Map a plan + used-count onto a display view. `limit` is null when the plan's
 * cap is unbounded (pro/root, modelled as Infinity in CAPS).
 */
export function usageView(plan: Plan, used: number): { used: number; limit: number | null } {
	const cap = CAPS[plan === 'root' ? 'root' : plan === 'pro' ? 'pro' : 'free'];
	return { used, limit: Number.isFinite(cap) ? cap : null };
}
