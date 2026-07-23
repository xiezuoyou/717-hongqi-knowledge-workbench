import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { cn } from '@/lib/utils';

gsap.registerPlugin(Draggable, InertiaPlugin);

export default function CircleGallery({
  items = [],
  radiusPercent = 30,
  itemWidth = 220,
  itemHeight = 300,
  itemScale = 0.9,
  borderRadius = 18,
  enableDrag = true,
  throwResistance = 0.35,
  animationDuration = 0.9,
  showNumbers = true,
  autoSpin = 0,
  className = '',
  itemClassName = '',
  showCaption = false,
  onItemClick,
}) {
  const containerRef = useRef(null);
  const wheelRef = useRef(null);
  const itemRefs = useRef([]);
  const draggableRef = useRef(null);
  const autoSpinRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [imageSizes, setImageSizes] = useState({});

  const displayItems = useMemo(() => {
    return Array.isArray(items)
      ? items.map((item) => (
        typeof item === 'string'
          ? { src: item, title: '', reason: '', description: '' }
          : {
            src: item.src || item.url || '',
            title: item.title || '',
            reason: item.reason || '',
            description: item.description || '',
          }
      )).filter((item) => item.src)
      : [];
  }, [items]);

  const getRadius = useCallback(() => {
    const container = containerRef.current;
    if (!container) return 220;
    const { width, height } = container.getBoundingClientRect();
    return Math.max(120, Math.min(width, height) * (radiusPercent / 100));
  }, [radiusPercent]);

  const getItemDimensions = useCallback((src) => {
    const size = imageSizes[src];
    if (!size?.width || !size?.height) {
      return { width: itemWidth, height: itemHeight };
    }

    const ratio = size.width / size.height;
    let width = itemWidth;
    let height = width / ratio;

    if (height > itemHeight) {
      height = itemHeight;
      width = height * ratio;
    }

    return {
      width: Math.max(96, Math.round(width)),
      height: Math.max(96, Math.round(height)),
    };
  }, [imageSizes, itemHeight, itemWidth]);

  const handleImageLoad = useCallback((src, event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) return;
    setImageSizes((current) => {
      const previous = current[src];
      if (previous?.width === naturalWidth && previous?.height === naturalHeight) {
        return current;
      }
      return {
        ...current,
        [src]: {
          width: naturalWidth,
          height: naturalHeight,
        },
      };
    });
  }, []);

  const positionItems = useCallback((animated = false) => {
    if (!wheelRef.current || displayItems.length === 0) return;
    const fullCircle = Math.PI * 2;
    const stepAngle = fullCircle / displayItems.length;
    const currentRotation = gsap.getProperty(wheelRef.current, 'rotation') || 0;
    const rotationInRadians = (currentRotation * Math.PI) / 180;
    const circleRadius = getRadius();

    itemRefs.current.forEach((item, idx) => {
      if (!item) return;
      const angle = idx * stepAngle + rotationInRadians;
      const xPosition = circleRadius * Math.cos(angle);
      const yPosition = circleRadius * Math.sin(angle);

      const config = {
        x: xPosition,
        y: yPosition,
        rotation: -currentRotation,
        duration: animated ? 0.45 : 0,
        ease: 'power2.out',
      };

      if (animated) {
        gsap.to(item, config);
      } else {
        gsap.set(item, config);
      }
    });
  }, [displayItems.length, getRadius]);

  const setupDraggable = useCallback(() => {
    if (!wheelRef.current || !enableDrag || focusedIndex !== null) return;
    if (draggableRef.current) {
      draggableRef.current.kill();
      draggableRef.current = null;
    }

    const updateItemRotations = function updateItemRotations() {
      const wheelRotation = this.rotation || 0;
      itemRefs.current.forEach((item) => {
        if (item) {
          gsap.set(item, { rotation: -wheelRotation });
        }
      });
    };

    draggableRef.current = Draggable.create(wheelRef.current, {
      type: 'rotation',
      inertia: true,
      throwResistance,
      onDrag: updateItemRotations,
      onThrowUpdate: updateItemRotations,
      onPress: () => {
        if (autoSpinRef.current) {
          autoSpinRef.current.kill();
          autoSpinRef.current = null;
        }
        isDraggingRef.current = false;
      },
      onDragStart: () => {
        isDraggingRef.current = true;
      },
      onDragEnd: () => {
        window.setTimeout(() => {
          isDraggingRef.current = false;
        }, 50);
      },
      trigger: containerRef.current,
    })[0];
  }, [enableDrag, focusedIndex, throwResistance]);

  const initializeGallery = useCallback(() => {
    if (!wheelRef.current || displayItems.length === 0) return;
    const items = itemRefs.current.filter(Boolean);

    const timeline = gsap.timeline({
      onComplete: () => {
        setIsReady(true);
        setupDraggable();
      },
    });

    items.forEach((item, idx) => {
      const staggerDelay = (items.length - 1 - idx) * 0.06;
      timeline.to(item, {
        opacity: 1,
        scale: itemScale,
        duration: 0.4,
        ease: 'power2.out',
      }, staggerDelay);
    });

    const lastAnimationEnd = (items.length - 1) * 0.06 + 0.4;
    timeline.to({}, { duration: 0.2 }, lastAnimationEnd);

    const circleRadius = getRadius();
    const fullCircle = Math.PI * 2;
    const stepAngle = fullCircle / displayItems.length;
    const circleStartTime = lastAnimationEnd + 0.15;

    items.forEach((item, idx) => {
      const angle = idx * stepAngle;
      const xPosition = circleRadius * Math.cos(angle);
      const yPosition = circleRadius * Math.sin(angle);
      timeline.to(item, {
        x: xPosition,
        y: yPosition,
        boxShadow: '0 14px 30px rgba(15, 23, 42, 0.10)',
        duration: animationDuration,
        ease: 'power2.inOut',
      }, circleStartTime);
    });
  }, [animationDuration, displayItems.length, getRadius, itemScale, setupDraggable]);

  useEffect(() => {
    const items = itemRefs.current.filter(Boolean);
    if (items.length > 0) {
      gsap.set(items, {
        x: 0,
        y: 0,
        rotation: 0,
        scale: 0,
        opacity: 0,
        boxShadow: '0 0 0 rgba(0, 0, 0, 0)',
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      initializeGallery();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [initializeGallery]);

  useEffect(() => {
    if (isReady) {
      positionItems(true);
    }
  }, [imageSizes, isReady, positionItems]);

  useEffect(() => {
    const handleResize = () => {
      if (isReady) {
        positionItems(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isReady, positionItems]);

  useEffect(() => {
    if (focusedIndex !== null && draggableRef.current) {
      draggableRef.current.kill();
      draggableRef.current = null;
    } else if (focusedIndex === null && isReady && enableDrag) {
      setupDraggable();
    }
  }, [enableDrag, focusedIndex, isReady, setupDraggable]);

  useEffect(() => {
    if (!isReady || !wheelRef.current || autoSpin === 0 || focusedIndex !== null) {
      if (autoSpinRef.current) {
        autoSpinRef.current.kill();
        autoSpinRef.current = null;
      }
      return undefined;
    }

    const currentRotation = gsap.getProperty(wheelRef.current, 'rotation') || 0;
    autoSpinRef.current = gsap.to(wheelRef.current, {
      rotation: currentRotation + (autoSpin > 0 ? 360 : -360),
      duration: Math.abs(360 / autoSpin),
      ease: 'none',
      repeat: -1,
      onUpdate: () => {
        const wheelRotation = gsap.getProperty(wheelRef.current, 'rotation') || 0;
        itemRefs.current.forEach((item) => {
          if (item) {
            gsap.set(item, { rotation: -wheelRotation });
          }
        });
      },
    });

    return () => {
      if (autoSpinRef.current) {
        autoSpinRef.current.kill();
        autoSpinRef.current = null;
      }
    };
  }, [autoSpin, focusedIndex, isReady]);

  useEffect(() => {
    return () => {
      draggableRef.current?.kill();
      autoSpinRef.current?.kill();
      gsap.killTweensOf(wheelRef.current);
      gsap.killTweensOf(itemRefs.current);
    };
  }, []);

  const restoreLayout = useCallback(() => {
    if (!wheelRef.current || displayItems.length === 0) return;
    setFocusedIndex(null);
    const circleRadius = getRadius();
    const fullCircle = Math.PI * 2;
    const stepAngle = fullCircle / displayItems.length;
    const currentRotation = gsap.getProperty(wheelRef.current, 'rotation') || 0;
    const rotationInRadians = (currentRotation * Math.PI) / 180;

    itemRefs.current.forEach((item, idx) => {
      if (!item) return;
      const angle = idx * stepAngle + rotationInRadians;
      const xPosition = circleRadius * Math.cos(angle);
      const yPosition = circleRadius * Math.sin(angle);
      gsap.to(item, {
        x: xPosition,
        y: yPosition,
        scale: itemScale,
        zIndex: 100 + idx,
        filter: 'blur(0px)',
        duration: 0.5,
        ease: 'power2.inOut',
      });
    });
  }, [displayItems.length, getRadius, itemScale]);

  const focusItem = useCallback((index) => {
    if (isDraggingRef.current) return;
    if (focusedIndex !== null && focusedIndex !== index) return;

    if (focusedIndex === index) {
      restoreLayout();
      setSelectedIndex(index);
      onItemClick?.(index, displayItems[index]);
      return;
    }

    setFocusedIndex(index);
    setSelectedIndex(index);
    itemRefs.current.forEach((item, idx) => {
      if (!item) return;
      if (idx === index) {
        gsap.to(item, {
          x: 0,
          y: 0,
          scale: itemScale * 1.55,
          zIndex: 1000,
          filter: 'blur(0px)',
          duration: 0.55,
          ease: 'power2.out',
        });
      } else {
        gsap.to(item, {
          scale: itemScale * 0.82,
          filter: 'blur(4px)',
          duration: 0.55,
          ease: 'power2.inOut',
        });
      }
    });
    onItemClick?.(index, displayItems[index]);
  }, [displayItems, focusedIndex, itemScale, onItemClick, restoreLayout]);

  const handleContainerClick = useCallback((event) => {
    if (focusedIndex !== null && event.target === containerRef.current) {
      restoreLayout();
    }
  }, [focusedIndex, restoreLayout]);

  const activeItem = selectedIndex !== null ? displayItems[selectedIndex] : null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'circle-gallery-shell',
        enableDrag && focusedIndex === null && 'is-draggable',
        className,
      )}
      onClick={handleContainerClick}
      style={{ perspective: '2200px' }}
    >
      <div ref={wheelRef} className="circle-gallery-wheel">
        {displayItems.map((item, index) => {
          const dimensions = getItemDimensions(item.src);
          return (
            <button
              key={`${item.src}-${index}`}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              className={cn('circle-gallery-item', focusedIndex === index && 'is-focused', itemClassName)}
              style={{
                width: `${dimensions.width}px`,
                height: `${dimensions.height}px`,
                borderRadius: `${borderRadius}px`,
              }}
              onClick={(event) => {
                event.stopPropagation();
                focusItem(index);
              }}
            >
              <img
                src={item.src}
                alt={item.title || `素材 ${index + 1}`}
                draggable="false"
                onLoad={(event) => handleImageLoad(item.src, event)}
              />
              {showNumbers && (
                <span className="circle-gallery-number">{String(index + 1).padStart(2, '0')}</span>
              )}
            </button>
          );
        })}
      </div>

      {showCaption && activeItem && (
        <div className="circle-gallery-caption">
          <strong>{activeItem.title || `素材 ${selectedIndex + 1}`}</strong>
          <span>{activeItem.reason || activeItem.description || '已选中素材'}</span>
        </div>
      )}
    </div>
  );
}
