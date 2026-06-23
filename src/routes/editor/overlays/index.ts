import type { Component } from 'svelte';
import type { EditElement } from '$lib/pdf/types';
import type { EditorState } from '../editor.svelte';
import TextOverlay from './TextOverlay.svelte';
import RasterOverlay from './RasterOverlay.svelte';

/** Props every overlay component receives. */
export interface OverlayProps {
	el: EditElement;
	editor: EditorState;
}

/**
 * Registry mapping each element `type` to the component that renders its
 * interactive overlay on the canvas. New element types add a component and one
 * entry here — Canvas does not change.
 */
const registry: Record<EditElement['type'], Component<OverlayProps>> = {
	text: TextOverlay,
	signature: RasterOverlay,
	image: RasterOverlay
};

export function overlayFor(type: EditElement['type']): Component<OverlayProps> {
	return registry[type];
}
