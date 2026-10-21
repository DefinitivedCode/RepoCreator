import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appError, blankForm, formError, nameError, optionsError } from './validation';
import type {
  AppError,
  Appearance,
  Catalog,
  Configuration,
  CreatedRepo,
  CreationState,
  Environment,
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
  const busy = state.kind === 'creating';

  const refresh = useCallback(async (includeGithub: boolean) => {
    setChecking(true);
    try {
      const environment = await invoke<Environment>('check_environment', { includeGithub });
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
      setNotice(appError(value).message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!isTauri()) {
      setNotice('Open the Windows desktop application to create repositories.');
      return;
    }
    Promise.all([invoke<Catalog>('get_catalog'), invoke<Preferences>('get_preferences')])
      .then(([catalog, preferences]) => {
        if (!active) return;
        setCatalog(catalog);
        setPreferences(preferences);
        setForm(
          blankForm(preferences.defaults ?? catalog.defaultConfiguration, preferences.destination),
        );
        document.documentElement.dataset.appearance = preferences.appearance ?? 'system';
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
    if (!form || busy || state.kind !== 'form') return;
    let active = true;
    setPreviewing(true);
    setFiles([]);
    const timer = setTimeout(() => {
      const request = { ...form, name: form.name || 'project-name' };
      if ((form.name && nameError(form.name)) || optionsError(form.options)) {
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
  }, [form, busy, state.kind]);

  useEffect(() => {
    if (!form || busy || optionsError(form.options)) return;
    const timer = setTimeout(() => {
      void invoke('save_configuration', {
        configuration: { readme: form.readme, options: form.options },
      }).catch((value) => setNotice(appError(value).message));
    }, 600);
    return () => clearTimeout(timer);
  }, [form?.readme, form?.options, busy]);

  const update = <K extends keyof RepositoryForm>(key: K, value: RepositoryForm[K]) => {
    setForm((form) => (form ? { ...form, [key]: value } : form));
    setError(null);
  };
  const configure = (configuration: Configuration) => {
    const copy = structuredClone(configuration);
    if (!copy.options.copyrightName && environment?.identityName)
      copy.options.copyrightName = environment.identityName;
    setForm((form) => (form ? { ...form, ...copy } : form));
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
    document.documentElement.dataset.appearance = appearance;
    setPreferences((preferences) => (preferences ? { ...preferences, appearance } : preferences));
    try {
      await invoke('set_appearance', { appearance });
    } catch (value) {
      setNotice(appError(value).message);
    }
  }
  const setupReady =
    !!environment?.gitInstalled &&
    environment.identityReady &&
    (form?.destination !== 'github' || (!!environment.ghInstalled && !!environment.githubUser));
  const ready =
    !!form && !formError(form) && !!preferences?.parentPath && setupReady && !picking && !busy;
  async function execute(retry = false) {
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
        retry ? {} : { request: form },
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
    command: 'save_custom_preset' | 'rename_custom_preset' | 'delete_custom_preset',
    args: Record<string, unknown>,
  ) {
    const customPresets = await invoke<ProjectPreset[]>(command, args);
    setPreferences((preferences) =>
      preferences ? { ...preferences, customPresets } : preferences,
    );
    return customPresets;
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
    execute,
    action,
    connect,
    managePreset,
    reset,
    copy,
    refresh,
    setNotice,
  };
}
export type Creator = ReturnType<typeof useCreator>;
