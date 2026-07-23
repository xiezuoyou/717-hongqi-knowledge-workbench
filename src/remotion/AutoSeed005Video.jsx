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

function SoftClip({ clip }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const frames = Math.max(1, Math.round(clip.duration * fps));
  const fade = Math.round(0.55 * fps);
  const fadeIn = interpolate(frame, [0, fade], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [frames - fade, frames], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = Math.min(fadeIn, fadeOut);
  const scale = interpolate(frame, [0, frames], [1.02, 1.075], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#080706', opacity }}>
      <Video
        src={staticFile(clip.src)}
        muted
        loop
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale})`,
          filter: 'saturate(0.88) contrast(1.03) brightness(0.94)',
        }}
      />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.30) 58%, rgba(0,0,0,0.62)), radial-gradient(circle at 52% 42%, rgba(255,255,255,0.04), transparent 42%)',
        }}
      />
    </AbsoluteFill>
  );
}

function splitSubtitle(text) {
  if (text.length <= 14) return [text];
  const marks = ['，', '。', '？'];
  const lines = [];
  let current = '';
  for (const char of text) {
    current += char;
    if (marks.includes(char) && current.length >= 8) {
      lines.push(current);
      current = '';
    }
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines;
  return [lines.slice(0, -1).join(''), lines[lines.length - 1]];
}

function Subtitle({ beat }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const durationFrames = Math.round(beat.duration * fps);
  const entrance = spring({ frame, fps, config: { damping: 16, stiffness: 95 } });
  const opacity = Math.min(
    interpolate(frame, [0, Math.round(0.35 * fps)], [0, 1], { extrapolateRight: 'clamp' }),
    interpolate(frame, [durationFrames - Math.round(0.35 * fps), durationFrames], [1, 0], { extrapolateLeft: 'clamp' })
  );
  const lines = splitSubtitle(beat.text);

  return (
    <div
      style={{
        position: 'absolute',
        left: 96,
        right: 96,
        bottom: 82,
        display: 'grid',
        gap: 12,
        justifyItems: 'center',
        opacity,
        transform: `translateY(${interpolate(entrance, [0, 1], [16, 0])}px)`,
        fontFamily: 'Songti SC, STSong, PingFang SC, Microsoft YaHei, serif',
      }}
    >
      {lines.map((line, index) => (
        <div
          key={`${line}-${index}`}
          style={{
            color: '#fff',
            fontSize: 44,
            fontWeight: 500,
            lineHeight: 1.18,
            letterSpacing: 0,
            textAlign: 'center',
            textShadow: '0 3px 18px rgba(0,0,0,0.82), 0 1px 2px rgba(0,0,0,0.95)',
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

function BgmAudio({ bgm }) {
  const { fps, durationInFrames } = useVideoConfig();
  if (!bgm?.src) return null;
  const volume = bgm.volume ?? 0.18;
  const bgmDuration = Number(bgm.duration || 0);
  if (!bgmDuration) return <Audio src={staticFile(bgm.src)} volume={volume} loop />;

  const bgmFrames = Math.max(1, Math.round(bgmDuration * fps));
  const loops = Math.max(1, Math.ceil(durationInFrames / bgmFrames));
  return Array.from({ length: loops }).map((_, index) => {
    const from = index * bgmFrames;
    const durationInFramesForLoop = Math.min(bgmFrames, durationInFrames - from);
    if (durationInFramesForLoop <= 0) return null;
    return (
      <Sequence key={`bgm-${index}`} from={from} durationInFrames={durationInFramesForLoop}>
        <Audio src={staticFile(bgm.src)} volume={volume} />
      </Sequence>
    );
  });
}

export function AutoSeed005Video({ data }) {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#080706', color: '#fff' }}>
      {data.materialClips.map((clip) => (
        <Sequence
          key={clip.id}
          from={Math.round(clip.start * fps)}
          durationInFrames={Math.round(clip.duration * fps)}
        >
          <SoftClip clip={clip} />
        </Sequence>
      ))}

      {data.timelineBeats.map((beat) => (
        <Sequence
          key={beat.id}
          from={Math.round(beat.start * fps)}
          durationInFrames={Math.round(beat.duration * fps)}
        >
          <Subtitle beat={beat} />
        </Sequence>
      ))}

      {data.voiceClips?.map((voice) => (
        <Sequence
          key={voice.id}
          from={Math.round(voice.start * fps)}
          durationInFrames={Math.round(voice.duration * fps)}
        >
          <Audio src={staticFile(voice.src)} volume={voice.volume ?? 1} playbackRate={voice.playbackRate ?? 1} />
        </Sequence>
      ))}

      <BgmAudio bgm={data.bgm} />
    </AbsoluteFill>
  );
}
