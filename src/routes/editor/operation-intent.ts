/**
 * Maps the `?operation=` deep-link value (from home CTAs and the SEO tool
 * landing pages) to what the editor should do: start blank, open the file
 * picker, and/or run a one-shot intent after the PDF loads.
 */

export type PostLoadIntent = 'merge' | 'split' | 'sign' | 'watermark';

export interface OperationPlan {
	/** `?operation=new` — skip the empty state and start a blank document. */
	startBlank: boolean;
	/** Open the upload file picker immediately. */
	openPicker: boolean;
	/** One-shot action to run once the chosen PDF has loaded. */
	intent: PostLoadIntent | null;
}

const PICKER_OPS = new Set(['upload', 'fill', 'edit', 'merge', 'split', 'sign', 'watermark']);
const INTENT_OPS = new Set<PostLoadIntent>(['merge', 'split', 'sign', 'watermark']);

export function planOperation(op: string | null): OperationPlan {
	return {
		startBlank: op === 'new',
		openPicker: op !== null && PICKER_OPS.has(op),
		intent: op !== null && INTENT_OPS.has(op as PostLoadIntent) ? (op as PostLoadIntent) : null
	};
}
