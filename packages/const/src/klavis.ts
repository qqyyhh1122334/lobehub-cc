import type { IconType } from '@icons-pack/react-simple-icons';

/** Retained for loading existing database records; this edition offers no cloud connectors. */
export interface KlavisServerType {
  author: string;
  authorUrl?: string;
  description: string;
  icon: string | IconType;
  identifier: string;
  label: string;
  readme: string;
  serverName: string;
}
export const KLAVIS_SERVER_TYPES: KlavisServerType[] = [];
export const getKlavisServerByServerIdentifier = (identifier: string) =>
  KLAVIS_SERVER_TYPES.find((server) => server.identifier === identifier);
