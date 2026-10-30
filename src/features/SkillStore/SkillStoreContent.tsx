'use client';
import { Flexbox } from '@lobehub/ui';
import AddSkillButton from './SkillList/AddSkillButton';
import CustomList from './SkillList/Custom';
export enum SkillStoreTab {
  Custom = 'custom',
  LobeHub = 'lobehub',
  MCP = 'mcp',
  Skills = 'skills',
}
export const SkillStoreContent = () => (
  <Flexbox gap={8} padding={16} style={{ maxHeight: '75vh' }}>
    <AddSkillButton />
    <CustomList />
  </Flexbox>
);
