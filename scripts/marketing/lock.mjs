import fs from 'node:fs';
import path from 'node:path';

export const withCampaignLock = async (directory, action) => {
  const file = path.join(fs.realpathSync(directory), '.campaign.lock');
  let descriptor;
  try {
    descriptor = fs.openSync(file, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        `CAMPAIGN_LOCKED: another operation owns ${file}. If interrupted, confirm its recorded PID has exited before removing the lock.`,
        {cause: error},
      );
    throw error;
  }
  try {
    fs.writeFileSync(
      descriptor,
      JSON.stringify({pid: process.pid, startedAt: new Date().toISOString()}),
    );
    return await action();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(file);
  }
};
