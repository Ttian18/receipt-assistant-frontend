import { useState } from 'react';
import { cn } from '../lib/utils';

/**
 * Tiny map thumbnail for row icons (#96). Fetches a cached PNG from
 * the backend's `GET /v1/places/:id/map` proxy. Skeleton placeholder
 * while loading; falls back to the parent's category-icon path if the
 * image errors (e.g. place row deleted server-side after the
 * transaction was already in the list).
 *
 * The image is square; the caller controls outer dimensions via
 * `size`. Backend serves 256×256 @2× scale so it stays crisp even at
 * the 64px ledger row dimension.
 */
interface PlaceThumbnailProps {
  src: string;
  alt?: string;
  size?: number;
  className?: string;
  /** Render fallback when the image fails to load. */
  fallback?: React.ReactNode;
}

export function PlaceThumbnail({
  src,
  alt = '',
  size = 48,
  className,
  fallback,
}: PlaceThumbnailProps) {
  const [errored, setErrored] = useState(false);

  if (errored && fallback) {
    return <>{fallback}</>;
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[12px] bg-[var(--color-paper-deep)]/40',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        onError={() => setErrored(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
