/**
 * Content registry for the per-tool SEO landing pages (/merge-pdf, ...).
 * Drives the [tool] route, the sitemap, home-page cross-links and the
 * footer. Adding a tool page = adding one entry here.
 *
 * Copy rules (see docs/superpowers/specs/2026-07-09-seo-tool-landing-pages-design.md):
 * processing is now fully client-side — editing, building and export all run
 * in the browser, so document bytes never leave the device. The honest, strong
 * claim is "your files never leave your device". The server receives only an
 * anonymous usage count (free-tier limits) and, on export failure, an
 * anonymous error report — never document contents.
 */

export interface ToolStep {
	title: string;
	text: string;
}

export interface ToolFaq {
	q: string;
	a: string;
}

export type ToolOperation = 'fill' | 'sign' | 'merge' | 'split' | 'watermark' | 'edit';

export interface ToolPage {
	/** URL path segment, e.g. `merge-pdf`. */
	slug: string;
	/** Editor deep-link value for `/editor?operation=`. */
	operation: ToolOperation;
	/** Full <title> / OG title. */
	title: string;
	metaDescription: string;
	h1: string;
	/** One-paragraph hero value prop. */
	heroCopy: string;
	/** One-liner for cross-link cards. */
	cardBlurb: string;
	steps: [ToolStep, ToolStep, ToolStep];
	faq: ToolFaq[];
}

const PRIVACY_FAQ: ToolFaq = {
	q: 'Are my files stored on your servers?',
	a: 'No — your files never leave your device. Editing, building and export all run in your browser, so your document is never uploaded anywhere. The only data our server receives is an anonymous usage count (to enforce free-tier limits) and, if an export fails, an anonymous error report — never your document’s contents. We never add watermarks.'
};

const COST_FAQ: ToolFaq = {
	q: 'What does it cost?',
	a: 'Nothing for everyday use. You get 2 free exports per hour without an account, or 5 per hour signed in. Pro is $6/mo (or $48/year) for unlimited exports.'
};

