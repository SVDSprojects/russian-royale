import { useEffect, useRef, useState } from 'react';

// Decode animation only while the gift is visible. Keep its real first frame
// for reduced motion and off-screen cards; never replace art with an emoji.
export function ImportedGift({
  animation,
  poster,
  name,
}: {
  animation: string;
  poster: string;
  name: string;
}) {
  const ref = useRef<HTMLPictureElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () =>
      setPlaying(
        visible &&
          !motion.matches &&
          document.documentElement.dataset.reduceMotion !== 'true' &&
          !document.hidden,
      );
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    const preferences = new MutationObserver(update);
    observer.observe(root);
    preferences.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-reduce-motion'],
    });
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      preferences.disconnect();
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return (
    <picture ref={ref} className="sdvs-imported-gift">
      <img
        src={playing ? animation : poster}
        alt={name}
        loading="lazy"
        decoding="async"
        width="512"
        height="512"
      />
    </picture>
  );
}
