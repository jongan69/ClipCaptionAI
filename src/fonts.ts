/**
 * Caption font contract.
 *
 * Caption styles reference brand fonts that ship with common desktop OSes
 * ("Arial Rounded MT Bold", "Snell Roundhand", "Avenir Next", ...). Renders
 * are deterministic per machine, but a headless render server WITHOUT these
 * fonts will silently substitute a fallback and the caption look will diverge
 * from studio output.
 *
 * Until the fonts are bundled and registered via loadFont/staticFile, every
 * render machine must have these installed. `warnOnMissingFonts()` is called
 * from Root's calculateMetadata so missing fonts produce a loud warning in
 * the render log instead of a silent visual diff.
 */

export const CAPTION_FONT_FAMILIES = [
  'Arial Rounded MT Bold',
  'Avenir Next',
  'Arial Black',
  'Snell Roundhand',
  'Apple Chancery',
  'Inter',
  'Segoe UI',
] as const;

export const warnOnMissingFonts = () => {
  try {
    if (typeof document === 'undefined' || !document.fonts) {
      return;
    }

    const missing = CAPTION_FONT_FAMILIES.filter(
      (family) => !document.fonts.check(`16px "${family}"`),
    );

    if (missing.length > 0) {
      console.warn(
        `[ClipCaptionAI] Missing caption fonts (renders will substitute fallbacks): ${missing.join(', ')}. ` +
          'Install these fonts on the render machine or bundle them with loadFont for pixel-identical output.',
      );
    }
  } catch {
    // Font checking is advisory — never fail a render because of it.
  }
};
