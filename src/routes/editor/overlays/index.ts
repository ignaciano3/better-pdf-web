import type { Component } from 'svelte';
import type { EditElement } from '$lib/pdf/types';
import type { EditorState } from '../editor.svelte';
import TextOverlay from './TextOverlay.svelte';
import RasterOverlay from './RasterOverlay.svelte';
import ShapeOverlay from './ShapeOverlay.svelte';
import FieldOverlay from './FieldOverlay.svelte';
import PathOverlay from './PathOverlay.svelte';
import PolygonOverlay from './PolygonOverlay.svelte';
import LinkOverlay from './LinkOverlay.svelte';

/** Props every overlay component receives. */
export interface OverlayProps {
	el: EditElement;
	editor: EditorState;
	/** Read-only render for the page thumbnail: no focus-grab, no editing. */
	preview?: boolean;
}

/**
 * Registry mapping each element `type` to the component that renders its
 * interactive overlay on the canvas. New element types add a component and one
 * entry here — Canvas does not change.
 */
const registry: Record<EditElement['type'], Component<OverlayProps>> = {
	text: TextOverlay,
	signature: RasterOverlay,
	image: RasterOverlay,
	shape: ShapeOverlay,
	path: PathOverlay,
	polygon: PolygonOverlay,
	link: LinkOverlay,
	field: FieldOverlay
};

export function overlayFor(type: EditElement['type']): Component<OverlayProps> {
	return registry[type];
}
