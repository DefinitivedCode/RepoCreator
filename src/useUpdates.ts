import { useEffect, useRef, useState } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import type { Preferences } from './types';

export interface UpdatePreferences {
  channel: 'stable' | 'beta';
  automatic: boolean;
}
interface Offer {
  version: string;
  notes: string;
}
interface Progress {
  downloaded: number;
  total: number | null;
}
type Phase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing';
const defaults: UpdatePreferences = { channel: 'stable', automatic: true };
const messageOf = (error: unknown) =>
  typeof error === 'object' && error && 'message' in error
    ? String(error.message)
    : 'The update service is unavailable. Check your connection and try again.';

export function useUpdates(preferences: Preferences | null) {
  const [settings, setSettings] = useState<UpdatePreferences>(defaults);
  const [info, setInfo] = useState<{
    currentVersion: string;
    configured: boolean;
    unavailableReason?: string;
  } | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('Not checked yet.');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<Progress>({ downloaded: 0, total: null });
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialized = useRef(false);
  const active = useRef(false);
  const busy = saving || phase === 'checking' || phase === 'downloading' || phase === 'installing';

  async function check(channel = settings.channel) {
    if (active.current) return;
    active.current = true;
    setPhase('checking');
    setError('');
    setOffer(null);
    setStatus('Checking for updates…');
    try {
      const available = await invoke<Offer | null>('check_for_updates');
      setOffer(available);
      setDismissed(false);
      setPhase(available ? 'available' : 'idle');
      const label = channel === 'stable' ? 'Stable' : 'Beta';
      setStatus(
        available
          ? `Version ${available.version} is available.`
          : `No newer eligible update is available on ${label}.`,
      );
    } catch (error) {
      setError(messageOf(error));
      setPhase('idle');
      setStatus('The last check did not complete.');
    } finally {
      active.current = false;
    }
  }
  useEffect(() => {
    if (!preferences || initialized.current) return;
    initialized.current = true;
    const saved = preferences.updates ?? defaults;
    setSettings(saved);
    void invoke<{ currentVersion: string; configured: boolean; unavailableReason?: string }>(
      'get_update_info',
    )
      .then((info) => {
        setInfo(info);
        if (saved.automatic && info.configured) void check(saved.channel);
        else if (!info.configured)
          setStatus(
            info.unavailableReason ?? 'Updates are not configured in this development build.',
          );
      })
      .catch((error) => setError(messageOf(error)));
  }, [preferences]);

  async function save(next: UpdatePreferences) {
    if (active.current) return;
    active.current = true;
    setSaving(true);
    setError('');
    try {
      await invoke('set_update_preferences', { updates: next });
      if (next.channel !== settings.channel) {
        setOffer(null);
        setPhase('idle');
        setStatus('Channel changed. Check for eligible updates.');
      }
      setSettings(next);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      active.current = false;
      setSaving(false);
    }
  }
  async function download() {
    if (active.current || !offer) return;
    active.current = true;
    setPhase('downloading');
    setError('');
    setProgress({ downloaded: 0, total: null });
    const onProgress = new Channel<Progress>();
    onProgress.onmessage = setProgress;
    try {
      const completed = await invoke<boolean>('download_update', { onProgress });
      setPhase(completed ? 'ready' : 'available');
      setStatus(
        completed
          ? 'Download verified. Ready to update and restart.'
          : 'Download cancelled. You can retry later.',
      );
    } catch (error) {
      setError(messageOf(error));
      setPhase('available');
    } finally {
      active.current = false;
    }
  }
  async function install() {
    if (active.current || phase !== 'ready') return;
    active.current = true;
    setPhase('installing');
    setError('');
    try {
      await invoke('install_update');
    } catch (error) {
      setError(messageOf(error));
      setPhase('ready');
    } finally {
      active.current = false;
    }
  }
  async function cancel() {
    try {
      await invoke('cancel_update_download');
    } catch (error) {
      setError(messageOf(error));
    }
  }
  return {
    settings,
    info,
    offer,
    phase,
    status,
    error,
    progress,
    busy,
    dismissed,
    check,
    save,
    download,
    install,
    cancel,
    later: () => {
      setDismissed(true);
      setStatus('Update postponed. Return to Updates when you are ready.');
    },
  };
}
export type Updates = ReturnType<typeof useUpdates>;
