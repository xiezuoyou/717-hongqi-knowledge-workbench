import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import './MagicBento.css';

const DEFAULT_SPOTLIGHT_RADIUS = 260;
const DEFAULT_GLOW_COLOR = '79, 124, 255';
const MOBILE_BREAKPOINT = 768;

function calculateSpotlightValues(radius) {
  return {
    proximity: radius * 0.5,
    fadeDistance: radius * 0.75,
  };
}

function updateCardGlowProperties(card, mouseX, mouseY, glow, radius) {
  const rect = card.getBoundingClientRect();
  const relativeX = ((mouseX - rect.left) / rect.width) * 100;
  const relativeY = ((mouseY - rect.top) / rect.height) * 100;

  card.style.setProperty('--glow-x', `${relativeX}%`);
  card.style.setProperty('--glow-y', `${relativeY}%`);
  card.style.setProperty('--glow-intensity', glow.toString());
  card.style.setProperty('--glow-radius', `${radius}px`);
}

function useMobileDetection() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

function GlobalSpotlight({
  gridRef,
  disableAnimations = false,
  enabled = true,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  glowColor = DEFAULT_GLOW_COLOR,
}) {
  const spotlightRef = useRef(null);

  useEffect(() => {
    if (disableAnimations || !gridRef?.current || !enabled) return undefined;

    const spotlight = document.createElement('div');
    spotlight.className = 'magic-global-spotlight';
    spotlight.style.cssText = `
      position: fixed;
      width: 620px;
      height: 620px;
      border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle,
        rgba(${glowColor}, 0.11) 0%,
        rgba(${glowColor}, 0.055) 18%,
        rgba(${glowColor}, 0.025) 38%,
        transparent 68%
      );
      z-index: 200;
      opacity: 0;
      transform: translate(-50%, -50%);
      mix-blend-mode: screen;
    `;
    document.body.appendChild(spotlight);
    spotlightRef.current = spotlight;

    const handleMouseMove = (event) => {
      if (!spotlightRef.current || !gridRef.current) return;

      const rect = gridRef.current.getBoundingClientRect();
      const mouseInside = event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;
      const cards = gridRef.current.querySelectorAll('.magic-bento-card');

      if (!mouseInside) {
        gsap.to(spotlightRef.current, { opacity: 0, duration: 0.25, ease: 'power2.out' });
        cards.forEach((card) => card.style.setProperty('--glow-intensity', '0'));
        return;
      }

      const { proximity, fadeDistance } = calculateSpotlightValues(spotlightRadius);
      let minDistance = Infinity;

      cards.forEach((card) => {
        const cardRect = card.getBoundingClientRect();
        const centerX = cardRect.left + cardRect.width / 2;
        const centerY = cardRect.top + cardRect.height / 2;
        const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY)
          - Math.max(cardRect.width, cardRect.height) / 2;
        const effectiveDistance = Math.max(0, distance);
        minDistance = Math.min(minDistance, effectiveDistance);

        let glowIntensity = 0;
        if (effectiveDistance <= proximity) {
          glowIntensity = 1;
        } else if (effectiveDistance <= fadeDistance) {
          glowIntensity = (fadeDistance - effectiveDistance) / (fadeDistance - proximity);
        }

        updateCardGlowProperties(card, event.clientX, event.clientY, glowIntensity, spotlightRadius);
      });

      gsap.to(spotlightRef.current, {
        left: event.clientX,
        top: event.clientY,
        opacity: minDistance <= fadeDistance ? 0.7 : 0,
        duration: 0.16,
        ease: 'power2.out',
      });
    };

    const handleMouseLeave = () => {
      gridRef.current?.querySelectorAll('.magic-bento-card').forEach((card) => {
        card.style.setProperty('--glow-intensity', '0');
      });
      if (spotlightRef.current) {
        gsap.to(spotlightRef.current, { opacity: 0, duration: 0.25, ease: 'power2.out' });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      spotlightRef.current?.parentNode?.removeChild(spotlightRef.current);
    };
  }, [disableAnimations, enabled, glowColor, gridRef, spotlightRadius]);

  return null;
}

export function MagicBentoGrid({
  children,
  className = '',
  enableSpotlight = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  glowColor = DEFAULT_GLOW_COLOR,
}) {
  const gridRef = useRef(null);
  const isMobile = useMobileDetection();

  return (
    <div
      ref={gridRef}
      className={`magic-bento-scope ${className}`}
      style={{ '--glow-color': glowColor }}
    >
      <GlobalSpotlight
        gridRef={gridRef}
        enabled={enableSpotlight}
        disableAnimations={disableAnimations || isMobile}
        spotlightRadius={spotlightRadius}
        glowColor={glowColor}
      />
      {children}
    </div>
  );
}

export function MagicBentoCard({
  as: Tag = 'div',
  children,
  className = '',
  glowColor = DEFAULT_GLOW_COLOR,
  ...props
}) {
  const cardRef = useRef(null);

  return (
    <Tag
      ref={cardRef}
      className={`magic-bento-card ${className}`}
      style={{ '--glow-color': glowColor }}
      {...props}
    >
      {children}
    </Tag>
  );
}
