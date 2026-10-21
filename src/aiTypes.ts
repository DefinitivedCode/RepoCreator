export type Agent = 'codex' | 'claude' | 'copilot' | 'cursor' | 'gemini' | 'opencode';
export type Workflow = 'balanced' | 'autonomous' | 'review-first';
export interface DevelopmentRule {
  id: string;
  group: string;
  label: string;
  text: string;
}
export interface InstructionPreset {
  id: string;
  name: string;
  description: string;
  workflow: Workflow;
  rules: string[];
}
export interface InstructionProfile {
  preset: string;
  workflow: Workflow;
  rules: string[];
  wording: Record<string, string>;
  customText: string;
  technologies: string[];
  technologyWording: Record<string, string>;
  stack: string;
  architecture: string;
  conventions: string;
  verification: string;
}
export interface Specialist {
  id: string;
  name: string;
  description: string;
  purpose: string;
  instructions: string;
  agents: Agent[];
  readOnly: boolean;
}
export interface ScopedRule {
  id: string;
  name: string;
  patterns: string[];
  content: string;
  mode: 'files' | 'requested';
}
export interface AIStudio {
  schemaVersion: number;
  enabled: boolean;
  agents: Agent[];
  instructions: InstructionProfile;
  specialists: string[];
  customSpecialists: Specialist[];
  scopedRules: ScopedRule[];
  skills: string[];
  optionalConfig: {
    codex: boolean;
    codexSandbox: 'workspace-write' | 'read-only';
    claude: boolean;
    claudeMode: 'default' | 'plan';
    gemini: boolean;
    opencode: boolean;
  };
}
export interface SavedInstructions {
  id: string;
  name: string;
  profile: InstructionProfile;
}
export interface StudioCatalog {
  schemaVersion: number;
  agents: { id: Agent; name: string; specialists: boolean; description: string }[];
  rules: DevelopmentRule[];
  presets: InstructionPreset[];
  specialists: Specialist[];
  technologies: { id: string; name: string; projectPresets: string[]; instructions: string }[];
  skills: { id: string; name: string; description: string; instructions: string }[];
}
