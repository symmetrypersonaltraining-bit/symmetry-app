import AnatomyPreview from './AnatomyPreview';

// Public, no-auth preview of the anatomy model — open on any device to see it.
export const metadata = { title: 'Symmetry — Anatomy Preview' };

export default function AnatomyPreviewPage() {
  return <AnatomyPreview />;
}
