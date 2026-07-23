import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

function splitLabel(text, max = 9) {
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

export function PlaceholderMaterial({ clip }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = frame / Math.max(1, durationInFrames - 1);
  const scale = interpolate(progress, [0, 1], [1, 1.025]);

  return (
    <AbsoluteFill
      style={{
        background: 'linear-gradient(135deg, #7f1d1d 0%, #111827 54%, #27272a 100%)',
        color: '#ffffff',
        fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          transform: `scale(${scale})`,
          background:
            'radial-gradient(circle at 18% 18%, rgba(255,255,255,0.16), transparent 30%), radial-gradient(circle at 78% 72%, rgba(220,38,38,0.22), transparent 34%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 78,
          top: 70,
          padding: '14px 24px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.14)',
          border: '1px solid rgba(255,255,255,0.28)',
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: 0,
        }}
      >
        {clip.segment}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 90,
          right: 90,
          top: 300,
          textAlign: 'center',
          fontSize: 100,
          lineHeight: 1.12,
          fontWeight: 950,
          textShadow: '0 10px 28px rgba(0,0,0,0.42)',
        }}
      >
        {splitLabel(clip.detail).map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 110,
          right: 110,
          bottom: 118,
          textAlign: 'center',
          fontSize: 36,
          lineHeight: 1.3,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.82)',
        }}
      >
        这是一个 4:3 测试素材，用于验证素材匹配和剪辑流程
      </div>
    </AbsoluteFill>
  );
}
