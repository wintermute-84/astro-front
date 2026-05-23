export function initReveal() {
  const reveals = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.15 }
  );
  reveals.forEach((el) => observer.observe(el));
}

export function initParallax() {
  const layers = document.querySelectorAll<HTMLElement>('[data-parallax]');
  if (!layers.length) return;

  const onScroll = () => {
    layers.forEach((layer) => {
      const rect = layer.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const center = rect.top + rect.height / 2;
      const offset = (center - window.innerHeight / 2) * 0.05;
      layer.style.transform = `translateY(${offset}px) scale(1.1)`;
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
