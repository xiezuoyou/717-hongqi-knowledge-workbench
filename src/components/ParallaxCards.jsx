import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, LoaderCircle, SendHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const CARD_GAP = 24;
const LOOP_COUNT = 5;

function normalizeItem(item) {
  if (typeof item === 'string') {
    return { src: item, title: '' };
  }

  return {
    src: item?.src || item?.url || '',
    title: item?.title || '素材图片',
    description: item?.description || item?.reason || '',
    sourcePath: item?.sourcePath || '',
    fileName: item?.fileName || '',
  };
}

export default function ParallaxCards({
  items = [],
  cardCount,
  className = '',
  title = '金葵花素材推荐',
  eyebrow = '',
  description = '',
  cornerLabel = '你或许想...',
  actions = [],
  onCardClick,
}) {
  const shellRef = useRef(null);
  const trackRef = useRef(null);
  const downloadButtonRef = useRef(null);
  const processFormRef = useRef(null);
  const rafRef = useRef(null);
  const lastFrameRef = useRef(0);
  const positionRef = useRef({
    x: 0,
    velocity: -22,
    startX: 0,
    startOffset: 0,
    lastX: 0,
    lastTime: 0,
  });
  const draggedRef = useRef(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [imageSizes, setImageSizes] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [selectedItemIndexes, setSelectedItemIndexes] = useState([]);
  const [isProcessComposerOpen, setIsProcessComposerOpen] = useState(false);
  const [processPrompt, setProcessPrompt] = useState('');
  const [processError, setProcessError] = useState('');
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);
  const [generatedItem, setGeneratedItem] = useState(null);
  const [flyClones, setFlyClones] = useState([]);

  const displayItems = useMemo(() => {
    const normalized = Array.isArray(items)
      ? items.map(normalizeItem).filter((item) => item.src)
      : [];
    return normalized.slice(0, Math.min(cardCount || normalized.length, 12));
  }, [cardCount, items]);

  const selectedItemSet = useMemo(() => new Set(selectedItemIndexes), [selectedItemIndexes]);
  const selectedItems = useMemo(() => (
    selectedItemIndexes
      .map((index) => displayItems[index])
      .filter(Boolean)
  ), [displayItems, selectedItemIndexes]);
  const hasSelection = selectedItems.length > 0;
  const backAction = actions.find((action) => action.id === 'back');
  const downloadAction = actions.find((action) => action.id === 'download');
  const processAction = actions.find((action) => action.id === 'process');
  const BackIcon = backAction?.icon;
  const DownloadIcon = downloadAction?.icon;

  const cardItems = useMemo(() => {
    const viewportWidth = stageSize.width || window.innerWidth;
    const viewportHeight = stageSize.height || window.innerHeight;
    const maxCardHeight = clamp(viewportHeight * 0.55, 300, 520);
    const maxCardWidth = clamp(viewportWidth * 0.28, 230, 390);
    const minCardWidth = 180;

    return displayItems.map((item) => {
      const imageSize = imageSizes[item.src];
      const ratio = imageSize?.width && imageSize?.height
        ? imageSize.width / imageSize.height
        : 0.72;
      let height = maxCardHeight;
      let width = height * ratio;

      if (width > maxCardWidth) {
        width = maxCardWidth;
        height = width / ratio;
      }

      if (width < minCardWidth && minCardWidth / ratio <= maxCardHeight) {
        width = minCardWidth;
        height = width / ratio;
      }

      return {
        ...item,
        width: Math.round(width),
        height: Math.round(height),
      };
    });
  }, [displayItems, imageSizes, stageSize.height, stageSize.width]);

  const oneSetWidth = useMemo(() => {
    if (!cardItems.length) return 0;
    return cardItems.reduce((total, item) => total + item.width, 0) + CARD_GAP * (cardItems.length - 1);
  }, [cardItems]);

  const centeredStartX = useMemo(() => {
    if (!oneSetWidth) return 0;
    const viewportWidth = stageSize.width || window.innerWidth;
    return viewportWidth / 2 - oneSetWidth * 1.5;
  }, [oneSetWidth, stageSize.width]);

  const loopItems = useMemo(() => {
    if (!cardItems.length) return [];
    return Array.from({ length: LOOP_COUNT }).flatMap((_, loopIndex) => (
      cardItems.map((item, itemIndex) => ({
        ...item,
        loopKey: `${loopIndex}-${itemIndex}-${item.src}`,
        itemIndex,
      }))
    ));
  }, [cardItems]);

  const applyTransform = useCallback(() => {
    if (!trackRef.current) return;
    trackRef.current.style.transform = `translate3d(${positionRef.current.x}px, 0, 0)`;
  }, []);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;

    const updateSize = () => {
      const rect = shell.getBoundingClientRect();
      setStageSize({
        width: rect.width || window.innerWidth,
        height: rect.height || window.innerHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!oneSetWidth) return;
    positionRef.current.x = centeredStartX;
    positionRef.current.velocity = -22;
    applyTransform();
  }, [applyTransform, centeredStartX, oneSetWidth]);

  useEffect(() => {
    if (!oneSetWidth) return undefined;

    const animate = (time) => {
      const lastFrame = lastFrameRef.current || time;
      const delta = Math.min(48, time - lastFrame);
      lastFrameRef.current = time;

      if (!isDragging) {
        const state = positionRef.current;
        state.velocity = state.velocity * 0.92 + (-22) * 0.08;
        state.x += state.velocity * (delta / 1000);

        if (state.x <= -oneSetWidth * 2) state.x += oneSetWidth;
        if (state.x > 0) state.x -= oneSetWidth;
        applyTransform();
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = 0;
    };
  }, [applyTransform, isDragging, oneSetWidth]);

  const handlePointerDown = useCallback((event) => {
    if (!oneSetWidth || generatedItem) return;
    draggedRef.current = false;
    setIsDragging(true);

    const state = positionRef.current;
    state.startX = event.clientX;
    state.startOffset = state.x;
    state.lastX = event.clientX;
    state.lastTime = performance.now();
    state.velocity = 0;
  }, [generatedItem, oneSetWidth]);

  const handlePointerMove = useCallback((event) => {
    if (!isDragging || generatedItem) return;

    const state = positionRef.current;
    const delta = event.clientX - state.startX;
    const now = performance.now();
    const timeDelta = Math.max(1, now - state.lastTime);

    if (Math.abs(delta) > 6) draggedRef.current = true;

    state.x = state.startOffset + delta;
    state.velocity = (event.clientX - state.lastX) / (timeDelta / 1000);
    state.lastX = event.clientX;
    state.lastTime = now;

    if (state.x <= -oneSetWidth * 2) state.x += oneSetWidth;
    if (state.x > 0) state.x -= oneSetWidth;
    applyTransform();
  }, [applyTransform, generatedItem, isDragging, oneSetWidth]);

  const handlePointerUp = useCallback((event) => {
    if (!draggedRef.current && !generatedItem) {
      const pointedElement = document.elementFromPoint(event.clientX, event.clientY);
      const card = pointedElement?.closest?.('.showcase2-card');
      const itemIndex = Number(card?.dataset?.itemIndex);
      const loopIndex = Number(card?.dataset?.loopIndex);
      const item = cardItems[itemIndex];
      if (card && Number.isInteger(itemIndex) && item) {
        toggleSelection(itemIndex, item, card);
        onCardClick?.(loopIndex, item);
      }
    }
    setIsDragging(false);
  });

  const addFlyClone = useCallback((sourceRect, targetRect, item) => {
    const shellRect = shellRef.current?.getBoundingClientRect();
    if (!sourceRect || !targetRect || !shellRect) return;
    const cloneId = `${item.src}-${Date.now()}-${Math.random()}`;
    const sourceCenterX = sourceRect.left + sourceRect.width / 2 - shellRect.left;
    const sourceCenterY = sourceRect.top + sourceRect.height / 2 - shellRect.top;
    const targetCenterX = targetRect.left + targetRect.width / 2 - shellRect.left;
    const targetCenterY = targetRect.top + targetRect.height / 2 - shellRect.top;
    const startLeft = sourceCenterX - shellRect.width / 2;
    const startTop = sourceCenterY - shellRect.height / 2;
    const endLeft = targetCenterX - shellRect.width / 2;
    const endTop = targetCenterY - shellRect.height / 2;
    const scaleX = targetRect.width / sourceRect.width;
    const scaleY = targetRect.height / sourceRect.height;

    setFlyClones((current) => [
      ...current,
        {
          id: cloneId,
          src: item.src,
          startLeft,
          startTop,
          endLeft,
          endTop,
          scaleX,
          scaleY,
        },
      ]);

    window.setTimeout(() => {
      setFlyClones((current) => current.filter((clone) => clone.id !== cloneId));
    }, 700);
  }, []);

  const toggleSelection = useCallback((itemIndex, item, element) => {
    const cardRect = element?.getBoundingClientRect();
    const buttonRect = downloadButtonRef.current?.getBoundingClientRect();
    const nextSelected = selectedItemSet.has(itemIndex)
      ? selectedItemIndexes.filter((index) => index !== itemIndex)
      : [...selectedItemIndexes, itemIndex];

    setSelectedItemIndexes(nextSelected);

    if (cardRect && buttonRect && !selectedItemSet.has(itemIndex)) {
      addFlyClone(cardRect, buttonRect, item);
    }
    if (isProcessComposerOpen) setIsProcessComposerOpen(false);
  }, [addFlyClone, isProcessComposerOpen, selectedItemIndexes, selectedItemSet]);

  const downloadAssets = useCallback(async (itemsToDownload) => {
    const assets = Array.isArray(itemsToDownload) ? itemsToDownload.filter(Boolean) : [];
    if (!assets.length) return;

    for (const item of assets) {
      try {
        const rawName = item.fileName || item.sourcePath || item.src;
        const extension = String(rawName).includes('.')
          ? String(rawName).split('.').pop()?.toLowerCase()
          : 'jpg';
        const titleName = (item.title || '素材图片').replace(/[\\/:*?"<>|]/g, '_');
        const fileName = titleName && extension ? `${titleName}.${extension}` : titleName;
        const response = await fetch(item.src);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      } catch (error) {
        console.error(error);
        const fallback = document.createElement('a');
        fallback.href = item.src;
        fallback.download = `${(item.title || '素材图片').replace(/[\\/:*?"<>|]/g, '_')}`;
        fallback.target = '_blank';
        fallback.rel = 'noopener';
        document.body.appendChild(fallback);
        fallback.click();
        fallback.remove();
      }
    }
  }, []);

  const downloadSelectedAssets = useCallback(async () => {
    if (!hasSelection) return;
    await downloadAssets(selectedItems);
    setSelectedItemIndexes([]);
    setIsProcessComposerOpen(false);
  }, [downloadAssets, hasSelection, selectedItems]);

  const openProcessComposer = useCallback(() => {
    if (!hasSelection || isProcessingLocal) return;
    setProcessError('');
    setIsProcessComposerOpen(true);
  }, [hasSelection, isProcessingLocal]);

  const executeProcess = useCallback(async () => {
    const instruction = processPrompt.trim();
    if (!instruction || !hasSelection || isProcessingLocal) return;

    setIsProcessingLocal(true);
    setProcessError('');
    try {
      const generated = await processAction?.onClick?.(selectedItems, instruction);
      if (generated?.url) {
        setGeneratedItem(normalizeItem(generated));
        setSelectedItemIndexes([]);
        setIsProcessComposerOpen(false);
        setProcessPrompt('');
        return;
      }
      setProcessError(generated?.error || '没有拿到生成图片，请调整描述后再试');
    } finally {
      setIsProcessingLocal(false);
    }
  }, [hasSelection, isProcessingLocal, processAction, processPrompt, selectedItems]);

  useEffect(() => {
    if (!isProcessComposerOpen || processPrompt.trim()) return undefined;

    const handlePointerDownOutside = (event) => {
      if (!processFormRef.current || processFormRef.current.contains(event.target)) return;
      setIsProcessComposerOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDownOutside);
    return () => window.removeEventListener('pointerdown', handlePointerDownOutside);
  }, [isProcessComposerOpen, processPrompt]);

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

  return (
    <section ref={shellRef} className={cn('showcase2', generatedItem && 'is-generated', className)}>
      <div className="showcase2-header">
        <div className="showcase2-copy">
          <h2>{title}</h2>
          {eyebrow && <p className="showcase2-eyebrow">{eyebrow}</p>}
          {description && <p className="showcase2-description">{description}</p>}
          {!generatedItem && (
            <div className={cn('showcase2-actions', isProcessComposerOpen && 'is-processing-open')}>
              {actions.map((action) => {
              const Icon = action.icon;
              const actionIndex = actions.findIndex((item) => item.id === action.id);
              const isDownloadAction = action.id === 'download';
              const isProcessAction = action.id === 'process';
              const isDisabled = action.disabled || ((isDownloadAction || isProcessAction) && !hasSelection);
              return (
                <button
                  key={action.id}
                  ref={isDownloadAction ? downloadButtonRef : undefined}
                  type="button"
                  className={cn(
                    'showcase2-pill',
                    isDownloadAction && 'is-download',
                    isProcessComposerOpen && !isProcessAction && 'is-hidden-by-process',
                  )}
                  style={{ '--pill-delay': `${470 + actionIndex * 70}ms` }}
                  onClick={() => {
                    if (action.id === 'back') {
                      setSelectedItemIndexes([]);
                      setIsProcessComposerOpen(false);
                      setGeneratedItem(null);
                      action.onClick?.();
                      return;
                    }
                    if (action.id === 'download') {
                      downloadSelectedAssets();
                      return;
                    }
                    if (action.id === 'process') {
                      openProcessComposer();
                      return;
                    }
                    action.onClick?.();
                  }}
                  disabled={isDisabled}
                >
                  {action.id === 'download' && selectedItemIndexes.length > 0 ? (
                    <>
                      <Check size={15} />
                      下载 · {selectedItemIndexes.length}
                    </>
                  ) : isProcessAction && selectedItemIndexes.length > 0 ? (
                    <>
                      <Icon size={15} />
                      AI处理 · {selectedItemIndexes.length}
                    </>
                  ) : (
                    <>
                      <Icon size={15} />
                      {action.label}
                    </>
                  )}
                </button>
              );
              })}
              {isProcessComposerOpen && (
                <div className="showcase2-process-form" ref={processFormRef}>
                  <input
                    value={processPrompt}
                    onChange={(event) => setProcessPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        executeProcess();
                      }
                      if (event.key === 'Escape') {
                        setIsProcessComposerOpen(false);
                        setProcessPrompt('');
                        setProcessError('');
                      }
                    }}
                    placeholder="帮我做成视频封面，复古风格，比例4:3"
                    autoFocus
                  />
                  <button
                    type="button"
                    aria-label={isProcessingLocal ? '正在执行' : '执行AI处理'}
                    onClick={executeProcess}
                    disabled={!processPrompt.trim() || isProcessingLocal}
                  >
                    {isProcessingLocal ? <LoaderCircle size={18} /> : <SendHorizontal size={18} />}
                  </button>
                  {processError && <p className="showcase2-process-error">{processError}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {generatedItem && (
        <div className="showcase2-generated-stage">
          <img src={generatedItem.src} alt={generatedItem.title || 'AI创作结果'} draggable="false" />
          <div className="showcase2-generated-actions">
            <button
              type="button"
              onClick={() => {
                setGeneratedItem(null);
                setSelectedItemIndexes([]);
                backAction?.onClick?.();
              }}
            >
              {BackIcon && <BackIcon size={15} />}
              返回
            </button>
            <button type="button" onClick={() => downloadAssets([generatedItem])}>
              {DownloadIcon && <DownloadIcon size={15} />}
              下载
            </button>
          </div>
        </div>
      )}

      {!generatedItem && <div
        className={cn('showcase2-carousel', isDragging && 'is-dragging')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div ref={trackRef} className="showcase2-track">
          {loopItems.map((item, index) => {
            const isHovered = hoveredIndex === index;
            const isSelected = selectedItemSet.has(item.itemIndex);
            return (
              <button
                key={item.loopKey}
                type="button"
                data-item-index={item.itemIndex}
                data-loop-index={index}
                className={cn('showcase2-card', isSelected && 'is-selected')}
                style={{
                  width: `${item.width}px`,
                  height: `${item.height}px`,
                  '--card-delay': `${980 + (item.itemIndex % Math.max(1, cardItems.length)) * 46}ms`,
                  transform: isHovered
                    ? 'translateY(-24px) rotateX(-13deg) scale(1.045)'
                    : 'translateY(0) rotateX(0deg) scale(1)',
                }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  draggedRef.current = false;
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  if (generatedItem) return;
                  toggleSelection(item.itemIndex, item, event.currentTarget);
                  onCardClick?.(index, item);
                }}
                onClick={(event) => {
                  event.preventDefault();
                }}
              >
                {isSelected && (
                  <span className="showcase2-selected-mark">
                    <Check size={13} />
                  </span>
                )}
                <img
                  src={item.src}
                  alt={item.title || `素材 ${item.itemIndex + 1}`}
                  draggable="false"
                  onLoad={(event) => handleImageLoad(item.src, event)}
                />
              </button>
            );
          })}
        </div>
      </div>}
      {flyClones.map((clone) => (
        <FlyClone key={clone.id} clone={clone} />
      ))}
    </section>
  );
}

function FlyClone({ clone }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setActive(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <span
      className={cn('showcase2-fly-clone', active && 'is-active')}
      style={{
        '--from-x': `${clone.startLeft}px`,
        '--from-y': `${clone.startTop}px`,
        '--to-x': `${clone.endLeft}px`,
        '--to-y': `${clone.endTop}px`,
        '--from-scale-x': clone.scaleX,
        '--from-scale-y': clone.scaleY,
        '--to-scale-x': 0.18,
        '--to-scale-y': 0.18,
      }}
    >
      <img src={clone.src} alt="" draggable="false" />
    </span>
  );
}
