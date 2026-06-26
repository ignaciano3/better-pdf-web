import type { ImageElement, SignatureElement } from '../types';
import type { ElementRenderer } from './types';

/**
 * Embed and stamp a raster element (signature or uploaded image). The element's
 * `y` is its top edge, so the PDF bottom edge sits at `pageHeight - y - height`.
 * Transparent PNGs keep their alpha as a soft mask automatically — no white box
 * over underlying content. Undecodable bytes (e.g. a CMYK JPEG the wasm decoder
 * rejects) skip the element rather than failing the whole export.
 */
export const renderRaster: ElementRenderer<SignatureElement | ImageElement> = async (
	{ doc, page, pageHeight },
	element
) => {
	let image;
	try {
		image =
			element.format === 'png'
				? await doc.embedPng(element.image)
				: await doc.embedJpg(element.image);
	} catch {
		return;
	}
	page.drawImage(image, {
		x: element.x,
		y: pageHeight - element.y - element.height,
		width: element.width,
		height: element.height,
		...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
		...(element.rotate !== undefined ? { rotate: element.rotate } : {}),
		...(element.xSkew !== undefined ? { xSkew: element.xSkew } : {}),
		...(element.ySkew !== undefined ? { ySkew: element.ySkew } : {})
	});
};
