/** Rear-facing is a direction, not a promise of the phone's standard 1× lens. */
export async function requestCamera(deviceId: string) {
  const video: MediaTrackConstraints = {
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
    width: { ideal: 1280 },
    height: { ideal: 960 },
  };
  try {
    return { media: await navigator.mediaDevices.getUserMedia({ audio: false, video }), reset: false };
  } catch (error) {
    if (
      !deviceId ||
      !(error instanceof DOMException) ||
      !['NotFoundError', 'OverconstrainedError'].includes(error.name)
    )
      throw error;
    // Device IDs may change after browser data is cleared or a camera is unplugged.
    return {
      media: await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
      }),
      reset: true,
    };
  }
}