export const TOOLS: ToolPage[] = [
	{
		slug: 'fill-pdf-form',
		operation: 'fill',
		title: 'Fill a PDF form online, free — Better PDF Web',
		metaDescription:
			'Fill out PDF forms online for free. Text fields, checkboxes, radio buttons and dropdowns are detected automatically — complete, sign and download with no watermarks.',
		h1: 'Fill a PDF form online',
		heroCopy:
			'Upload a PDF and its form fields are detected automatically. Type into text boxes, tick checkboxes, pick from dropdowns — then download the finished file. Free, no sign-up, no watermarks.',
		cardBlurb: 'Complete text fields, checkboxes and dropdowns in any PDF form.',
		steps: [
			{
				title: 'Upload your form',
				text: 'Drop in the PDF. Fillable AcroForm fields — text, checkboxes, radios, dropdowns — are detected and made editable automatically.'
			},
			{
				title: 'Fill it in',
				text: 'Click any field and type, tick or pick. You can also add a drawn signature or extra text anywhere on the page.'
			},
			{
				title: 'Download',
				text: 'Export the completed form as a PDF. No account needed and no watermark added — ever.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'What kinds of fields can I fill?',
				a: 'Everything a standard PDF form (AcroForm) defines: single and multi-line text fields, checkboxes, radio buttons, dropdowns and list boxes. They are detected automatically when you upload.'
			},
			{
				q: 'What if my PDF has no fillable fields?',
				a: 'You can still complete it: add text boxes anywhere on the page, place checkmarks, and draw a signature — the result looks the same when you download.'
			},
			{
				q: 'Can I sign the form too?',
				a: 'Yes. Draw your signature with a mouse or finger and place it on the document before exporting.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'sign-pdf',
		operation: 'sign',
		title: 'Sign a PDF online, free — Better PDF Web',
		metaDescription:
			'Sign PDF documents online for free. Draw your signature with a mouse or finger, place it on the page, and download — no account, no watermarks.',
		h1: 'Sign a PDF online',
		heroCopy:
			'Draw your signature with a mouse, trackpad or finger, place it exactly where it belongs, and download the signed document. Free, no sign-up, no watermarks.',
		cardBlurb: 'Draw your signature and place it anywhere in the document.',
		steps: [
			{
				title: 'Upload your PDF',
				text: 'Open the document you need to sign — a contract, an approval, a permission slip. It renders right in your browser.'
			},
			{
				title: 'Draw and place your signature',
				text: 'Sketch your signature on the signature pad, then click where it should go. Resize and reposition it until it sits right.'
			},
			{
				title: 'Download the signed PDF',
				text: 'Export and send it on. The signature is embedded in the page, with no watermark added.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'Is this a certified digital signature?',
				a: 'No — it places a visual signature image on the page, which is what most everyday paperwork expects. It is not a cryptographic certificate-based signature.'
			},
			{
				q: 'Can I sign on my phone?',
				a: 'Yes. The signature pad supports touch, so drawing with a finger on a phone or tablet works well.'
			},
			{
				q: 'Can I fill in the rest of the form too?',
				a: 'Yes. Form fields in the PDF are detected automatically, and you can add text anywhere on the page alongside your signature.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'merge-pdf',
		operation: 'merge',
		title: 'Merge PDF files online, free — Better PDF Web',
		metaDescription:
			'Combine multiple PDFs into one document online, free. Append files, reorder and rotate pages, then download the merged PDF with no watermarks.',
		h1: 'Merge PDF files online',
		heroCopy:
			'Combine two or more PDFs into a single document. Append files, then drag pages into exactly the order you want before downloading. Free, no sign-up, no watermarks.',
		cardBlurb: 'Combine multiple PDFs into one document, in the order you want.',
		steps: [
			{
				title: 'Upload your first PDF',
				text: 'Open the document that should come first. It loads straight into the editor in your browser.'
			},
			{
				title: 'Append the others',
				text: 'Add each additional PDF — its pages are appended to the document. Reorder, rotate or remove pages in the Pages panel until the sequence is right.'
			},
			{
				title: 'Download the merged PDF',
				text: 'Export a single combined document. No account needed and no watermark added.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'How many PDFs can I merge?',
				a: 'You can append multiple documents up to a combined 60 MB per export — more than enough for typical contracts, scans and reports.'
			},
			{
				q: 'Can I change the page order after merging?',
				a: 'Yes. The Pages panel shows every page as a thumbnail — move pages up or down, rotate them, or delete the ones you don’t need before exporting.'
			},
			{
				q: 'Can I edit the merged document too?',
				a: 'Yes. Before exporting you can fill fields, add text, images and signatures — it’s a full editor, not just a merger.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'split-pdf',
		operation: 'split',
		title: 'Split a PDF online, free — Better PDF Web',
		metaDescription:
			'Extract or remove pages from a PDF online, free. Delete the pages you don’t need, reorder the rest, and download the result — no watermarks.',
		h1: 'Split a PDF online',
		heroCopy:
			'Pull the pages you need out of any PDF. Delete the rest, reorder what’s left, and download a clean document. Free, no sign-up, no watermarks.',
		cardBlurb: 'Extract the pages you need and drop the ones you don’t.',
		steps: [
			{
				title: 'Upload your PDF',
				text: 'Open the document. Every page appears as a thumbnail in the Pages panel.'
			},
			{
				title: 'Keep only what you need',
				text: 'Delete unwanted pages, reorder or rotate the ones you keep. The thumbnails update as you go.'
			},
			{
				title: 'Download the result',
				text: 'Export a new PDF containing just the pages you kept, in the order you arranged.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'How do I extract just a few pages?',
				a: 'Delete every page you don’t want in the Pages panel and export — the download contains only the pages you kept. To produce several outputs, repeat with the same source file.'
			},
			{
				q: 'Can I reorder or rotate pages too?',
				a: 'Yes. The Pages panel lets you move pages up and down, rotate them 90 degrees at a time, and insert blank pages.'
			},
			{
				q: 'Does splitting change the quality?',
				a: 'No. Kept pages are carried over from the original document, not re-rendered, so text and images stay exactly as they were.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'watermark-pdf',
		operation: 'watermark',
		title: 'Add a watermark to a PDF online, free — Better PDF Web',
		metaDescription:
			'Watermark a PDF online, free. Stamp text like DRAFT or CONFIDENTIAL — or your logo — across every page with adjustable opacity, then download.',
		h1: 'Add a watermark to a PDF',
		heroCopy:
			'Stamp "DRAFT", "CONFIDENTIAL" or your own text — or an image like a logo — across every page, with adjustable opacity. Free, no sign-up, and we never add watermarks of our own.',
		cardBlurb: 'Stamp text or a logo across every page, with adjustable opacity.',
		steps: [
			{
				title: 'Upload your PDF',
				text: 'Open the document you want to mark. It renders right in your browser.'
			},
			{
				title: 'Set your watermark',
				text: 'Choose text (like DRAFT) or upload an image, then tune the opacity so it reads clearly without drowning the content.'
			},
			{
				title: 'Download',
				text: 'Export the watermarked PDF. The mark is applied to every page of the document.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'Can I use an image as the watermark?',
				a: 'Yes. Upload a PNG or JPEG — your logo, a stamp — and it’s placed across the pages instead of text. You can resize it and adjust its opacity.'
			},
			{
				q: 'Does it apply to every page?',
				a: 'Yes, the watermark is stamped on every page of the exported document.'
			},
			{
				q: 'Do you add your own watermark on the free tier?',
				a: 'Never. Unlike many free PDF tools, exports are clean on every tier — the only watermark on your document is the one you choose to add.'
			},
			COST_FAQ
		]
	},
	{
		slug: 'edit-pdf',
		operation: 'edit',
		title: 'Edit a PDF online, free — Better PDF Web',
		metaDescription:
			'Edit PDFs online, free. Add text, images, shapes, links and signatures, fill forms, and manage pages — right in your browser, with no watermarks.',
		h1: 'Edit a PDF online',
		heroCopy:
			'Add text, images, shapes, links and signatures. Fill forms, manage pages, set a watermark — a full PDF editor that runs in your browser. Free, no sign-up, no watermarks.',
		cardBlurb: 'Add text, images, shapes, links and signatures to any PDF.',
		steps: [
			{
				title: 'Upload your PDF',
				text: 'Open an existing document, or start from a blank page. Everything renders and edits right in your browser.'
			},
			{
				title: 'Make your changes',
				text: 'Add text blocks, images, shapes and links. Fill form fields, draw a signature, reorder pages — with undo/redo for every step.'
			},
			{
				title: 'Download',
				text: 'Export the finished PDF. No account needed and no watermark added.'
			}
		],
		faq: [
			PRIVACY_FAQ,
			{
				q: 'Can I change text that’s already in the PDF?',
				a: 'Not yet. You add new content on top of the existing pages — text, images, shapes, links, fields and signatures — but existing text can’t be rewritten in place.'
			},
			{
				q: 'Can I use my own fonts?',
				a: 'Yes. Embed custom TTF/OTF fonts with full Unicode coverage, including CJK scripts and symbols.'
			},
			{
				q: 'Does it work on mobile?',
				a: 'Yes. The editor supports touch, so you can edit, draw and drag pages around on phones and tablets.'
			},
			COST_FAQ
		]
	}
];

export function getTool(slug: string): ToolPage | undefined {
	return TOOLS.find((t) => t.slug === slug);
}

/** True for exactly `/<slug>` of a registered tool - used by the layout to give tool pages the full-bleed treatment. */
export function isToolPath(pathname: string): boolean {
	return TOOLS.some((t) => pathname === `/${t.slug}`);
}
