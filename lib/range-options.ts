import type { RmData } from './types';

/** All ranges, grouped by their complete folder path, including parent folders. */
export function getRangeGroups(data: RmData | null) {
  if (!data) return [];
  const groups: { catId: string; path: string; tabs: { id: string; name: string }[] }[] = [];
  const visited = new Set<string>();
  const visit = (catId: string, parents: string[]) => {
    const category = data.categories[catId];
    if (!category || visited.has(catId)) return;
    visited.add(catId);
    const path = catId === 'root' ? parents : [...parents, category.name];
    const tabs = [...new Set([...(category.tabList ?? []), ...Object.keys(category.tabs ?? {})])]
      .filter(id => category.tabs?.[id])
      .map(id => ({ id, name: category.tabs![id].name }));
    if (tabs.length) groups.push({ catId, path: path.join(' / ') || 'Racine', tabs });
    for (const child of category.children ?? []) visit(child, path);
  };
  visit('root', []);
  // Keep imported categories reachable even when their parent link is missing.
  const children = new Set(Object.values(data.categories).flatMap(category => category.children ?? []));
  for (const id of Object.keys(data.categories)) if (!children.has(id)) visit(id, []);
  for (const id of Object.keys(data.categories)) visit(id, []);
  return groups;
}
