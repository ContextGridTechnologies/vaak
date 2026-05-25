import { useEffect, useState } from "react";

import { VoiceSetupPanel } from "@/features/onboarding";
import { useMicrophoneSelection } from "@/hooks/useMicrophoneSelection";
import {
  getAccessibilityPermissionStatus,
  getInputMonitoringPermissionStatus,
  isTauriRuntime,
  type PermissionStatus,
} from "@/lib/tauri";

export function DictationPanel() {
  const { hasPermission } = useMicrophoneSelection();
  const tauriAvailable = isTauriRuntime();
  const [accessibilityPermission, setAccessibilityPermission] =
    useState<PermissionStatus | null>(null);
  const [inputMonitoringPermission, setInputMonitoringPermission] =
    useState<PermissionStatus | null>(null);

  useEffect(() => {
    if (!tauriAvailable) {
      setAccessibilityPermission(null);
      setInputMonitoringPermission(null);
      return;
    }

    let active = true;
    getAccessibilityPermissionStatus()
      .then((status) => {
        if (active) {
          setAccessibilityPermission(status);
        }
      })
      .catch(() => {
        if (active) {
          setAccessibilityPermission(null);
        }
      });
    getInputMonitoringPermissionStatus()
      .then((status) => {
        if (active) {
          setInputMonitoringPermission(status);
        }
      })
      .catch(() => {
        if (active) {
          setInputMonitoringPermission(null);
        }
      });

    return () => {
      active = false;
    };
  }, [tauriAvailable]);

  return (
    <VoiceSetupPanel
      accessibilityPermission={accessibilityPermission}
      inputMonitoringPermission={inputMonitoringPermission}
      hasMicrophonePermission={hasPermission}
      tauriAvailable={tauriAvailable}
    />
  );
}
