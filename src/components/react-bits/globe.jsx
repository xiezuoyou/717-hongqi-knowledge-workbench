"use client";;
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useDeferredValue,
} from "react";
import { cn } from "@/lib/utils";

const landDotsCache = new Map();

/**
 * Efficient random sampling without full array shuffle
 * Uses Fisher-Yates partial shuffle approach
 */
function getRandomSample(arr, n) {
  const len = arr.length;
  if (n >= len) return [...arr];

  const result = [];
  const used = new Set();

  while (result.length < n) {
    const idx = Math.floor(Math.random() * len);
    if (!used.has(idx)) {
      used.add(idx);
      result.push(arr[idx]);
    }
  }

  return result;
}

/**
 * Globe - A 3D rotating globe with animated connection arcs
 *
 * Features:
 * - Interactive 3D globe with auto-rotation
 * - Animated arcs showing connections between points
 * - Land dots representing continents
 * - Pulsing rings at destination points
 * - Fully responsive and customizable
 * - Performance optimized with visibility-based animation pausing
 *
 * @example
 * ```tsx
 *
 * <Globe />
 *
 *
 * <Globe
 *   primaryColor="rgb(59, 130, 246)"
 *   neutralColor="rgb(156, 163, 175)"
 *   autoRotateSpeed={1.2}
 * />
 *
 *
 * <Globe
 *   width={800}
 *   height={800}
 *   arcCount={15}
 *   arcInterval={4000}
 * />
 * ```
 */
