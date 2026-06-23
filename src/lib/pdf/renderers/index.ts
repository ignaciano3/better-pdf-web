import type { EditElement } from '../types';
import type { ElementRenderer, RenderContext } from './types';
import { renderText } from './text';
import { renderRaster } from './raster';
import { renderShape } from './shape';

export type { RenderContext, ElementRenderer } from './types';

/**
 * Registry mapping each element `type` to its renderer. To add a new element
 * type (e.g. a shape), write a renderer module and add one entry here — no
 * existing renderer or `buildPdf` needs to change.
 *
 * The casts are safe: each entry is keyed by the discriminant it handles.
 */
const registry: Record<EditElement['type'], ElementRenderer> = {
	text: renderText as ElementRenderer,
	signature: renderRaster as ElementRenderer,
	image: renderRaster as ElementRenderer,
	shape: renderShape as ElementRenderer
};

/** Render one element by dispatching on its `type`. */
export function renderElement(ctx: RenderContext, element: EditElement): void | Promise<void> {
	return registry[element.type](ctx, element);
}
