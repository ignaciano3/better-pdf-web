import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';

vi.mock('../export.remote', () => ({ exportPdf: vi.fn() }));
vi.mock('../extractFields.remote', () => ({ extractFields: vi.fn() }));

import TextOverlay from './TextOverlay.svelte';
import { EditorState } from '../editor.svelte';
import type { StandardFontName, TextElement } from '$lib/pdf/types';

function text(extra: Partial<TextElement> = {}): TextElement {
	return {
		type: 'text',
		id: 'txt',
		text: 'Hello',
		x: 10,
		y: 20,
		size: 12,
		...extra
	};
}

function styleFor(font: StandardFontName | undefined): CSSStyleDeclaration {
	const editor = new EditorState();
	const { container } = render(TextOverlay, { props: { el: text({ font }), editor } });
	return (container.querySelector('div[contenteditable]') as HTMLDivElement).style;
}

describe('TextOverlay font weight/style preview', () => {
	// Regression: the preview previously mapped only the font family and dropped
	// the -Bold/-Italic/-Oblique suffix, so picking Bold/Italic looked identical.
	it('renders Bold fonts with bold weight', () => {
		expect(styleFor('Helvetica-Bold').fontWeight).toBe('700');
	});

	it('renders Oblique fonts as italic', () => {
		expect(styleFor('Helvetica-Oblique').fontStyle).toBe('italic');
	});

	it('renders Italic fonts as italic', () => {
		expect(styleFor('Times-Italic').fontStyle).toBe('italic');
	});

	it('renders BoldItalic fonts with both weight and italic', () => {
		const style = styleFor('Times-BoldItalic');
		expect(style.fontWeight).toBe('700');
		expect(style.fontStyle).toBe('italic');
	});

	it('keeps regular fonts at normal weight and style', () => {
		const style = styleFor('Helvetica');
		expect(style.fontWeight).toBe('400');
		expect(style.fontStyle).toBe('normal');
	});

	it('defaults to normal weight and style when no font is set', () => {
		const style = styleFor(undefined);
		expect(style.fontWeight).toBe('400');
		expect(style.fontStyle).toBe('normal');
	});
});
