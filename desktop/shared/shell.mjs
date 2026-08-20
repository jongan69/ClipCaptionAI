import {spawn} from 'node:child_process';

/**
 * Async spawn with progress parsing and cancellation support.
 *
 * Usage:
 *   const proc = spawnAsync('ffmpeg', ['-i', 'in.mp4', 'out.mp4'], {
 *     onProgress: ({ percent, message }) => console.log(`${percent}%`),
 *     signal: abortController.signal,
 *   });
 *   const { code, stdout, stderr } = await proc;
 */
export function spawnAsync(command, args = [], options = {}) {
  const {cwd, env, onProgress, signal, progressParser, timeout = 0, ...spawnOptions} = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {...process.env, ...env},
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...spawnOptions,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let timer = null;

    if (timeout > 0) {
      timer = setTimeout(() => {
        killLadder(child);
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
      }, timeout);
    }

    // Progress parsing from stderr (ffmpeg convention)
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;

      if (progressParser) {
        const parsed = progressParser(text);
        if (parsed) onProgress?.(parsed);
      }
    });

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({code, signal, stdout, stderr, killed});
    });

    // Cancellation
    if (signal) {
      if (signal.aborted) {
        killLadder(child);
        killed = true;
      } else {
        signal.addEventListener(
          'abort',
          () => {
            killLadder(child);
            killed = true;
          },
          {once: true},
        );
      }
    }
  });
}

/**
 * Graceful kill ladder: SIGINT → (900ms) SIGTERM → (800ms) SIGKILL
 */
export function killLadder(child) {
  if (child.killed) return;
  try {
    child.kill('SIGINT');
  } catch {
    /* best-effort — child may already be gone */
  }

  setTimeout(() => {
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* best-effort — child may already be gone */
      }
    }
  }, 900);

  setTimeout(() => {
    if (!child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* best-effort — child may already be gone */
      }
    }
  }, 1700);
}

/**
 * Parse ffmpeg progress output ("out_time_ms=1234567\nprogress=continue")
 */
export function parseFfmpegProgress(line) {
  const timeMatch = line.match(/^out_time_ms=(\d+)/m);
  const endMatch = line.match(/^progress=end/m);
  if (endMatch) return {percent: 100, message: 'Complete'};
  if (timeMatch) {
    // Percent is relative — caller must provide total duration
    return {timeMs: parseInt(timeMatch[1], 10)};
  }
  return null;
}

/**
 * Parse yt-dlp progress output
 */
export function parseYtDlpProgress(line) {
  const match = line.match(/download:([\d.]+)%/);
  if (match) return {percent: parseFloat(match[1]), message: 'Downloading'};
  return null;
}
