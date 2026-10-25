import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { applyAppearance, normalizeHex } from './appearance';
import {
  appError,
  blankForm,
  configurationOf,
  configurationError,
  configurationForPreset,
  creationRequestOf,
  formError,
  nameError,
  optionsError,
  previewRequestOf,
} from './validation';
import type {
  AppError,
  Accent,
  Appearance,
  Catalog,
  Configuration,
  CreatedRepo,
  CreationState,
  Environment,
  ExperienceMode,
  GeneratedFile,
  Preferences,
  ProjectPreset,
  RepositoryForm,
  Stage,
} from './types';

export function useCreator() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [form, setForm] = useState<RepositoryForm | null>(null);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [state, setState] = useState<CreationState>({ kind: 'form' });
  const [error, setError] = useState<AppError | null>(null);
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [previewError, setPreviewError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const locked = useRef(false);
  const environmentRequest = useRef(0);
  const environmentFailure = useRef('');
  const accentSave = useRef<Promise<void>>(Promise.resolve());
  const busy = state.kind === 'creating';

  const refresh = useCallback(async (includeGithub: boolean) => {
    const requestId = ++environmentRequest.current;
    setChecking(true);
    try {
      const environment = await invoke<Environment>('check_environment', { includeGithub });
      if (requestId !== environmentRequest.current) return;
      if (environmentFailure.current) {
        const previous = environmentFailure.current;
        setNotice((notice) => (notice === previous ? '' : notice));
        environmentFailure.current = '';
      }
      setEnvironment(environment);
      setForm((form) =>
        form
          ? {
              ...form,
              githubOwner:
                includeGithub &&
                environment.githubUser &&
                form.githubOwner &&
                !environment.githubOwners.includes(form.githubOwner)
                  ? ''
                  : form.githubOwner,
              options:
                !form.options.copyrightName && environment.identityName
                  ? { ...form.options, copyrightName: environment.identityName }
                  : form.options,
            }
          : form,
      );
    } catch (value) {
      if (requestId === environmentRequest.current) {
        setEnvironment(null);
        environmentFailure.current = appError(value).message;
        setNotice(environmentFailure.current);
      }
    } finally {
      if (requestId === environmentRequest.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!isTauri()) {
      setNotice('Open the desktop application to create repositories.');
      return;
    }
    Promise.all([invoke<Catalog>('get_catalog'), invoke<Preferences>('get_preferences')])
      .then(([catalog, preferences]) => {
        if (!active) return;
        setCatalog(catalog);
        setPreferences(preferences);
        if (preferences.recoveryNotice) setNotice(preferences.recoveryNotice);
        setForm(
          blankForm(preferences.defaults ?? catalog.defaultConfiguration, preferences.destination),
        );
        void refresh(preferences.destination === 'github');
      })
      .catch((value) => {
        if (active) setError(appError(value));
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!preferences) return;
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => applyAppearance(preferences, system.matches);
    apply();
    system.addEventListener('change', apply);
    return () => system.removeEventListener('change', apply);
  }, [preferences?.appearance, preferences?.accent, preferences?.customAccent]);

  const previewKey = form ? JSON.stringify(previewRequestOf(form)) : '';
  useEffect(() => {
    if (!form || busy || state.kind !== 'form') return;
    let active = true;
    setPreviewing(true);
    setFiles([]);
    const timer = setTimeout(() => {
      const request = JSON.parse(previewKey) as RepositoryForm;
      if (nameError(request.name) || optionsError(request.options)) {
        setPreviewError(formError(request) ?? 'Complete the configuration to preview files.');
        setPreviewing(false);
        return;
      }
      invoke<GeneratedFile[]>('preview_files', { request })
        .then((files) => {
          if (active) {
            setFiles(files);
            setPreviewError('');
          }
        })
        .catch((value) => {
          if (active) setPreviewError(appError(value).message);
        })
        .finally(() => {
          if (active) setPreviewing(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [previewKey, busy, state.kind]);

  useEffect(() => {
    if (!form || busy || previewing || previewError || configurationError(configurationOf(form)))
      return;
    const timer = setTimeout(() => {
      void invoke('save_configuration', {
        configuration: configurationOf(form),
      }).catch((value) => setNotice(appError(value).message));
    }, 600);
    return () => clearTimeout(timer);
  }, [
    form?.readme,
    form?.options,
    form?.destination,
    form?.visibility,
    form?.brief,
    form?.handoffTemplate,
    busy,
    previewing,
    previewError,
  ]);

  const update = <K extends keyof RepositoryForm>(key: K, value: RepositoryForm[K]) => {
    setForm((form) => (form ? { ...form, [key]: value } : form));
    setError(null);
  };
  const configure = (configuration: Configuration, preserveProjectContext = true) => {
    setForm((form) =>
      form
        ? {
            ...form,
            ...(preserveProjectContext
              ? configurationForPreset(form, configuration, environment?.identityName)
              : structuredClone(configuration)),
          }
        : form,
    );
    if (configuration.destination) {
      void invoke('set_destination', { destination: configuration.destination }).catch((value) =>
        setNotice(appError(value).message),
      );
      void refresh(configuration.destination === 'github');
    }
    setError(null);
  };
  async function destination(value: RepositoryForm['destination']) {
    update('destination', value);
    try {
      await invoke('set_destination', { destination: value });
    } catch (value) {
      setNotice(appError(value).message);
    }
    void refresh(value === 'github');
  }
  async function chooseFolder() {
    if (picking || busy) return;
    setPicking(true);
    try {
      const path = await invoke<string | null>('choose_parent');
      if (path) {
        setPreferences(await invoke<Preferences>('get_preferences'));
        void refresh(form?.destination === 'github');
      }
    } catch (value) {
      setError(appError(value));
    } finally {
      setPicking(false);
    }
  }
  async function recentLocation(index: number) {
    try {
      setPreferences(await invoke<Preferences>('select_recent_location', { index }));
      void refresh(form?.destination === 'github');
    } catch (value) {
      setError(appError(value));
    }
  }
  async function appearance(appearance: Appearance) {
    setPreferences((preferences) => (preferences ? { ...preferences, appearance } : preferences));
    try {
      await invoke('set_appearance', { appearance });
    } catch (value) {
      setNotice(appError(value).message);
    }
  }
  async function accent(accent: Accent, customAccent: string) {
    const normalized = normalizeHex(customAccent);
    if (!normalized) return;
    setPreferences((preferences) =>
      preferences ? { ...preferences, accent, customAccent: normalized } : preferences,
    );
    // Native picker input can emit rapidly. Persist in selection order so a
    // slower earlier request cannot replace the user's final color on restart.
    const saving = accentSave.current.then(() =>
      invoke<void>('set_accent', { accent, customAccent: normalized }),
    );
    accentSave.current = saving.catch(() => {});
    try {
      await saving;
    } catch (value) {
      setNotice(appError(value).message);
    }
  }
  async function experienceMode(mode: ExperienceMode) {
    setPreferences((preferences) =>
      preferences ? { ...preferences, experienceMode: mode } : preferences,
    );
    try {
      await invoke('set_experience_mode', { mode });
    } catch (value) {
      setNotice(appError(value).message);
    }
  }
  const setupReady =
    !!environment?.gitInstalled &&
    (environment.identityReady ||
      !!(form?.options.commitAuthorName?.trim() && form.options.commitAuthorEmail?.trim())) &&
    (form?.destination !== 'github' || (!!environment.ghInstalled && !!environment.githubUser));
  const ready =
    !!form &&
    !formError(form) &&
    !previewError &&
    !previewing &&
    !!preferences?.parentPath &&
    setupReady &&
    !checking &&
    !picking &&
    !busy;
  async function execute(retry = false, presetName = '') {
    if (locked.current || (!retry && !ready)) return;
    locked.current = true;
    setError(null);
    setNotice('');
    setState({ kind: 'creating', stage: retry ? 'github' : 'folder' });
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<Stage>('repo-progress', (event) =>
        setState({ kind: 'creating', stage: event.payload }),
      );
      const result = await invoke<CreatedRepo>(
        retry ? 'retry_publish' : 'create_repository',
        retry ? {} : { request: { ...creationRequestOf(form!), presetName } },
      );
      setState({ kind: 'success', result });
    } catch (value) {
      const error = appError(value);
      if (error.localPath) setState({ kind: 'failure', error });
      else {
        setError(error);
        setState({ kind: 'form' });
      }
    } finally {
      unlisten?.();
      locked.current = false;
    }
  }
  async function action(command: string, args?: Record<string, unknown>) {
    try {
      await invoke(command, args);
    } catch (value) {
      const error = appError(value);
      setNotice(`${error.message} ${error.guidance}`);
    }
  }
  async function connect() {
    try {
      await invoke('connect_github');
      setNotice('Complete sign-in in the terminal and browser, then select Check connection.');
    } catch (value) {
      setError(appError(value));
    }
  }
  async function managePreset(
    command:
      | 'save_custom_preset'
      | 'rename_custom_preset'
      | 'delete_custom_preset'
      | 'update_custom_preset'
      | 'confirm_project_preset_import',
    args: Record<string, unknown>,
  ) {
    const customPresets = await invoke<ProjectPreset[]>(command, args);
    setPreferences((preferences) =>
      preferences ? { ...preferences, customPresets } : preferences,
    );
    return customPresets;
  }
  async function studioAction<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    setPicking(true);
    try {
      const result = await invoke<T>(command, args);
      if (
        [
          'save_instruction_preset',
          'delete_instruction_preset',
          'save_specialist',
          'delete_specialist',
          'import_instruction_preset',
        ].includes(command)
      ) {
        setPreferences(await invoke<Preferences>('get_preferences'));
      }
      return result;
    } finally {
      setPicking(false);
    }
  }
  function reset() {
    setState({ kind: 'form' });
    setError(null);
    setNotice('');
    setForm((form) =>
      form ? { ...form, name: '', description: '', topics: [], homepage: '' } : form,
    );
    void refresh(form?.destination === 'github');
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copied to clipboard.');
    } catch {
      setNotice('Clipboard unavailable. Select and copy the displayed text.');
    }
  }
  return {
    catalog,
    preferences,
    form,
    environment,
    state,
    error,
    notice,
    checking,
    picking,
    files,
    previewError,
    previewing,
    busy,
    ready,
    setupReady,
    update,
    configure,
    destination,
    chooseFolder,
    recentLocation,
    appearance,
    accent,
    experienceMode,
    execute,
    action,
    connect,
    managePreset,
    studioAction,
    reset,
    copy,
    refresh,
    setNotice,
  };
}
export type Creator = ReturnType<typeof useCreator>;
