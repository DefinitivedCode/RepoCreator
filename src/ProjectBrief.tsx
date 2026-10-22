import { emptyBrief } from './handoff';
import type { ProjectBrief as Brief } from './types';

export function ProjectBrief({
  value,
  onChange,
  simple = false,
}: {
  value?: Brief;
  onChange: (brief: Brief) => void;
  simple?: boolean;
}) {
  const brief = { ...emptyBrief, ...value };
  const fields: { key: keyof Brief; label: string; help?: string }[] = [
    {
      key: 'idea',
      label: 'What are you building?',
      help: 'An optional idea for your AI planning prompt.',
    },
    ...(!simple
      ? [
          { key: 'audience' as const, label: 'Who is it for?' },
          { key: 'firstVersion' as const, label: 'What should the first version accomplish?' },
          { key: 'context' as const, label: 'Additional context or constraints' },
        ]
      : []),
  ];
  return (
    <div className="project-brief">
      {fields.map((field) => (
        <div className="field" key={field.key}>
          <label htmlFor={`brief-${field.key}`}>{field.label}</label>
          <textarea
            id={`brief-${field.key}`}
            rows={field.key === 'idea' ? 2 : 3}
            maxLength={4000}
            value={brief[field.key]}
            onChange={(event) => onChange({ ...brief, [field.key]: event.target.value })}
          />
          {field.help && <span className="help">{field.help}</span>}
        </div>
      ))}
    </div>
  );
}
