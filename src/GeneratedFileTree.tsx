import { Icon } from './icons';
import type { GeneratedFile } from './types';

interface TreeNode {
  path: string;
  name: string;
  file?: GeneratedFile;
  children: TreeNode[];
}

function buildTree(files: GeneratedFile[]) {
  const roots: TreeNode[] = [];
  for (const file of files) {
    let nodes = roots;
    let prefix = '';
    const parts = file.path.split('/');
    parts.forEach((part, index) => {
      prefix += `${prefix ? '/' : ''}${part}`;
      let node = nodes.find((entry) => entry.path === prefix);
      if (!node) {
        node = { path: prefix, name: part, children: [] };
        nodes.push(node);
      }
      if (index === parts.length - 1) node.file = file;
      nodes = node.children;
    });
  }
  return roots;
}

export function GeneratedFileTree({
  files,
  search,
  selected,
  onSelect,
  collapsible = false,
}: {
  files: GeneratedFile[];
  search: string;
  selected?: string;
  onSelect: (path: string) => void;
  collapsible?: boolean;
}) {
  const query = search.trim().toLowerCase();
  const roots = buildTree(files.filter((file) => file.path.toLowerCase().includes(query)));
  function renderNodes(nodes: TreeNode[], label?: string): React.ReactNode {
    return (
      <ul aria-label={label}>
        {nodes.map((node) => {
          if (node.file)
            return (
              <li key={node.path}>
                <button
                  type="button"
                  className="tree-file"
                  aria-label={node.path}
                  title={node.path}
                  aria-pressed={selected === node.path}
                  onClick={() => onSelect(node.path)}
                >
                  <Icon name="file" size={12} />
                  <span>{node.name}</span>
                </button>
              </li>
            );
          const folder = (
            <>
              <Icon name="folder" size={12} />
              {node.name}/
            </>
          );
          return (
            <li key={node.path}>
              {collapsible ? (
                <details key={query} open>
                  <summary className="tree-folder">
                    <span>{folder}</span>
                  </summary>
                  {renderNodes(node.children)}
                </details>
              ) : (
                <>
                  <span className="tree-folder">{folder}</span>
                  {renderNodes(node.children)}
                </>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  if (!roots.length) return <p className="help">No matching files.</p>;
  return renderNodes(roots, 'Planned generated files');
}
