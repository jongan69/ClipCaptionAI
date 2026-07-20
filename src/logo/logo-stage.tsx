import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {LogoModel, LogoVariantProps} from './types';

/**
 * The stage every variant renders inside. It owns the frame/config plumbing so a
 * generated variant is a pure function of (logo, frame) and nothing else.
 */
export const LogoStage: React.FC<{
  logo: LogoModel;
  variant: React.ComponentType<LogoVariantProps>;
  background?: string;
}> = ({logo, variant: Variant, background}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: background ?? logo.brand.palette.background ?? '#000',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Variant logo={logo} frame={frame} fps={fps} width={width} height={height} />
    </AbsoluteFill>
  );
};

/**
 * Injects a layer's original SVG markup. Variants use this when they want the
 * artwork verbatim and only need to animate the wrapping <g> transform.
 *
 * Safe: the markup comes from the repo's own asset pipeline, never user input.
 */
export const RawLayer: React.FC<{
  logo: LogoModel;
  id: string;
  style?: React.CSSProperties;
}> = ({logo, id, style}) => {
  const layer = logo.layer(id);
  if (!layer) {
    return null;
  }
  return (
    <g
      style={style}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{__html: layer.markup}}
    />
  );
};

/** Shared <defs> — gradients and clip paths that layer markup references by id. */
export const LogoDefs: React.FC<{logo: LogoModel}> = ({logo}) => (
  <g
    // eslint-disable-next-line react/no-danger
    dangerouslySetInnerHTML={{__html: logo.defs}}
  />
);

/** Root <svg> sized to the logo's viewBox and letterboxed into the composition. */
export const LogoSvg: React.FC<{
  logo: LogoModel;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({logo, children, style}) => (
  <svg
    viewBox={logo.viewBox}
    width="100%"
    height="100%"
    xmlns="http://www.w3.org/2000/svg"
    style={{overflow: 'visible', ...style}}
  >
    <LogoDefs logo={logo} />
    {children}
  </svg>
);
