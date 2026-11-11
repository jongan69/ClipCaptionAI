const promptMarker = 'CLIPCAPTION HIGGSFIELD SHOT v1';

const text = (value, fallback) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim() || fallback;

export const buildHiggsfieldProductionPrompt = ({
  prompt,
  purpose,
  durationSeconds,
  aspectRatio,
  subjectLock,
  environmentLock,
  cameraLock,
  styleLock,
  beginningState,
  endingState,
  physicalRequirements,
  audioRequirements,
  avoid,
} = {}) => {
  const rawPrompt = String(prompt ?? '').trim();
  if (!rawPrompt) throw new Error('Higgsfield generation requires a non-empty prompt.');
  if (rawPrompt.startsWith(promptMarker)) return rawPrompt;
  const instruction = text(rawPrompt, '');

  const delivery = [
    durationSeconds ? `${durationSeconds}s` : null,
    aspectRatio || null,
    'one dominant action and one clear emotional or product beat',
  ]
    .filter(Boolean)
    .join(', ');

  return [
    promptMarker,
    `PURPOSE\n${text(purpose, 'Create one editable shot that serves the supplied brief.')}`,
    `DELIVERY\n${delivery}`,
    `GLOBAL LOCK\nSubject/product: ${text(subjectLock, 'Preserve the exact recurring identity, proportions, wardrobe, product geometry, condition, labels, props, and accessories established by the references and brief.')}\nEnvironment: ${text(environmentLock, 'Keep location, set dressing, lighting, weather, time of day, and background activity internally consistent.')}\nCamera: ${text(cameraLock, 'Use motivated, physically plausible camera placement and movement appropriate to the requested format.')}\nStyle: ${text(styleLock, 'Match the requested native, commercial, documentary, animated, or experimental language; do not impose a generic cinematic look.')}`,
    `SHOT INSTRUCTION\n${instruction}`,
    `CONTINUITY IN\n${text(beginningState, 'Begin from a stable, readable pre-action state with a short edit handle when possible.')}`,
    `CONTINUITY OUT\n${text(endingState, 'Complete the action and settle into a stable, edit-ready ending state with a short handle when possible.')}`,
    `PHYSICAL REQUIREMENTS\n${text(physicalRequirements, 'Believable anatomy and weight transfer when people are visible; stable identity and proportions; correct object contact, scale, reflections, shadows, momentum, and environmental response.')}`,
    `AUDIO REQUIREMENTS\n${text(audioRequirements, 'Do not invent dialogue, narration, music, or written text. Audio and exact typography are added in post unless the brief explicitly requires native synchronized sound.')}`,
    `AVOID\n${text(avoid, 'Face or body drift, malformed hands or limbs, sliding feet, wardrobe or prop mutation, disappearing or duplicated objects, broken physics, background collapse, texture flicker, unmotivated eye contact or gestures, abrupt camera behavior, generated captions, misspelled text, logos, and watermarks.')}`,
  ].join('\n\n');
};

export const withHiggsfieldProductionPrompt = (argv, context = {}) => {
  const next = [...argv];
  const prompts = next.filter((arg) => arg === '--prompt' || arg.startsWith('--prompt='));
  if (prompts.length > 1) throw new Error('Higgsfield requires exactly one --prompt option.');
  const promptIndex = next.findIndex((arg) => arg === '--prompt' || arg.startsWith('--prompt='));
  if (promptIndex < 0) return next;
  const inline = next[promptIndex].startsWith('--prompt=');
  const rawPrompt = inline ? next[promptIndex].slice('--prompt='.length) : next[promptIndex + 1];
  if (!rawPrompt?.trim() || rawPrompt.startsWith('--'))
    throw new Error('Higgsfield --prompt requires a value.');
  const option = (name) => {
    const index = next.findIndex((arg) => arg === name || arg.startsWith(`${name}=`));
    if (index < 0) return undefined;
    return next[index] === name ? next[index + 1] : next[index].slice(name.length + 1);
  };
  const prompt = buildHiggsfieldProductionPrompt({
    ...context,
    prompt: rawPrompt,
    durationSeconds: context.durationSeconds ?? option('--duration'),
    aspectRatio: context.aspectRatio ?? option('--aspect_ratio') ?? option('--aspect-ratio'),
  });
  next[inline ? promptIndex : promptIndex + 1] = inline ? `--prompt=${prompt}` : prompt;
  return next;
};

export const higgsfieldPromptMarker = promptMarker;
