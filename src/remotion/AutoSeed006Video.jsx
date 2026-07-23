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

function splitText(text, max = 13) {
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

function ClipLayer({ clip }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeFrames = Math.round(0.18 * fps);
  const fadeIn = Math.min(1, frame / Math.max(1, fadeFrames));
  const fadeOut = Math.min(1, (Math.round(clip.duration * fps) - frame) / Math.max(1, fadeFrames));
  const opacity = Math.max(0, Math.min(fadeIn, fadeOut));
  const clipFrames = Math.max(1, Math.round(clip.duration * fps));
  const scale = interpolate(frame, [0, clipFrames], [1.01, 1.08], {
    extrapolateRight: 'clamp',
  });
  const slide = interpolate(frame, [0, Math.min(16, clipFrames)], [90, 0], { extrapolateRight: 'clamp' });
  const band = interpolate(frame, [0, clipFrames], [-45, 115], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#140b0b', opacity }}>
      <AbsoluteFill style={{ filter: 'blur(34px) saturate(1.18)', transform: `scale(${scale * 1.2})`, opacity: 0.58 }}>
        <Video src={staticFile(clip.src)} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.14), rgba(0,0,0,0.58)), radial-gradient(circle at 18% 18%, rgba(220,38,38,0.34), transparent 28%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${band}%`,
          top: 0,
          width: 210,
          height: '100%',
          transform: 'skewX(-16deg)',
          background: 'rgba(239,68,68,0.32)',
          filter: 'blur(2px)',
        }}
      />
      <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translateX(${slide}px)` }}>
        <Video
          src={staticFile(clip.src)}
          muted
          loop
          style={{
            width: '94%',
            height: 'auto',
            maxHeight: '72%',
            objectFit: 'contain',
            transform: `scale(${scale})`,
            boxShadow: '0 28px 90px rgba(0,0,0,0.56)',
            border: '3px solid rgba(255,255,255,0.16)',
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Subtitle({ beat }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationFrames = Math.round(beat.duration * fps);
  const phrases = Array.isArray(beat.phrases) && beat.phrases.length > 0 ? beat.phrases : splitText(beat.text).map((text) => ({ text }));
  const phraseSlot = durationFrames / Math.max(1, phrases.length);
  const visibleCount = Math.min(phrases.length, Math.max(1, Math.floor(frame / Math.max(1, phraseSlot)) + 1));
  const opacity = Math.min(1, (durationFrames - frame) / Math.max(1, Math.round(0.18 * fps)));

  return (
    <div
      style={{
        position: 'absolute',
        left: 64,
        right: 64,
        bottom: 176,
        opacity,
        textAlign: 'center',
        color: '#fff',
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
        {phrases.slice(0, visibleCount).map((phrase, index) => {
          const localFrame = frame - index * phraseSlot;
          const entrance = spring({ frame: Math.max(0, localFrame), fps, config: { damping: 11, stiffness: 180 } });
          return (
            <div
              key={`${phrase.text}-${index}`}
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                color: '#ffffff',
                fontSize: phrase.highlight ? 66 : 56,
                fontWeight: 950,
                lineHeight: 1.12,
                transform: `translateY(${interpolate(entrance, [0, 1], [32, 0])}px) scale(${interpolate(entrance, [0, 1], [0.88, 1])})`,
                textShadow: '0 5px 22px rgba(0,0,0,0.86), 0 1px 3px rgba(0,0,0,0.9)',
              }}
            >
              {phrase.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BgmAudio({ bgm }) {
  const { fps, durationInFrames } = useVideoConfig();
  if (!bgm?.src) return null;

  const volume = bgm.volume ?? 0.25;
  const bgmDuration = Number(bgm.duration || 0);
  if (!bgmDuration) {
    return <Audio src={staticFile(bgm.src)} volume={volume} loop />;
  }

  const bgmFrames = Math.max(1, Math.round(bgmDuration * fps));
  const loops = Math.max(1, Math.ceil(durationInFrames / bgmFrames));
  return Array.from({ length: loops }).map((_, index) => {
    const from = index * bgmFrames;
    const duration = Math.min(bgmFrames, durationInFrames - from);
    if (duration <= 0) return null;
    return (
      <Sequence key={`bgm-${index}`} from={from} durationInFrames={duration}>
        <Audio src={staticFile(bgm.src)} volume={volume} />
      </Sequence>
    );
  });
}

export function AutoSeed006Video({ data }) {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#090909', color: '#fff', fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif' }}>
      {data.materialClips.map((clip) => (
        <Sequence key={clip.id} from={Math.round(clip.start * fps)} durationInFrames={Math.round(clip.duration * fps)}>
          <ClipLayer clip={clip} />
        </Sequence>
      ))}

      {data.timelineBeats.map((beat) => (
        <Sequence key={beat.id} from={Math.round(beat.start * fps)} durationInFrames={Math.round(beat.duration * fps)}>
          <Subtitle beat={beat} />
        </Sequence>
      ))}

      {data.voiceClips?.map((voice) => (
        <Sequence key={voice.id} from={Math.round(voice.start * fps)} durationInFrames={Math.round(voice.duration * fps)}>
          <Audio src={staticFile(voice.src)} volume={voice.volume ?? 1} />
        </Sequence>
      ))}

      <BgmAudio bgm={data.bgm} />
    </AbsoluteFill>
  );
}
