import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const mockSource = readFileSync('node_modules/@tauri-apps/api/mocks.js', 'utf8').replace(
  /^export \{[^\n]*\};\s*$/m,
  '',
);
const ignores = JSON.parse(readFileSync('src-tauri/resources/ignore-presets.json', 'utf8'));
const studio = JSON.parse(readFileSync('src-tauri/resources/agent-studio.json', 'utf8'));

export async function prepare(
  page: Page,
  failPublish = false,
  mode: 'simple' | 'advanced' = 'advanced',
  expectReady = true,
) {
  await page.addInitScript({
    content: `${mockSource}
    window.isTauri = true;
    window.testCalls = [];
    Object.defineProperty(navigator, 'clipboard', {value:{writeText:async text=>{window.testCopied=text;}}});
    const ignores = ${JSON.stringify(ignores)};
    const studio = ${JSON.stringify(studio)};
    const options = { readmeSections: ['overview', 'usage', 'development', 'license'], sectionContent: {}, ignorePresets: ['os', 'secrets'], customPatterns: [], license: 'none', copyrightName: '', copyrightYear: '2026', initialBranch: 'main', commitMessage: 'Initial commit', editorconfig: false, gitattributes: false, postActions: { folder: false, vscode: false, github: false } };
    options.ai = { schemaVersion:1, enabled:false, agents:[], instructions:{preset:'practical',workflow:'balanced',rules:studio.presets.find(p=>p.id==='practical').rules,wording:{},customText:'',technologies:[],technologyWording:{},stack:'',architecture:'',conventions:'',verification:''}, specialists:[],customSpecialists:[],scopedRules:[],skills:[],optionalConfig:{codex:false,codexSandbox:'workspace-write',claude:false,claudeMode:'default',gemini:false,opencode:false} };
    options.commitAuthorName = ''; options.commitAuthorEmail = '';
    const brief = {idea:'',audience:'',firstVersion:'',technologies:'',context:''};
    const configuration = { readme: 'general', options, brief, handoffTemplate:'discovery' };
    const builtIns = [ ['default', 'Default', ['os','secrets']], ['blank', 'Blank repository', []], ['tauri', 'Tauri application', ['os','secrets','node','vite','typescript','rust','tauri']], ['python', 'Python project', ['os','secrets','python']], ['standard','Standard',['os','secrets']],['experiment','Experiment',['os','secrets']],['website','Website',['os','secrets','node','frontend']],['desktop','Desktop Application',['os','secrets']],['claude-experiment','Claude Experiment',['os','secrets']] ].map(([id,name,ids]) => ({id,name,description:'Reusable '+name+' workflow',configuration:{readme:id==='blank'?'none':'general',options:{...structuredClone(options),ignorePresets:ids},brief:structuredClone(brief),handoffTemplate:'discovery',visibility:'private'}}));
    for(const preset of builtIns) preset.configuration.options.ai.instructions.technologies = studio.technologies.filter(t=>t.projectPresets.includes(preset.id)).map(t=>t.id);
    builtIns.find(p=>p.id==='claude-experiment').configuration.options.ai = {...structuredClone(options.ai),enabled:true,agents:['claude']};
    builtIns.find(p=>p.id==='website').configuration.handoffTemplate = 'architecture';
    const preferences = { schemaVersion: 4, experienceMode:'${mode}', parentPath: 'C:\\\\Projects', destination: 'local', appearance: 'system', defaults: configuration, customPresets: [], instructionPresets:[],specialistLibrary:[],recoveryNotice:null,recentLocations: [] };
    if(window.testRecentLocations) preferences.recentLocations=window.testRecentLocations;
    if(window.testPreferredTemplate) preferences.defaults={...structuredClone(configuration),handoffTemplate:window.testPreferredTemplate};
    if(window.testPersistPreferences && sessionStorage.getItem('testPreferences')) Object.assign(preferences,JSON.parse(sessionStorage.getItem('testPreferences')));
    let attempts = 0;
    let lastRequest;
    function validateBrief(value) {
      if(Object.values(value.brief || {}).some(text=>new TextEncoder().encode(text).length>4096 || text.includes('\\0')))
        throw {message:'Project brief or handoff template is invalid.',guidance:'Keep each brief field within 4096 bytes.'};
    }
    function preview(request) {
      const files = [];
      if(request.readme !== 'none') files.push({path:'README.md',content:'# '+request.name+'\\n'});
      if(request.options.ignorePresets.length || request.options.customPatterns.length) files.push({path:'.gitignore',content:request.options.ignorePresets.flatMap(id=>ignores.find(p=>p.id===id).patterns).concat(request.options.customPatterns).join('\\n')+'\\n'});
      if(request.options.license !== 'none') files.push({path:'LICENSE',content:request.options.license+' '+request.options.copyrightName});
      // IPC test doubles exercise the UI contract; Rust tests and the production smoke test verify actual generation.
      const ai = request.options.ai;
      if(ai.enabled) {
        const shared = '# '+request.name+'\\n'+ai.instructions.customText;
        files.push({path:'AGENTS.md',content:shared});
        if(ai.agents.includes('claude')) files.push({path:'CLAUDE.md',content:'@AGENTS.md\\n'});
        if(ai.agents.includes('copilot')) files.push({path:'.github/copilot-instructions.md',content:shared});
        if(ai.agents.includes('cursor')) files.push({path:'.cursor/rules/project.mdc',content:'---\\nalwaysApply: true\\n---\\n@AGENTS.md\\n'});
        if(ai.agents.includes('gemini')) files.push(ai.optionalConfig.gemini ? {path:'.gemini/settings.json',content:'{"context":{"fileName":["AGENTS.md"]}}'} : {path:'GEMINI.md',content:'@./AGENTS.md\\n'});
        if(ai.agents.includes('codex') && ai.optionalConfig.codex) files.push({path:'.codex/config.toml',content:'approval_policy = "on-request"\\n'});
        if(ai.agents.includes('claude') && ai.optionalConfig.claude) files.push({path:'.claude/settings.json',content:'{"permissions":{"defaultMode":"default"}}'});
        if(ai.agents.includes('opencode') && ai.optionalConfig.opencode) files.push({path:'opencode.json',content:'{"permission":{"edit":"ask","shell":"ask"}}'});
        for(const role of studio.specialists.concat(ai.customSpecialists).filter(r=>ai.specialists.includes(r.id))) {
          for(const agent of role.agents.filter(a=>ai.agents.includes(a))) {
            const paths = {codex:'.codex/agents/'+role.id+'.toml',claude:'.claude/agents/'+role.id+'.md',copilot:'.github/agents/'+role.id+'.agent.md',opencode:'.opencode/agents/'+role.id+'.md'};
            files.push({path:paths[agent],content:role.instructions});
          }
        }
      }
      for(let index=0;index<(window.testExtraFiles||0);index++) files.push({path:'generated/nested/file-'+index+'.md',content:'Generated preview '+index});
      return files;
    }
    mockIPC(async (command, payload) => {
      window.testCalls.push({ command, payload });
      try {
      if(command==='get_catalog' && sessionStorage.getItem('failBootstrap')==='true') throw {message:'Could not load saved settings.',guidance:'Retry loading the application.'};
      if (command === 'get_catalog') return {studio,ignorePresets: ignores,builtInPresets: builtIns,defaultConfiguration: configuration};
      if (command === 'get_preferences') return structuredClone(preferences);
      if (command === 'check_environment') {
        if(window.testEnvironmentError) throw {message:'Could not inspect local tools.',guidance:'Recheck your setup.'};
        const queued=window.testEnvironmentQueue?.shift();
        const result={gitInstalled:true,identityReady:true,ghInstalled:true,githubUser:'octocat',githubOwners:['octocat','sample-org'],identityName:'Test Author',vscodeAvailable:false,...window.testEnvironment,...queued?.environment};
        if(queued?.delay) await new Promise(resolve=>setTimeout(resolve,queued.delay));
        return result;
      }
      if (command === 'choose_parent') return null;
      if (command === 'preview_files') { validateBrief(payload.request); return preview(payload.request); }
      if (command === 'save_configuration') { validateBrief(payload.configuration); preferences.defaults = payload.configuration; }
      if (command === 'set_destination') preferences.destination = payload.destination;
      if (command === 'set_experience_mode') { preferences.experienceMode=payload.mode; return structuredClone(preferences); }
      if (command === 'set_appearance') { preferences.appearance=payload.appearance; return; }
      if (command === 'list_recent_projects') return [];
      if (command === 'export_project_preset' || command === 'export_handoff_text') return true;
      if (command === 'import_handoff_template') return window.testPromptImport || '{}';
      if (command === 'preview_project_preset_import') {
        if(window.testPresetImportError) throw {message:'This preset contains invalid or unsupported fields.',guidance:'Choose a supported JSON preset.'};
        return {schemaVersion:1,name:'Imported workflow',description:'A portable workflow',configuration:structuredClone(configuration)};
      }
      if (command === 'confirm_project_preset_import') {
        const p=payload.preset;
        if(preferences.customPresets.some(s=>s.name.toLowerCase()===p.name.toLowerCase())) throw {message:'A custom preset with this name already exists.',guidance:'Choose another name.'};
        preferences.customPresets.push({id:'custom-'+(preferences.customPresets.length+1),name:p.name,description:p.description,configuration:p.configuration}); return structuredClone(preferences.customPresets);
      }
      if (command === 'update_custom_preset') { const p=preferences.customPresets.find(p=>p.id===payload.id);Object.assign(p,{name:payload.name,description:payload.description,configuration:payload.configuration});return structuredClone(preferences.customPresets); }
      if (command === 'save_instruction_preset') {
        if(preferences.instructionPresets.some(p=>p.name===payload.name)) throw {message:'A preset with that name exists.',guidance:'Choose another name.'};
        preferences.instructionPresets.push({id:'instructions-'+(preferences.instructionPresets.length+1),name:payload.name,profile:payload.profile}); return structuredClone(preferences);
      }
      if(command === 'delete_instruction_preset') {preferences.instructionPresets=preferences.instructionPresets.filter(p=>p.id!==payload.id); return structuredClone(preferences);}
      if(command === 'save_specialist') {preferences.specialistLibrary=preferences.specialistLibrary.filter(r=>r.id!==payload.role.id).concat(payload.role);return structuredClone(preferences);}
      if(command === 'delete_specialist') {preferences.specialistLibrary=preferences.specialistLibrary.filter(r=>r.id!==payload.id);return structuredClone(preferences);}
      if(command === 'import_instructions') return 'Imported instructions 🦀.\\n';
      if(command === 'export_instruction_preset') return true;
      if(command === 'import_instruction_preset') {preferences.instructionPresets.push({id:'instructions-imported',name:'Imported preset',profile:{...structuredClone(options.ai.instructions),customText:'Imported preset text.'}});return structuredClone(preferences);}
      if (command === 'save_custom_preset') { preferences.customPresets.push({id:'custom-'+(preferences.customPresets.length+1),name:payload.name,description:payload.description||'',configuration:payload.configuration}); return structuredClone(preferences.customPresets); }
      if (command === 'rename_custom_preset') { preferences.customPresets.find(p=>p.id===payload.id).name=payload.name; return structuredClone(preferences.customPresets); }
      if (command === 'delete_custom_preset') { preferences.customPresets=preferences.customPresets.filter(p=>p.id!==payload.id); return structuredClone(preferences.customPresets); }
      if (command === 'create_repository' || command === 'retry_publish') {
        attempts++; lastRequest=payload?.request || lastRequest;
        await new Promise(resolve => setTimeout(resolve, 240));
        if (${failPublish} && attempts === 1) throw { message:'The GitHub repository exists, but the initial commit could not be pushed.',guidance:'Your local repository and commit are safe. Check your connection, then retry publishing.',localPath:'C:\\\\Projects\\\\fresh-start',localReady:true,canRetry:true,githubUrl:'https://github.com/octocat/fresh-start' };
        return { name:lastRequest.name,path:preferences.parentPath+String.fromCharCode(92)+lastRequest.name,githubUrl:lastRequest.destination==='github'?'https://github.com/octocat/'+lastRequest.name:null,commit:'a'.repeat(40),branch:lastRequest.options.initialBranch,commitMessage:lastRequest.options.commitMessage,files:preview(lastRequest).map(f=>f.path),warnings:[] };
      }
      } finally {
        if(window.testPersistPreferences) sessionStorage.setItem('testPreferences',JSON.stringify(preferences));
      }
    }, { shouldMockEvents: true });`,
  });
  await page.goto('/');
  if (expectReady) await expect(page.getByText('Git ready', { exact: true })).toBeVisible();
}

export async function navigate(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: 'Project setup' })
    .getByRole('button', { name, exact: true })
    .click();
  await expect(
    page
      .getByRole('main', { name: 'Repository configuration' })
      .getByRole('heading', { name, exact: true }),
  ).toBeFocused();
}

export async function fileTab(page: Page, name: string) {
  await navigate(page, 'Project Files');
  await page
    .getByRole('group', { name: 'Project file settings' })
    .getByRole('button', { name, exact: true })
    .click();
}

export async function agentTab(page: Page, name: string) {
  await navigate(page, 'AI Agents');
  await page
    .getByRole('group', { name: 'AI agent settings' })
    .getByRole('button', { name, exact: true })
    .click();
}

export async function createProject(page: Page) {
  await navigate(page, 'Review');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
}
