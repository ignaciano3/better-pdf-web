import type { Component } from 'svelte';
import type { EditElement } from '$lib/pdf/types';
import type { OverlayProps } from './types';
import TextOverlay from './TextOverlay.svelte';
import RasterOverlay from './RasterOverlay.svelte';
import ShapeOverlay from './ShapeOverlay.svelte';
import MarkupOverlay from './MarkupOverlay.svelte';
import FieldOverlay from './FieldOverlay.svelte';
import PathOverlay from './PathOverlay.svelte';
import PolygonOverlay from './PolygonOverlay.svelte';
import LinkOverlay from './LinkOverlay.svelte';

export type { OverlayProps };

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
	markup: MarkupOverlay,
	path: PathOverlay,
	polygon: PolygonOverlay,
	link: LinkOverlay,
	field: FieldOverlay
};

export function overlayFor(type: EditElement['type']): Component<OverlayProps> {
	return registry[type];
}
