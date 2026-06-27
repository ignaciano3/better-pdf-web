import type { EditElement } from '$lib/pdf/types';
import type { EditorState } from '../editor.svelte';

/** Props every overlay component receives. */
export interface OverlayProps {
	el: EditElement;
	editor: EditorState;
	/** Read-only render for the page thumbnail: no focus-grab, no editing. */
	preview?: boolean;
}
