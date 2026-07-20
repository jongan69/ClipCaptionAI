import {spawnSync} from 'node:child_process';

export const commandExists = (command) => {
  return commandPath(command) !== null;
};

export const commandPath = (command) => {
  const trimmed = String(command ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const checkCommand = process.platform === 'win32' ? 'where' : 'which';

  try {
    const result = spawnSync(checkCommand, [trimmed], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      return null;
    }

    const text = String(result.stdout ?? '').trim();
    return text.split('\n')[0]?.trim() ?? null;
  } catch {
    return null;
  }
};
