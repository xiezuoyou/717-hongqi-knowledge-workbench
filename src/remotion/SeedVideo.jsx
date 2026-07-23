import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  Video,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

function splitText(text, max = 14) {
  const lines = [];
  let line = '';
  for (const char of text) {
    if (line.length >= max) {
      lines.push(line);
      line = char;
    } else {
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function buildTimelineBeats(data, fps) {
  if (Array.isArray(data.timelineBeats) && data.timelineBeats.length > 0) {
    return data.timelineBeats.map((beat, index) => ({
      ...beat,
      id: beat.id || `beat-${index}`,
      fromFrame: Math.round((beat.start || 0) * fps),
      durationFrames: Math.max(1, Math.round((beat.duration || 1) * fps)),
    }));
  }

  let cursor = 0;
  return data.slices.flatMap((slice, segmentIndex) => {
    const parts = slice.text
      .split(/(?<=[，,。！？；])/)
      .map((item) => item.trim())
      .filter(Boolean);
    const duration = slice.duration || 3;
    const partDuration = duration / Math.max(1, parts.length);
    const beats = parts.map((text, beatIndex) => ({
      id: `${segmentIndex}-${beatIndex}`,
      segmentName: slice.name,
      text,
      materialName: slice.material,
      materialType: '通用素材',
      visualNeed: slice.material,
      fromFrame: Math.round((cursor + beatIndex * partDuration) * fps),
      durationFrames: Math.max(1, Math.round(partDuration * fps)),
    }));
    cursor += duration;
    return beats;
  });
}

function buildMaterialClips(data, fps, fallbackBeats) {
  if (Array.isArray(data.materialClips) && data.materialClips.length > 0) {
    return data.materialClips.map((clip, index) => ({
      ...clip,
      id: clip.id || `material-${index}`,
      fromFrame: Math.round((clip.start || 0) * fps),
      durationFrames: Math.max(1, Math.round((clip.duration || 1) * fps)),
      selectedMaterials: Array.isArray(clip.selectedMaterials) ? clip.selectedMaterials : [],
    }));
  }
  return fallbackBeats;
}

function getMaterialSource(plan) {
  if (plan?.src) return plan.src;
  if (plan?.url) return plan.url;
  if (plan?.sourceUrl) return plan.sourceUrl;
  return staticFile('seed-a/seed-original.mp4');
}

function MaterialSequence({ beat, packageConfig }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame, fps, config: { damping: 18 } });
  const backgroundScale = interpolate(frame, [0, Math.max(1, beat.durationFrames)], [1.03, 1.12], {
    extrapolateRight: 'clamp',
  });
  const tint = beat.materialType === '强绑定素材' ? '#b91c1c' : '#334155';
  const transition = packageConfig?.transitions || {};
  const transitionFrames = Math.round(Number(transition.duration || 0) * fps);
  const transitionOpacity = transition.type === 'fade' && transitionFrames > 0
    ? interpolate(frame, [0, transitionFrames], [0, 1], { extrapolateRight: 'clamp' })
    : 1;
  const materialPlan = Array.isArray(beat.materialPlan) ? beat.materialPlan : [];
  const selectedMaterials = materialPlan.length > 0
    ? materialPlan.map((item) => item.file)
    : Array.isArray(beat.selectedMaterials) && beat.selectedMaterials.length > 0
    ? beat.selectedMaterials
    : [beat.materialName].filter(Boolean);
  const currentSecond = frame / fps;
  let planCursor = 0;
  const activePlanSlot = materialPlan.map((plan) => {
    const start = planCursor;
    const end = planCursor + Number(plan.renderDuration || 0);
    planCursor = end;
    return { plan, start, end };
  }).find((item) => currentSecond >= item.start && currentSecond < item.end)
    || (materialPlan.length ? { plan: materialPlan[materialPlan.length - 1], start: 0, end: Number(materialPlan[materialPlan.length - 1].renderDuration || 0) } : null);
  const activePlan = activePlanSlot?.plan;
  const activeTransform = activePlan?.transform || { x: 0, y: 0, scale: 1, fit: 'contain' };
  const activeSourceStart = Number(activePlan?.sourceStart || 0);
  const localPlanSecond = Math.max(currentSecond - Number(activePlanSlot?.start || 0), 0);
  const videoStartFrom = -Math.round((activeSourceStart + localPlanSecond) * fps);

  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: '#0b1220', opacity: transitionOpacity }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(145deg, ${tint} 0%, #101827 46%, #111827 100%)`,
          transform: `scale(${backgroundScale})`,
          opacity: 0.96,
        }}
      />
      {activePlan && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Sequence from={videoStartFrom}>
            <Video
              src={getMaterialSource(activePlan)}
              muted
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: activeTransform.fit || 'contain',
                transform: `translate(${Number(activeTransform.x || 0)}%, ${Number(activeTransform.y || 0)}%) scale(${Number(activeTransform.scale || 1)})`,
                transformOrigin: 'center center',
              }}
            />
          </Sequence>
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          background: activePlan ? 'linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.34))' : 'transparent',
        }}
      />
      <img
        src={staticFile('red-flag.svg')}
        style={{
          position: 'absolute',
          width: 260,
          right: 64,
          top: 68,
          opacity: 0.14,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 72,
          right: 72,
          top: 112,
          opacity: entrance,
          transform: `translateY(${interpolate(entrance, [0, 1], [34, 0])}px)`,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '12px 20px',
            borderRadius: 999,
            background: beat.materialType === '强绑定素材' ? '#ffffff' : 'rgba(255,255,255,0.16)',
            color: beat.materialType === '强绑定素材' ? '#b91c1c' : '#ffffff',
            fontSize: 26,
            fontWeight: 900,
          }}
        >
          {beat.materialType}
        </div>
        <div style={{ marginTop: 34, fontSize: 68, fontWeight: 950, lineHeight: 1.1, color: '#ffffff' }}>
          {activePlan?.name || beat.materialName}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
          {selectedMaterials.map((item) => (
            <div
              key={item}
              style={{
                padding: '10px 16px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.14)',
                color: '#ffffff',
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              {item}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, fontSize: 34, lineHeight: 1.35, color: '#d8dee8' }}>
          {beat.visualNeed}
        </div>
        {activePlan && (
          <div style={{ marginTop: 20, fontSize: 28, lineHeight: 1.3, color: '#ffffff', opacity: 0.86 }}>
            当前素材：{activePlan.file} · 原素材 {Number(activePlan.sourceStart || 0).toFixed(1)}s - {Number(activePlan.sourceEnd || 0).toFixed(1)}s · 成片 {Number(activePlan.renderDuration || 0).toFixed(1)}s
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

function SubtitleSequence({ beat, packageConfig }) {
  const frame = useCurrentFrame();
  const fadeFrames = Math.min(8, Math.max(1, Math.floor(beat.durationFrames / 3)));
  const fadeIn = Math.min(1, frame / fadeFrames);
  const fadeOut = Math.min(1, (beat.durationFrames - frame) / fadeFrames);
  const opacity = Math.max(0, Math.min(fadeIn, fadeOut));
  const styleType = packageConfig?.subtitleStyle?.type || 'hongqi';
  const position = packageConfig?.subtitleStyle?.position || 'bottom';
  const highlightWords = packageConfig?.subtitleStyle?.highlightWords || [];
  const isPlain = styleType === 'plain';
  const bg = styleType === 'clean' ? 'rgba(0, 0, 0, 0.48)' : styleType === 'social' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(185, 28, 28, 0.92)';
  const color = styleType === 'social' ? '#0f172a' : '#ffffff';
  const bottom = position === 'middle' ? 760 : 236;

  const renderLine = (line) => {
    let remaining = line;
    const parts = [];
    highlightWords.filter(Boolean).forEach((word) => {
      const index = remaining.indexOf(word);
      if (index >= 0) {
        if (index > 0) parts.push({ text: remaining.slice(0, index), highlight: false });
        parts.push({ text: word, highlight: true });
        remaining = remaining.slice(index + word.length);
      }
    });
    if (remaining) parts.push({ text: remaining, highlight: false });
    return parts.length ? parts : [{ text: line, highlight: false }];
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        right: 70,
        bottom,
        padding: isPlain ? 0 : '30px 38px',
        borderRadius: isPlain ? 0 : 24,
        background: isPlain ? 'transparent' : bg,
        opacity,
      }}
    >
      {splitText(beat.text).map((line) => (
        <div
          key={line}
          style={{
            color,
            fontSize: 52,
            fontWeight: 950,
            lineHeight: 1.28,
            textAlign: 'center',
            textShadow: isPlain ? '0 3px 14px rgba(0,0,0,0.72), 0 1px 2px rgba(0,0,0,0.86)' : 'none',
          }}
        >
          {renderLine(line).map((part, index) => (
            <span key={`${part.text}-${index}`} style={{ color: part.highlight ? '#b91c1c' : color }}>
              {part.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function PackageOverlays({ data }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const packageConfig = data.packageConfig || {};
  const overlays = Array.isArray(packageConfig.overlays) ? packageConfig.overlays : [];
  const effects = packageConfig.effects || {};
  const activeOverlays = overlays.filter((item) => {
    const start = Math.round(Number(item.start || 0) * fps);
    const duration = Math.round(Number(item.duration || 0) * fps);
    return frame >= start && frame <= start + Math.max(duration, 1);
  });

  return (
    <>
      {effects.vignette > 0 && (
        <AbsoluteFill
          style={{
            boxShadow: `inset 0 0 220px rgba(0, 0, 0, ${Math.min(Number(effects.vignette || 0), 0.5)})`,
            pointerEvents: 'none',
          }}
        />
      )}
      {activeOverlays.map((item, index) => {
        if (item.type === 'bigTitle') {
          return (
            <div
              key={`${item.type}-${index}`}
              style={{
                position: 'absolute',
                left: 70,
                right: 70,
                top: 238,
                color: '#ffffff',
                fontSize: 76,
                fontWeight: 950,
                lineHeight: 1.08,
                textShadow: '0 10px 28px rgba(0,0,0,0.42)',
              }}
            >
              {item.text}
            </div>
          );
        }
        if (item.type === 'sectionLabel') {
          return (
            <div
              key={`${item.type}-${index}`}
              style={{
                position: 'absolute',
                left: 70,
                top: 158,
                padding: '10px 18px',
                borderRadius: 999,
                color: '#b91c1c',
                background: '#ffffff',
                fontSize: 28,
                fontWeight: 950,
              }}
            >
              {item.text}
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

function VoiceSequences({ voicePackage, fps }) {
  const segments = Array.isArray(voicePackage?.segments) ? voicePackage.segments : [];
  return segments.map((segment) => (
    <Sequence
      key={segment.audioUrl}
      from={Math.round((segment.startMs || 0) / 1000 * fps)}
      durationInFrames={Math.max(1, Math.round(((segment.endMs || segment.durationMs || 1000) - (segment.startMs || 0)) / 1000 * fps))}
    >
      <Audio src={segment.audioUrl} />
    </Sequence>
  ));
}

export function SeedVideo({ data }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const timelineBeats = buildTimelineBeats(data, fps);
  const materialClips = buildMaterialClips(data, fps, timelineBeats);
  const progress = frame / Math.max(1, durationInFrames - 1);
  const packageConfig = data.packageConfig || {};
  const cornerBadge = Array.isArray(packageConfig.overlays)
    ? packageConfig.overlays.find((item) => item.type === 'cornerBadge')
    : null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0b1220',
        color: 'white',
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        filter: `contrast(${Number(packageConfig.effects?.contrast || 1)}) saturate(${Number(packageConfig.effects?.saturation || 1)})`,
      }}
    >
      {materialClips.map((clip) => (
        <Sequence key={`material-${clip.id}`} from={clip.fromFrame} durationInFrames={clip.durationFrames}>
          <MaterialSequence beat={clip} packageConfig={packageConfig} />
        </Sequence>
      ))}

      {timelineBeats.map((beat) => (
        <Sequence key={`subtitle-${beat.id}`} from={beat.fromFrame} durationInFrames={beat.durationFrames}>
          <SubtitleSequence beat={beat} packageConfig={packageConfig} />
        </Sequence>
      ))}

      <PackageOverlays data={data} />

      <VoiceSequences voicePackage={data.voicePackage} fps={fps} />

      {cornerBadge && (
        <div
          style={{
            position: 'absolute',
            left: 70,
            top: 72,
            padding: '12px 22px',
            borderRadius: 999,
            color: '#ffffff',
            background: '#b91c1c',
            fontSize: 28,
            fontWeight: 900,
          }}
        >
          {cornerBadge.text || data.title}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: 70,
          right: 70,
          bottom: 128,
          height: 12,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.18)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 999, background: '#ffffff' }} />
      </div>
    </AbsoluteFill>
  );
}
