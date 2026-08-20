// electron-builder afterSign hook (macOS only).
//
// Notarizes the built .app via @electron/notarize when Apple credentials
// are present in the environment. Without them the step is skipped so
// local/CI packaging still works — but distributed builds must set:
//   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
// (and sign with a Developer ID identity) or Gatekeeper will block them.
module.exports = async function notarizeIfConfigured(context) {
  const {notarize} = await import('@electron/notarize');
  const path = (await import('node:path')).default;
  const {electronPlatformName, appOutDir, packager} = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const {APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID} = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log(
      'Notarization skipped: set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID to notarize.',
    );
    return;
  }

  const appName = packager?.appInfo?.productFilename || 'ClipCaptionAI';
  const appPath = path.join(appOutDir, `${appName}.app`);
  console.log(`Notarizing ${appPath} ...`);

  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
};
