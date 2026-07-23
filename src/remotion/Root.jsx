import React from 'react';
import { Composition } from 'remotion';
import data from './render-data.json';
import materialData from './material-data.json';
import placeholderMaterialData from './placeholder-material-data.json';
import autoSeed006Data from './auto-seed006-data.json';
import autoSeed006RealData from './auto-seed006-real-data.json';
import autoSeed005Data from './auto-seed005-data.json';
import { AutoSeed006Video } from './AutoSeed006Video.jsx';
import { AutoSeed005Video } from './AutoSeed005Video.jsx';
import { MaterialClip } from './MaterialClip.jsx';
import { PlaceholderMaterial } from './PlaceholderMaterial.jsx';
import { SeedVideo } from './SeedVideo.jsx';

const FPS = 30;

function getDurationSeconds() {
  if (data.voicePackage?.durationMs) {
    return data.voicePackage.durationMs / 1000;
  }
  if (Array.isArray(data.timelineBeats) && data.timelineBeats.length > 0) {
    return data.timelineBeats.reduce((max, beat) => Math.max(max, (beat.start || 0) + (beat.duration || 0)), 0);
  }
  return data.slices.reduce((sum, slice) => sum + slice.duration, 0);
}

function getCompositionSize() {
  const ratio = data.canvasRatio || data.workflowProject?.canvasRatio || '3:4';
  if (ratio === '9:16') return { width: 1080, height: 1920 };
  if (ratio === '4:3') return { width: 1440, height: 1080 };
  return { width: 1080, height: 1440 };
}

function getAutoCompositionSize(autoData) {
  const ratio = autoData.canvasRatio || '9:16';
  if (ratio === '4:3') return { width: 1440, height: 1080 };
  if (ratio === '3:4') return { width: 1080, height: 1440 };
  return { width: 1080, height: 1920 };
}

export function RemotionRoot() {
  const durationInFrames = Math.ceil(getDurationSeconds() * FPS);
  const size = getCompositionSize();

  return (
    <>
      <Composition
        id="SeedVideo"
        component={SeedVideo}
        durationInFrames={durationInFrames}
        fps={FPS}
        width={size.width}
        height={size.height}
        defaultProps={{ data }}
      />
      <Composition
        id="AutoSeed006Video"
        component={AutoSeed006Video}
        durationInFrames={Math.round((autoSeed006Data.duration || 24) * FPS)}
        fps={FPS}
        width={getAutoCompositionSize(autoSeed006Data).width}
        height={getAutoCompositionSize(autoSeed006Data).height}
        defaultProps={{ data: autoSeed006Data }}
      />
      <Composition
        id="AutoSeed006RealVideo"
        component={AutoSeed006Video}
        durationInFrames={Math.round((autoSeed006RealData.duration || 1) * FPS)}
        fps={FPS}
        width={getAutoCompositionSize(autoSeed006RealData).width}
        height={getAutoCompositionSize(autoSeed006RealData).height}
        defaultProps={{ data: autoSeed006RealData }}
      />
      <Composition
        id="AutoSeed005Video"
        component={AutoSeed005Video}
        durationInFrames={Math.round((autoSeed005Data.duration || 1) * FPS)}
        fps={FPS}
        width={1440}
        height={1080}
        defaultProps={{ data: autoSeed005Data }}
      />
      {materialData.clips.map((clip) => (
        <Composition
          key={clip.id}
          id={clip.id}
          component={MaterialClip}
          durationInFrames={Math.round(clip.duration * FPS)}
          fps={FPS}
          width={720}
          height={1280}
          defaultProps={{ clip }}
        />
      ))}
      {placeholderMaterialData.clips.map((clip) => (
        <Composition
          key={clip.id}
          id={clip.id}
          component={PlaceholderMaterial}
          durationInFrames={Math.round(clip.duration * FPS)}
          fps={FPS}
          width={1440}
          height={1080}
          defaultProps={{ clip }}
        />
      ))}
    </>
  );
}
