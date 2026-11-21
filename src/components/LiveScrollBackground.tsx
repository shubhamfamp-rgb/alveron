import { useEffect, useRef } from 'react';

export function LiveScrollBackground() {
  const layerARef = useRef<HTMLDivElement>(null);
  const layerBRef = useRef<HTMLDivElement>(null);
  const layerCRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let rafId = 0;
    const update = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.min(1, Math.max(0, window.scrollY / maxScroll));

      if (layerARef.current) {
        layerARef.current.style.transform = `translate3d(${(p * -6).toFixed(2)}%, ${(p * 10).toFixed(2)}%, 0)`;
        layerARef.current.style.opacity = (0.72 - p * 0.28).toFixed(3);
      }
      if (layerBRef.current) {
        layerBRef.current.style.transform = `translate3d(${(p * 8).toFixed(2)}%, ${(-p * 12).toFixed(2)}%, 0)`;
        layerBRef.current.style.opacity = (0.28 + Math.sin(p * Math.PI) * 0.45).toFixed(3);
      }
      if (layerCRef.current) {
        layerCRef.current.style.transform = `translate3d(0, ${(p * -8).toFixed(2)}%, 0)`;
        layerCRef.current.style.opacity = (0.12 + p * 0.52).toFixed(3);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#FAFAFA]"
    >
      <div
        ref={layerARef}
        className="absolute -top-1/4 -left-1/4 h-[85vh] w-[85vw] rounded-full will-change-transform"
        style={{
          background:
            'radial-gradient(circle at 40% 40%, rgba(226, 232, 240, 0.72) 0%, rgba(245, 245, 247, 0.25) 55%, transparent 75%)',
        }}
      />
      <div
        ref={layerBRef}
        className="absolute top-1/4 -right-1/4 h-[80vh] w-[80vw] rounded-full will-change-transform"
        style={{
          background:
            'radial-gradient(circle at 55% 45%, rgba(0, 113, 227, 0.08) 0%, rgba(219, 226, 238, 0.32) 45%, transparent 72%)',
        }}
      />
      <div
        ref={layerCRef}
        className="absolute -bottom-1/4 left-1/4 h-[75vh] w-[75vw] rounded-full will-change-transform"
        style={{
          background:
            'radial-gradient(circle at 50% 60%, rgba(232, 227, 218, 0.65) 0%, rgba(244, 244, 246, 0.2) 50%, transparent 75%)',
        }}
      />
    </div>
  );
}
