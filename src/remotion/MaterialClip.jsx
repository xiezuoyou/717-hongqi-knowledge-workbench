import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

const palettes = {
  red: ['#0b1220', '#2a1116', '#b91c1c'],
  dark: ['#070b12', '#111827', '#475569'],
  blue: ['#07111f', '#10243d', '#2563eb'],
  gold: ['#111827', '#2c2414', '#d69e2e'],
};

function getMotionTransform(motion, progress) {
  if (motion === 'pan') {
    return `translateX(${interpolate(progress, [0, 1], [-28, 28])}px) scale(1.08)`;
  }
  if (motion === 'tilt') {
    return `translateY(${interpolate(progress, [0, 1], [26, -26])}px) scale(1.08)`;
  }
  return `scale(${interpolate(progress, [0, 1], [1, 1.14])})`;
}

export function MaterialClip({ clip }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = frame / Math.max(1, durationInFrames - 1);
  const palette = palettes[clip.tone] || palettes.red;
  const moving = getMotionTransform(clip.motion, progress);
  const glow = interpolate(progress, [0, 0.5, 1], [0.16, 0.34, 0.18]);

  return (
    <AbsoluteFill style={{ color: '#fff', fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(145deg, ${palette[0]} 0%, ${palette[1]} 54%, ${palette[2]} 100%)`,
          transform: moving,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          right: -150,
          top: 120,
          borderRadius: '50%',
          background: palette[2],
          opacity: glow,
          filter: 'blur(2px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 110,
          right: 60,
          height: 520,
          borderRadius: 34,
          border: '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(255,255,255,0.08)',
        }}
      />
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            left: 80 + index * 44,
            top: 260 + Math.sin(progress * Math.PI * 2 + index) * 28,
            width: 32,
            height: 210 + (index % 3) * 44,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.12)',
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: 72,
          top: 92,
          padding: '12px 20px',
          borderRadius: 999,
          background: palette[2],
          fontSize: 25,
          fontWeight: 900,
        }}
      >
        {clip.group} · {clip.theme}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 76,
          right: 76,
          bottom: 250,
          fontSize: 50,
          fontWeight: 900,
          lineHeight: 1.18,
        }}
      >
        {clip.name}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 76,
          right: 76,
          bottom: 128,
          padding: '22px 24px',
          borderRadius: 22,
          background: 'rgba(0,0,0,0.42)',
          fontSize: 29,
          fontWeight: 800,
          lineHeight: 1.35,
        }}
      >
        {clip.caption}
      </div>
    </AbsoluteFill>
  );
}
