type StopWorkflow = (session: string) => Promise<{stopped: boolean; reason?: string | null}>;

export async function requestWorkflowStop(
  session: string,
  stopWorkflow?: StopWorkflow,
): Promise<void> {
  if (!stopWorkflow) throw new Error('Cancellation is available in the desktop app.');
  const result = await stopWorkflow(session);
  if (!result.stopped) throw new Error(result.reason || 'The workflow could not be stopped.');
}
