import { useState } from 'react';
import { accentPresets, applyAppearance } from '../appearance';
import { Icon, type IconName } from '../icons';
import {
  Banner,
  Button,
  Chip,
  Dialog,
  Disclosure,
  Field,
  StatusRow,
  Tabs,
  ToastRegion,
  useToasts,
} from './index';

const iconNames: IconName[] = [
  'repo',
  'folder',
  'github',
  'arrow',
  'external',
  'check',
  'lock',
  'globe',
  'chevron',
  'alert',
  'copy',
  'close',
  'code',
  'file',
  'settings',
  'refresh',
  'pending',
  'question',
  'minus',
  'plus',
  'more',
  'pin',
  'play',
  'stop',
];

/** Development-only reference of every primitive in every state. Open /?kitchen-sink. */
export function KitchenSink() {
  const [appearance, setAppearance] = useState<'light' | 'dark'>('light');
  const [accent, setAccent] = useState('teal');
  const [tab, setTab] = useState<'one' | 'two' | 'three'>('one');
  const [dialog, setDialog] = useState(false);
  const toasts = useToasts();
  function apply(nextAppearance: 'light' | 'dark', nextAccent: string) {
    setAppearance(nextAppearance);
    setAccent(nextAccent);
    applyAppearance({ appearance: nextAppearance, accent: nextAccent }, nextAppearance === 'dark');
  }
  return (
    <main
      aria-label="Kitchen sink"
      style={{ padding: 24, height: '100%', overflow: 'auto', background: 'var(--bg)' }}
    >
      <h1 style={{ font: '600 var(--fs-title) / var(--lh-title) var(--font-ui)' }}>Primitives</h1>
      <div className="ui-kitchen-controls" role="group" aria-label="Appearance controls">
        <Button onClick={() => apply('light', accent)} aria-pressed={appearance === 'light'}>
          Light
        </Button>
        <Button onClick={() => apply('dark', accent)} aria-pressed={appearance === 'dark'}>
          Dark
        </Button>
        {[...accentPresets.map((preset) => preset.id), 'custom'].map((id) => (
          <Button key={id} size="compact" onClick={() => apply(appearance, id)}>
            {id}
          </Button>
        ))}
      </div>

      <h2>Buttons</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="tertiary">Tertiary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="primary" size="compact">
          Compact
        </Button>
        <Button variant="primary" size="large" icon="arrow">
          Large with icon
        </Button>
        <Button variant="primary" reason="Add a project name first.">
          Unavailable with reason
        </Button>
      </div>

      <h2>Fields</h2>
      <div style={{ display: 'grid', gap: 16, maxWidth: 420 }}>
        <Field label="Project name" helper="Letters, numbers and hyphens.">
          {(control) => <input {...control} defaultValue="river-notes" />}
        </Field>
        <Field label="Email" error="Enter an email like name@example.com">
          {(control) => <input {...control} defaultValue="not-an-email" />}
        </Field>
        <Field label="Description" optional>
          {(control) => <input {...control} />}
        </Field>
      </div>

      <h2>Tabs</h2>
      <Tabs
        label="Example sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'one', label: 'Overview' },
          { id: 'two', label: 'Readiness', count: 2 },
          { id: 'three', label: 'Settings' },
        ]}
      >
        <p>Panel for {tab}.</p>
      </Tabs>

      <h2>Status rows</h2>
      <StatusRow state="ok" title="Git is installed" detail="Git 2.45.1" />
      <StatusRow
        state="warning"
        title="Commit identity"
        detail="Git needs a name and email."
        action={<Button size="compact">Add</Button>}
      />
      <StatusRow state="error" title="Build failed" detail="Exit code 1" />
      <StatusRow state="neutral" title="GitHub" detail="Not connected" />

      <h2>Disclosure</h2>
      <Disclosure title="Customize" summary="3 options">
        <p>Advanced settings appear here.</p>
      </Disclosure>

      <h2>Banners and chips</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        <Banner title="Heads up">An informational note next to its cause.</Banner>
        <Banner tone="success" title="Saved" />
        <Banner tone="warning" title="Public repository">
          Anyone can see this project.
        </Banner>
        <Banner tone="error" title="Could not save" action={<Button size="compact">Retry</Button>}>
          Check folder permissions.
        </Banner>
      </div>
      <p style={{ display: 'flex', gap: 8 }}>
        <Chip>Neutral</Chip>
        <Chip tone="ok">Ready</Chip>
        <Chip tone="warning">2 to review</Chip>
        <Chip tone="error">Failed</Chip>
      </p>

      <h2>Dialog and toast</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={() => setDialog(true)}>Open dialog</Button>
        <Button onClick={() => toasts.push('Preset saved.')}>Show toast</Button>
      </div>
      {dialog && (
        <Dialog
          title="Remove from history?"
          onClose={() => setDialog(false)}
          footer={
            <>
              <Button onClick={() => setDialog(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setDialog(false)}>
                Remove
              </Button>
            </>
          }
        >
          The folder on disk is kept.
        </Dialog>
      )}
      <ToastRegion toasts={toasts.toasts} onDismiss={toasts.dismiss} />

      <h2>Icons</h2>
      <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {iconNames.map((name) => (
          <span key={name} title={name}>
            <Icon name={name} size={16} />
          </span>
        ))}
      </p>
    </main>
  );
}
