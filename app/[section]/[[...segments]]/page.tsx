import { notFound } from 'next/navigation';
import Workspace from '../../page';
import { parseWorkspacePath } from '@/lib/workspace-navigation';
export default async function WorkspacePage({params}:{params:Promise<{section:string;segments?:string[]}>}){
  const {section,segments=[]}=await params;
  if(!parseWorkspacePath('/'+[section,...segments].join('/')))notFound();
  return <Workspace/>;
}
