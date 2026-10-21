import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Icon } from './icons';
import { appError, blankForm, displayPath, nameError } from './validation';
import { stages, type AppError, type CreatedRepo, type Destination, type Environment, type Preferences, type RepositoryForm, type Stage } from './types';

export default function App() {
  const [form, setForm] = useState<RepositoryForm>(() => blankForm());
  const [parent, setParent] = useState('');
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [booting, setBooting] = useState(true);
  const [checking, setChecking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [touched, setTouched] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [result, setResult] = useState<CreatedRepo | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [notice, setNotice] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const operation = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const busy = stage !== null;
  const github = form.destination === 'github';
  const validation = nameError(form.name);
  const descriptionInvalid = Array.from(form.description).length > 350 || form.description.includes('\0');
  const setupReady = environment?.gitInstalled && environment.identityReady && (!github || (environment.ghInstalled && environment.githubUser));
  const ready = !booting && !picking && !busy && !!parent && !validation && !descriptionInvalid && !!setupReady;

  const refresh = useCallback(async () => {
    setChecking(true);
    try { setEnvironment(await invoke<Environment>('check_environment')); }
    catch (value) { setError(appError(value)); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => {
    let active = true;
    if (!isTauri()) {
      setNotice('Open the Windows application to create repositories.');
      setBooting(false);
      return;
    }
    invoke<Preferences>('get_preferences').then(preferences => {
      if (!active) return;
      setParent(preferences.parentPath);
      setForm(blankForm(preferences.destination));
      setBooting(false);
      void refresh();
    }).catch(value => { if (active) { setError(appError(value)); setBooting(false); } });
    return () => { active = false; };
  }, [refresh]);

  const update = <K extends keyof RepositoryForm>(key: K, value: RepositoryForm[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    if (!error?.localPath) setError(null);
  };

  async function changeDestination(destination: Destination) {
    update('destination', destination);
    try { await invoke('set_destination', { destination }); }
    catch { setNotice('Your selection will apply to this project. It could not be remembered.'); }
  }

  async function chooseFolder() {
    if (picking || busy) return;
    setPicking(true);
    try {
      const path = await invoke<string | null>('choose_parent');
      if (path) { setParent(path); setError(null); void refresh(); }
    } catch (value) { setError(appError(value)); }
    finally { setPicking(false); }
  }

  async function execute(retry = false) {
    if (operation.current || (!retry && !ready)) return;
    operation.current = true;
    setError(null);
    setNotice('');
    setStage(retry ? 'github' : 'folder');
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await listen<Stage>('repo-progress', event => setStage(event.payload));
      const created = await invoke<CreatedRepo>(retry ? 'retry_publish' : 'create_repository', retry ? {} : { request: form });
      setResult(created);
    } catch (value) { setError(appError(value)); }
    finally { unlisten?.(); setStage(null); operation.current = false; }
  }

  async function action(command: string, args?: Record<string, unknown>) {
    try { await invoke(command, args); }
    catch (value) { setNotice(`${appError(value).message} ${appError(value).guidance}`); }
  }

  async function connect() {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await invoke('connect_github');
      setNotice('Complete sign-in in the terminal and browser, then select Check connection.');
    } catch (value) { setError(appError(value)); }
    finally { setSigningIn(false); }
  }

  function reset() {
    setResult(null);
    setError(null);
    setNotice('');
    setTouched(false);
    setForm(blankForm(form.destination));
    requestAnimationFrame(() => nameInput.current?.focus());
    void refresh();
  }

  const progressSteps = stages.filter(([key]) => github || !['github', 'push', 'verify'].includes(key));
  const currentStep = progressSteps.findIndex(([key]) => key === stage);
  const recovery = !!error?.localPath;
  const showForm = !result && !busy && !recovery;

  return <div className="app">
    <header className="app-header">
      <div className="brand-mark"><Icon name="repo" size={23} /></div>
      <div><h1>Repo Creator</h1><p>A fresh start for your next idea.</p></div>
    </header>

    {showForm && <form className="form" onSubmit={event => { event.preventDefault(); setTouched(true); void execute(); }}>
      <div className="fields">
        <fieldset disabled={booting || picking}>
          <div className="field">
            <label htmlFor="project-name">Project name</label>
            <input ref={nameInput} id="project-name" placeholder="my-next-project" value={form.name} autoFocus autoComplete="off" spellCheck={false}
              maxLength={101} aria-invalid={touched && !!validation} aria-describedby="name-help"
              onBlur={() => setTouched(true)} onChange={event => update('name', event.target.value)} />
            <p id="name-help" className={`field-help ${touched && validation ? 'invalid' : ''}`}>{touched && validation ? validation : 'Your folder and repository will share this name.'}</p>
          </div>

          <div className="field">
            <label id="destination-label">Repository destination</label>
            <div className="segmented" role="group" aria-labelledby="destination-label">
              <button type="button" aria-pressed={!github} onClick={() => void changeDestination('local')}><Icon name="folder" size={16} />Local only</button>
              <button type="button" aria-pressed={github} onClick={() => void changeDestination('github')}><Icon name="github" size={16} />GitHub</button>
            </div>
            {github && <div className="visibility" role="radiogroup" aria-label="GitHub repository visibility">
              <span>Visibility</span>
              <label><input type="radio" name="visibility" checked={form.visibility === 'private'} onChange={() => update('visibility', 'private')} /><Icon name="lock" size={13} />Private</label>
              <label><input type="radio" name="visibility" checked={form.visibility === 'public'} onChange={() => update('visibility', 'public')} /><Icon name="globe" size={13} />Public</label>
            </div>}
          </div>

          <div className="field">
            <div className="label-row"><label htmlFor="description">Description <span className="optional">optional</span></label><span className={`counter ${descriptionInvalid ? 'invalid' : ''}`}>{Array.from(form.description).length}/350</span></div>
            <textarea id="description" rows={2} placeholder="A little context for what comes next." value={form.description} maxLength={700}
              aria-invalid={descriptionInvalid} onChange={event => update('description', event.target.value)} />
            {descriptionInvalid && <p className="field-help invalid">Use 350 characters or fewer and remove null characters.</p>}
          </div>

          <div className="field">
            <label htmlFor="readme">README template</label>
            <div className="select-wrap"><select id="readme" value={form.readme} onChange={event => update('readme', event.target.value as RepositoryForm['readme'])}>
              <option value="general">General — a useful starting point</option>
              <option value="minimal">Minimal — title and description</option>
              <option value="none">None — start with an empty commit</option>
            </select><Icon name="chevron" size={16} /></div>
          </div>

          <div className="field">
            <label id="location-label">Project location</label>
            <div className="location"><Icon name="folder" size={16} /><span aria-labelledby="location-label" title={displayPath(parent)}>{parent ? displayPath(parent) : booting ? 'Loading your location…' : 'Choose a parent folder'}</span>
              <button type="button" className="browse" onClick={() => void chooseFolder()} disabled={picking || !isTauri()}>{picking ? 'Choosing…' : 'Browse'}</button>
            </div>
            <p className="field-help path-preview" title={`${displayPath(parent)}\\${form.name || 'my-next-project'}`}><span>Creates</span> <strong>{form.name || 'my-next-project'}</strong> <span>inside this folder</span></p>
          </div>
        </fieldset>

        {environment && !setupReady && <div className="setup-panel" role="status">
          <Icon name="alert" size={17} />
          <div>
            {!environment.gitInstalled ? <><strong>Git is needed to get started.</strong><button className="text-button" type="button" onClick={() => void action('open_setup_resource', { resource: 'git' })}>Install Git <Icon name="external" size={12} /></button></>
              : !environment.identityReady ? <><strong>Set your Git commit identity.</strong><p>Run these once in a terminal:</p><code>git config --global user.name "Your Name"<br />git config --global user.email "you@example.com"</code></>
              : !environment.ghInstalled ? <><strong>GitHub CLI is needed to publish.</strong><button className="text-button" type="button" onClick={() => void action('open_setup_resource', { resource: 'gh' })}>Install GitHub CLI <Icon name="external" size={12} /></button></>
              : <><strong>Connect your GitHub account.</strong><p>Sign in securely with the official GitHub CLI.</p><button className="small-button" type="button" onClick={() => void connect()} disabled={signingIn}>Connect to GitHub <Icon name="external" size={12} /></button></>}
            <button type="button" className="text-button" onClick={() => void refresh()} disabled={checking}>{checking ? 'Checking…' : 'Check connection'}</button>
          </div>
        </div>}

        {error && <div className="error-banner" role="alert"><strong>{error.message}</strong><p>{error.guidance}</p></div>}
        {notice && <p className="notice" role="status">{notice}</p>}
      </div>
      <footer className="form-footer">
        <button className="primary" type="submit" disabled={!ready}>Create Repository <Icon name="arrow" size={17} /></button>
        <div className="footer-meta"><span className={`status-dot ${setupReady ? 'ready' : ''}`} />
          <span>{booting || (!environment && isTauri()) ? 'Checking your setup…' : setupReady ? github ? `Publishing as ${environment?.githubUser}` : 'Git is ready' : 'Complete setup to continue'}</span>
          {setupReady && <span className="branch-label">main</span>}
        </div>
      </footer>
    </form>}

    {busy && <main className="state-panel" aria-live="polite" aria-busy="true">
      <div className="state-symbol working"><Icon name="repo" size={27} /></div>
      <h2>Making room for your idea.</h2><p className="state-subtitle">{form.name}</p>
      <ol className="progress-list">{progressSteps.map(([key, label], index) => {
        const complete = stage === 'complete' || index < currentStep;
        const active = key === stage;
        return <li key={key} className={complete ? 'done' : active ? 'active' : ''}><span className={`step-symbol ${active ? 'spinner' : ''}`}>{complete && <Icon name="check" size={13} />}</span>{label}</li>;
      })}</ol>
      <p className="quiet">Keep this window open while creation finishes.</p>
    </main>}

    {result && <main className="state-panel success" aria-live="polite">
      <div className="state-symbol"><Icon name="check" size={28} /></div>
      <h2>Repository created</h2><p className="project-result">{result.name}</p>
      <p className="state-subtitle">Initial commit created on <code>main</code></p>
      <div className="result-details"><div><Icon name="folder" size={17} /><button className="result-link" title={displayPath(result.path)} onClick={() => void action('open_project')}>{displayPath(result.path)}</button></div>
        {result.githubUrl && <div><Icon name="github" size={17} /><button className="result-link" onClick={() => void action('open_github')}>{result.githubUrl.replace('https://', '')}<Icon name="external" size={12} /></button></div>}
        <div><Icon name="repo" size={17} /><span>Initial commit <code>{result.commit.slice(0, 7)}</code></span></div>
      </div>
      <div className="state-actions">{result.githubUrl && <button className="primary" onClick={() => void action('open_github')}>Open on GitHub <Icon name="external" size={16} /></button>}
        <button className={result.githubUrl ? 'secondary' : 'primary'} onClick={() => void action('open_project')}>Open Folder <Icon name="folder" size={16} /></button>
        <button className="text-button create-another" onClick={reset}>Create Another <Icon name="arrow" size={14} /></button>
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
    </main>}

    {recovery && !busy && !result && error && <main className="state-panel recovery" aria-live="assertive">
      <div className="state-symbol warning"><Icon name="alert" size={28} /></div>
      <h2>{error.localReady ? 'Your local repository is safe.' : 'Creation needs attention.'}</h2>
      <p className="state-subtitle">{form.name}</p>
      <div className="recovery-message"><strong>{error.message}</strong><p>{error.guidance}</p>{error.localReady && <p className="saved-commit"><Icon name="check" size={14} /> Initial commit created on main</p>}</div>
      <button className="preserved-path" title={displayPath(error.localPath!)} onClick={() => void action('open_project')}><Icon name="folder" size={16} />{displayPath(error.localPath!)}</button>
      <div className="state-actions">{error.canRetry && <button className="primary" onClick={() => void execute(true)}>Retry publishing <Icon name="arrow" size={16} /></button>}
        <button className="secondary" onClick={() => void action('open_project')}>Open Folder <Icon name="folder" size={16} /></button>
        {error.githubUrl && <button className="text-button" onClick={() => void action('open_github')}>Inspect on GitHub <Icon name="external" size={13} /></button>}
        <button className="text-button create-another" onClick={reset}>Create Another <Icon name="arrow" size={14} /></button>
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
    </main>}
  </div>;
}
