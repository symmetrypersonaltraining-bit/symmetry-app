'use client';

import Image from 'next/image';

interface LogoProps {
  size?: number;
  color?: string;
  className?: string;
}

// Supabase storage public URL for the Vitruvian Man logo
// Falls back to /logo.png if not yet uploaded to storage
const LOGO_URL =
  process.env.NEXT_PUBLIC_LOGO_URL ||
  'https://mkfiginpiesospsnktea.supabase.co/storage/v1/object/public/assets/logo.png';

export default function Logo({
  size = 40,
  className = '',
}: LogoProps) {
  return (
    <div
      className={`relative flex-shrink-0 rounded-full overflow-hidden ring-2 ring-white/30 ${className}`}
      style={{ width: size, height: size, background: 'rgba(255,255,255,0.08)' }}
    >
      <Image
        src={LOGO_URL}
        alt="Symmetry Personal Training"
        width={size}
        height={size}
        className="w-full h-full object-cover"
        unoptimized
        priority
        onError={(e) => {
          // Fallback to local public/logo.png if Supabase URL fails
          const img = e.currentTarget as HTMLImageElement;
          if (!img.src.includes('/logo.png')) {
            img.src = '/logo.png';
          }
        }}
      />
    </div>
  );
}