export const Globe = ({
  width = "auto",
  height = "auto",
  primaryColor = "rgb(59, 130, 246)",
  neutralColor = "rgb(156, 163, 175)",
  atmosphereColor,
  globeColor = "rgb(30, 30, 30)",
  showAtmosphere = true,
  autoRotateSpeed = 0.85,
  enableZoom = false,
  interactive = true,
  arcCount = 10,
  arcInterval = 6000,
  arcAnimationDuration = 2000,
  cameraAltitude = 2,
  landDotRows = 200,
  pointSize = 0.25,
  atmosphereAltitude = 0.3,
  landMapUrl = "https://assets.ot.digital/img/map.png",
  className,
  onReady,
  onGlobeClick,
  pointResolution = 4,
  globeOpacity = 1,
}) => {
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const animationIntervalRef = useRef(null);
  const animationFrameRef = useRef(null);
  const animationTimeoutsRef = useRef([]);
  const isAnimatingRef = useRef(false);
  const cleanupFnRef = useRef(null);
  const isInitializingRef = useRef(false);
  const isVisibleRef = useRef(true);
  const dotsRef = useRef([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isGlobeVisible, setIsGlobeVisible] = useState(false);

  const onGlobeClickRef = useRef(onGlobeClick);
  useEffect(() => {
    onGlobeClickRef.current = onGlobeClick;
  }, [onGlobeClick]);

  const deferredPrimaryColor = useDeferredValue(primaryColor);
  const deferredNeutralColor = useDeferredValue(neutralColor);
  const deferredAtmosphereColor = useDeferredValue(atmosphereColor || neutralColor);
  const deferredGlobeColor = useDeferredValue(globeColor);

  const DEG2RAD = Math.PI / 180;

  useEffect(() => {
    const loadScript = src => {
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          if (window.Globe) {
            resolve();
            return;
          }
          const checkInterval = setInterval(() => {
            if (window.Globe) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          setTimeout(() => {
            clearInterval(checkInterval);
            if (window.Globe) {
              resolve();
            } else {
              reject(new Error("Globe library loaded but not available"));
            }
          }, 5000);
          return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => {
          const checkInterval = setInterval(() => {
            if (window.Globe) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 50);
          setTimeout(() => {
            clearInterval(checkInterval);
            if (window.Globe) {
              resolve();
            } else {
              reject(new Error("Globe library loaded but not available"));
            }
          }, 3000);
        };
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    };

    const loadScripts = async () => {
      try {
        await loadScript("https://unpkg.com/globe.gl");
        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load scripts");
        setIsLoading(false);
      }
    };

    loadScripts();
  }, []);

  const processLandMap = useCallback(image => {
    const cacheKey = `${landMapUrl}_${landDotRows}`;
    const cached = landDotsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];

    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const dots = [];

    const imgWidth = imageData.width;
    const imgHeight = imageData.height;
    const data = imageData.data;
    const rowBytes = 4 * imgWidth;

    const visibilityForCoordinate = (lng, lat) => {
      const r = Math.floor(((lng + 180) / 360) * imgWidth + 0.5);
      const a = imgHeight - Math.floor(((lat + 90) / 180) * imgHeight - 0.5);
      const s = Math.floor(rowBytes * (a - 1) + 4 * r) + 3;
      return data[s] > 90;
    };

    const globeRad = 25;
    for (let lat = -90; lat <= 90; lat += 180 / landDotRows) {
      const radius = Math.cos(Math.abs(lat) * DEG2RAD) * globeRad;
      const circum = radius * Math.PI * 2 * 2;
      for (let r = 0; r < circum; r++) {
        const lng = (360 * r) / circum - 180;
        if (visibilityForCoordinate(lng, lat)) {
          dots.push({ lat, lng });
        }
      }
    }

    landDotsCache.set(cacheKey, dots);

    return dots;
  }, [landDotRows, landMapUrl, DEG2RAD]);

  const cleanup = useCallback(() => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    animationTimeoutsRef.current.forEach(clearTimeout);
    animationTimeoutsRef.current = [];
    isAnimatingRef.current = false;

    if (globeRef.current) {
      try {
        const scene = globeRef.current.scene();
        if (scene) {
          scene.traverse((object) => {
            if (object.geometry) {
              object.geometry.dispose();
            }
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach((material) => {
                  if (material.map) material.map.dispose();
                  if (material.lightMap) material.lightMap.dispose();
                  if (material.bumpMap) material.bumpMap.dispose();
                  if (material.normalMap) material.normalMap.dispose();
                  if (material.specularMap) material.specularMap.dispose();
                  if (material.envMap) material.envMap.dispose();
                  material.dispose();
                });
              } else {
                if (object.material.map) object.material.map.dispose();
                if (object.material.lightMap)
                  object.material.lightMap.dispose();
                if (object.material.bumpMap)
                  object.material.bumpMap.dispose();
                if (object.material.normalMap)
                  object.material.normalMap.dispose();
                if (object.material.specularMap)
                  object.material.specularMap.dispose();
                if (object.material.envMap) object.material.envMap.dispose();
                object.material.dispose();
              }
            }
          });
        }
      } catch (e) {
        console.warn("Error during Three.js cleanup:", e);
      }
      globeRef.current = null;
    }

    if (containerRef.current) {
      while (containerRef.current.firstChild) {
        containerRef.current.removeChild(containerRef.current.firstChild);
      }
    }

    isInitializingRef.current = false;
  }, []);

  useEffect(() => {
    if (isLoading || error || !containerRef.current || !window.Globe) return;

    if (isInitializingRef.current) return;
    isInitializingRef.current = true;

    if (cleanupFnRef.current) {
      cleanupFnRef.current();
      cleanupFnRef.current = null;
    }
    cleanup();

    const initGlobeDeferred = () => {
      if (!containerRef.current || !window.Globe) {
        isInitializingRef.current = false;
        return;
      }

      const container = containerRef.current;
      const containerWidth =
        width === "auto"
          ? container.parentElement?.getBoundingClientRect().width || 600
          : width;
      const containerHeight = height === "auto" ? containerWidth : height;

      const landMapImage = new Image();
      landMapImage.crossOrigin = "anonymous";
      landMapImage.src = landMapUrl;

      landMapImage.onload = () => {
        const dots = processLandMap(landMapImage);
        dotsRef.current = dots;

        if (!window.Globe) return;

        const createColorTexture = (color) => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
          }
          return canvas.toDataURL();
        };

        const world = window
          .Globe()
          .globeImageUrl(createColorTexture(deferredGlobeColor))
          .backgroundColor("rgba(0, 0, 0, 0)")
          .showAtmosphere(showAtmosphere)
          .atmosphereColor(deferredAtmosphereColor)
          .atmosphereAltitude(atmosphereAltitude)
          .width(containerWidth)
          .height(containerHeight)
          .pointsData(dots)
          .pointColor(() => deferredNeutralColor)
          .pointRadius(pointSize)
          .pointResolution(pointResolution)
          .pointAltitude(0)
          .pointsMerge(true)
          .arcColor(() => deferredPrimaryColor)
          .arcStroke(0.25)
          .arcDashInitialGap(1)
          .arcDashLength(2)
          .arcDashGap(2)
          .arcDashAnimateTime(arcAnimationDuration)
          .labelText(() => "")
          .labelColor(() => deferredPrimaryColor)
          .labelDotRadius(0.3)
          .labelAltitude(0.002)
          .labelsTransitionDuration(250)
          .ringColor(() => (t) => `rgba(59, 130, 246, ${1 - t})`)
          .ringMaxRadius(2)
          .ringPropagationSpeed(2)
          .ringRepeatPeriod(0)(container);

        const globeMat = world.globeMaterial();
        globeMat.transparent = true;
        globeMat.opacity = globeOpacity;
        globeMat.shininess = 0.5;

        world.pointOfView({ altitude: cameraAltitude });
        world.controls().autoRotate = true;
        world.controls().autoRotateSpeed = autoRotateSpeed;
        world.controls().enabled = interactive;
        world.controls().enableZoom = enableZoom;

        world.onGlobeClick((coords, event) => {
          if (onGlobeClickRef.current) {
            onGlobeClickRef.current(coords, event);
          }
        });

        globeRef.current = world;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setIsGlobeVisible(true);
          });
        });

        const animateArcs = () => {
          if (
            !globeRef.current ||
            dotsRef.current.length === 0 ||
            isAnimatingRef.current
          )
            return;

          if (!isVisibleRef.current) return;

          isAnimatingRef.current = true;

          animationFrameRef.current = requestAnimationFrame(() => {
            if (!globeRef.current || dotsRef.current.length === 0) {
              isAnimatingRef.current = false;
              return;
            }

            const currentDots = dotsRef.current;
            const selectedDots = getRandomSample(currentDots, arcCount * 2);

            const arcs = Array.from({ length: arcCount }, (_, i) => ({
              startLat: selectedDots[i].lat,
              startLng: selectedDots[i].lng,
              endLat: selectedDots[i + arcCount].lat,
              endLng: selectedDots[i + arcCount].lng,
            }));

            const labels = Array.from({ length: arcCount }, (_, i) => ({
              lat: selectedDots[i + arcCount].lat,
              lng: selectedDots[i + arcCount].lng,
            }));

            const rings = Array.from({ length: arcCount }, (_, i) => ({
              lat: selectedDots[i + arcCount].lat,
              lng: selectedDots[i + arcCount].lng,
            }));

            globeRef.current.arcsData(arcs).labelsData(labels);

            const ringTimeout = setTimeout(() => {
              if (globeRef.current) {
                globeRef.current.ringsData(rings);
              }
              isAnimatingRef.current = false;
            }, arcAnimationDuration * 1.5);
            animationTimeoutsRef.current.push(ringTimeout);
          });
        };

        const initialTimeout = setTimeout(() => {
          animateArcs();
        }, 500);
        animationTimeoutsRef.current.push(initialTimeout);

        animationIntervalRef.current = setInterval(animateArcs, arcInterval);

        let resizeTimeout;
        const handleResize = () => {
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            if (!globeRef.current || !container.parentElement) return;
            const newWidth =
              width === "auto"
                ? container.parentElement.getBoundingClientRect().width
                : width;
            const newHeight = height === "auto" ? newWidth : height;
            globeRef.current.width(newWidth);
            globeRef.current.height(newHeight);
          }, 150);
        };

        window.addEventListener("resize", handleResize);

        let resizeObserver = null;
        if ("ResizeObserver" in window && container.parentElement) {
          resizeObserver = new ResizeObserver(handleResize);
          resizeObserver.observe(container.parentElement);
        }

        let observer = null;
        if ("IntersectionObserver" in window) {
          observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              isVisibleRef.current = entry.isIntersecting;
              if (globeRef.current) {
                const controls = globeRef.current.controls();
                controls.autoRotate = entry.isIntersecting;
              }
            });
          }, { threshold: 0.1 });
          observer.observe(container);
        }

        const localCleanup = () => {
          window.removeEventListener("resize", handleResize);
          if (resizeTimeout) {
            clearTimeout(resizeTimeout);
          }
          if (observer) {
            observer.disconnect();
          }
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
          cleanup();
        };

        cleanupFnRef.current = localCleanup;

        onReady?.();
      };

      landMapImage.onerror = () => {
        setError("Failed to load land map image");
        isInitializingRef.current = false;
      };
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(initGlobeDeferred, { timeout: 500 });
    } else {
      setTimeout(initGlobeDeferred, 0);
    }
    return () => {
      if (cleanupFnRef.current) {
        cleanupFnRef.current();
        cleanupFnRef.current = null;
      }
    };
  }, [
    isLoading,
    error,
    width,
    height,
    deferredPrimaryColor,
    deferredNeutralColor,
    deferredAtmosphereColor,
    deferredGlobeColor,
    showAtmosphere,
    autoRotateSpeed,
    enableZoom,
    interactive,
    arcCount,
    arcInterval,
    arcAnimationDuration,
    cameraAltitude,
    landMapUrl,
    processLandMap,
    onReady,
    cleanup,
    pointSize,
    pointResolution,
    atmosphereAltitude,
    globeOpacity,
  ]);

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8 text-red-600",
          className
        )}>
        <p>Error loading globe: {error}</p>
      </div>
    );
  }

  if (isLoading) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden",
        interactive ? "cursor-grab" : "cursor-default",
        className
      )}
      style={{
        width: width === "auto" ? "100%" : width,
        height: height === "auto" ? "auto" : height,
        opacity: isGlobeVisible ? 1 : 0,
        transform: isGlobeVisible ? "scale(1)" : "scale(0.85)",
        transition:
          "opacity 0.8s ease-out, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }} />
  );
};

Globe.displayName = "Globe";

export default Globe;
