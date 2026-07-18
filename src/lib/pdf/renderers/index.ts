import type { EditElement } from '../types';
import type { ElementRenderer, RenderContext } from './types';
import { renderText } from './text';
import { renderRaster } from './raster';
import { renderShape } from './shape';
import { renderMarkup } from './markup';
import { renderPath } from './path';
import { renderPolygon } from './polygon';
import { renderLink } from './link';

export type { RenderContext, ElementRenderer } from './types';

/**
 * Element types that are stamped onto page content via a renderer. Fields are
 * NOT drawn this way — they are authored as real AcroForm widgets by the build
 * rebuild — so they are excluded from the registry.
 */
type StampType = Exclude<EditElement['type'], 'field'>;

/**
 * Registry mapping each stamp element `type` to its renderer. To add a new
 * stamp type (e.g. a shape), write a renderer module and add one entry here —
 * no existing renderer or `buildPdf` needs to change.
 *
 * The casts are safe: each entry is keyed by the discriminant it handles.
 */
const registry: Record<StampType, ElementRenderer> = {
	text: renderText as ElementRenderer,
	signature: renderRaster as ElementRenderer,
	image: renderRaster as ElementRenderer,
	shape: renderShape as ElementRenderer,
	markup: renderMarkup as ElementRenderer,
	path: renderPath as ElementRenderer,
	polygon: renderPolygon as ElementRenderer,
	link: renderLink as ElementRenderer
};

/**
 * Render one stamp element by dispatching on its `type`. Field elements must be
 * handled by the caller (the build rebuild) and never reach this function.
 */
export function renderElement(
	ctx: RenderContext,
	element: Exclude<EditElement, { type: 'field' }>
): void | Promise<void> {
	return registry[element.type](ctx, element);
}
