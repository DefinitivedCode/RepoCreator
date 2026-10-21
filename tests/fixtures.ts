import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const mockSource = readFileSync('node_modules/@tauri-apps/api/mocks.js', 'utf8').replace(
  /^export \{[^\n]*\};\s*$/m,
  '',
);
const ignores = JSON.parse(readFileSync('src-tauri/resources/ignore-presets.json', 'utf8'));
const studio = JSON.parse(readFileSync('src-tauri/resources/agent-studio.json', 'utf8'));

export async function prepare(page: Page, failPublish = false) {
  await page.addInitScript({
    content: `${mockSource}
    window.isTauri = true;
    window.testCalls = [];
    const ignores = ${JSON.stringify(ignores)};
    const studio = ${JSON.stringify(studio)};
    const options = { readmeSections: ['overview', 'usage', 'development', 'license'], sectionContent: {}, ignorePresets: ['os', 'secrets'], customPatterns: [], license: 'none', copyrightName: '', copyrightYear: '2026', initialBranch: 'main', commitMessage: 'Initial commit', editorconfig: false, gitattributes: false, postActions: { folder: false, vscode: false, github: false } };
    options.ai = { schemaVersion:1, enabled:false, agents:[], instructions:{preset:'practical',workflow:'balanced',rules:studio.presets.find(p=>p.id==='practical').rules,wording:{},customText:'',technologies:[],technologyWording:{},stack:'',architecture:'',conventions:'',verification:''}, specialists:[],customSpecialists:[],scopedRules:[],skills:[],optionalConfig:{codex:false,codexSandbox:'workspace-write',claude:false,claudeMode:'default',gemini:false,opencode:false} };
    const configuration = { readme: 'general', options };
    const builtIns = [ ['default', 'Default', ['os','secrets']], ['blank', 'Blank repository', []], ['tauri', 'Tauri application', ['os','secrets','node','vite','typescript','rust','tauri']], ['python', 'Python project', ['os','secrets','python']] ].map(([id,name,ids]) => ({id,name,configuration:{readme:id==='blank'?'none':'general',options:{...structuredClone(options),ignorePresets:ids}}}));
    for(const preset of builtIns) preset.configuration.options.ai.instructions.technologies = studio.technologies.filter(t=>t.projectPresets.includes(preset.id)).map(t=>t.id);
    const preferences = { schemaVersion: 3, parentPath: 'C:\\\\Projects', destination: 'local', appearance: 'system', defaults: configuration, customPresets: [], instructionPresets:[],specialistLibrary:[],recoveryNotice:null,recentLocations: [] };
    let attempts = 0;
    let lastRequest;
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
      return files;
    }
    mockIPC(async (command, payload) => {
      window.testCalls.push({ command, payload });
      if (command === 'get_catalog') return {studio,ignorePresets: ignores,builtInPresets: builtIns,defaultConfiguration: configuration};
      if (command === 'get_preferences') return structuredClone(preferences);
      if (command === 'check_environment') return { gitInstalled:true,identityReady:true,ghInstalled:true,githubUser:'octocat',githubOwners:['octocat','sample-org'],identityName:'Test Author',vscodeAvailable:false };
      if (command === 'choose_parent') return null;
      if (command === 'preview_files') return preview(payload.request);
      if (command === 'save_configuration') preferences.defaults = payload.configuration;
      if (command === 'set_destination') preferences.destination = payload.destination;
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
      if (command === 'save_custom_preset') { preferences.customPresets.push({id:'custom-'+(preferences.customPresets.length+1),name:payload.name,configuration:payload.configuration}); return structuredClone(preferences.customPresets); }
      if (command === 'rename_custom_preset') { preferences.customPresets.find(p=>p.id===payload.id).name=payload.name; return structuredClone(preferences.customPresets); }
      if (command === 'delete_custom_preset') { preferences.customPresets=preferences.customPresets.filter(p=>p.id!==payload.id); return structuredClone(preferences.customPresets); }
      if (command === 'create_repository' || command === 'retry_publish') {
        attempts++; lastRequest=payload?.request || lastRequest;
        await new Promise(resolve => setTimeout(resolve, 240));
        if (${failPublish} && attempts === 1) throw { message:'The GitHub repository exists, but the initial commit could not be pushed.',guidance:'Your local repository and commit are safe. Check your connection, then retry publishing.',localPath:'C:\\\\Projects\\\\fresh-start',localReady:true,canRetry:true,githubUrl:'https://github.com/octocat/fresh-start' };
        return { name:lastRequest.name,path:'C:\\\\Projects\\\\fresh-start',githubUrl:lastRequest.destination==='github'?'https://github.com/octocat/fresh-start':null,commit:'a'.repeat(40),branch:lastRequest.options.initialBranch,commitMessage:lastRequest.options.commitMessage,files:preview(lastRequest).map(f=>f.path),warnings:[] };
      }
    }, { shouldMockEvents: true });`,
  });
  await page.goto('/');
  await expect(page.getByText('Git ready', { exact: true })).toBeVisible();
}
