'use client';

import { KlavisDetailProvider } from './KlavisDetailProvider';
import SkillDetailInner from './SkillDetailInner';

export interface KlavisSkillDetailContentProps {
  identifier: string;
  serverName: string;
}

export const KlavisSkillDetailContent = ({
  identifier,
  serverName,
}: KlavisSkillDetailContentProps) => {
  return (
    <KlavisDetailProvider identifier={identifier} serverName={serverName}>
      <SkillDetailInner type="klavis" />
    </KlavisDetailProvider>
  );
};
