import { useCallback, useEffect, useMemo, useState } from "react";

import type { AudioInputDevice } from "@/hooks/useAudioDevices";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { normalizeError } from "@/lib/errors";
import {
  getMicrophoneSelection,
  isTauriRuntime,
  listenToTauriEvent,
  MICROPHONE_SELECTION_CHANGED_EVENT,
  saveMicrophoneSelection,
  type MicrophoneSelection,
} from "@/lib/tauri";

export type { MicrophoneSelection } from "@/lib/tauri";

export type ActiveMicrophone = {
  deviceId: string | null;
  label: string;
};

type UseMicrophoneSelectionState = {
  activeMicrophone: ActiveMicrophone | null;
  devices: AudioInputDevice[];
  error: string | null;
  hasPermission: boolean;
  isLoading: boolean;
  isManualUnavailable: boolean;
  isResolving: boolean;
  manualUnavailableMessage: string | null;
  selection: MicrophoneSelection;
};

type UseMicrophoneSelectionActions = {
  refresh: () => Promise<void>;
  requestMicrophoneAccess: () => Promise<ActiveMicrophone | null>;
  requestPermission: () => Promise<void>;
  selectManual: (deviceId: string) => Promise<void>;
  selectSystem: () => Promise<void>;
};

const DEFAULT_SELECTION: MicrophoneSelection = { mode: "system" };
const MANUAL_UNAVAILABLE_MESSAGE =
  "Selected microphone is unavailable. Choose another device or switch to automatic mode.";

export function microphoneConstraints(
  selection: MicrophoneSelection,
): MediaStreamConstraints {
  if (selection.mode === "manual") {
    return { audio: { deviceId: { exact: selection.deviceId } } };
  }

  return { audio: true };
}

export function activeMicrophoneFromStream(
  stream: MediaStream,
): ActiveMicrophone | null {
  const track = stream.getAudioTracks()[0];
  if (!track) {
    return null;
  }

  return {
    deviceId: track.getSettings().deviceId ?? null,
    label: track.label || "Unknown microphone",
  };
}

export async function resolveActiveMicrophone(
  selection: MicrophoneSelection,
): Promise<ActiveMicrophone> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone access is not available in this environment.");
  }

  const stream = await navigator.mediaDevices.getUserMedia(
    microphoneConstraints(selection),
  );

  try {
    const activeMicrophone = activeMicrophoneFromStream(stream);
    if (!activeMicrophone) {
      throw new Error("No active microphone track was opened.");
    }

    return activeMicrophone;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export function isManualSelectionUnavailable(
  selection: MicrophoneSelection,
  devices: AudioInputDevice[],
): boolean {
  return (
    selection.mode === "manual" &&
    devices.length > 0 &&
    !devices.some((device) => device.deviceId === selection.deviceId)
  );
}

export function useMicrophoneSelection(): UseMicrophoneSelectionState &
  UseMicrophoneSelectionActions {
  const {
    devices,
    error: deviceError,
    hasPermission,
    isLoading,
    refresh,
    requestPermission,
  } = useAudioDevices();
  const [selection, setSelection] =
    useState<MicrophoneSelection>(DEFAULT_SELECTION);
  const [activeMicrophone, setActiveMicrophone] =
    useState<ActiveMicrophone | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    getMicrophoneSelection()
      .then((loadedSelection) => {
        if (!cancelled) {
          setSelection(loadedSelection);
          setSelectionError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSelectionError(normalizeError(err));
        }
      });

    void listenToTauriEvent<MicrophoneSelection>(
      MICROPHONE_SELECTION_CHANGED_EVENT,
      (event) => {
        setSelection(event.payload);
        setSelectionError(null);
        setActiveMicrophone(null);
      },
    ).then((detach) => {
      if (cancelled) {
        detach();
        return;
      }
      unlisten = detach;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const isManualUnavailable = useMemo(
    () => isManualSelectionUnavailable(selection, devices),
    [devices, selection],
  );
  const manualUnavailableMessage = isManualUnavailable
    ? MANUAL_UNAVAILABLE_MESSAGE
    : null;

  const persistSelection = useCallback(
    async (nextSelection: MicrophoneSelection) => {
      if (nextSelection.mode === "manual" && !nextSelection.deviceId.trim()) {
        setSelectionError("Choose a microphone before using manual selection.");
        return;
      }

      setSelection(nextSelection);
      setSelectionError(null);
      setActiveMicrophone(null);

      if (!isTauriRuntime()) {
        return;
      }

      try {
        const savedSelection = await saveMicrophoneSelection(nextSelection);
        setSelection(savedSelection);
      } catch (err) {
        setSelectionError(normalizeError(err));
      }
    },
    [],
  );

  const requestMicrophoneAccess = useCallback(async () => {
    if (isManualSelectionUnavailable(selection, devices)) {
      setActiveMicrophone(null);
      setSelectionError(MANUAL_UNAVAILABLE_MESSAGE);
      return null;
    }

    setIsResolving(true);
    setSelectionError(null);
    try {
      const resolved = await resolveActiveMicrophone(selection);
      setActiveMicrophone(resolved);
      await refresh();
      return resolved;
    } catch (err) {
      setActiveMicrophone(null);
      setSelectionError(normalizeError(err));
      return null;
    } finally {
      setIsResolving(false);
    }
  }, [devices, refresh, selection]);

  useEffect(() => {
    if (isManualUnavailable) {
      setActiveMicrophone(null);
      setSelectionError(MANUAL_UNAVAILABLE_MESSAGE);
      return;
    }

    if (!hasPermission) {
      return;
    }

    let cancelled = false;
    setIsResolving(true);
    setSelectionError(null);
    resolveActiveMicrophone(selection)
      .then((resolved) => {
        if (!cancelled) {
          setActiveMicrophone(resolved);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setActiveMicrophone(null);
          setSelectionError(normalizeError(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsResolving(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasPermission, isManualUnavailable, selection]);

  return {
    activeMicrophone,
    devices,
    error: selectionError ?? deviceError,
    hasPermission,
    isLoading,
    isManualUnavailable,
    isResolving,
    manualUnavailableMessage,
    refresh,
    requestMicrophoneAccess,
    requestPermission,
    selectManual: (deviceId: string) =>
      persistSelection({ mode: "manual", deviceId }),
    selectSystem: () => persistSelection({ mode: "system" }),
    selection,
  };
}
