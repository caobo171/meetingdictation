/**
 * The MeetingDictation website the extension syncs with. `MD_APP_URL` at build
 * time picks the default; a connection made on any allowed origin wins.
 * Keep APP_ORIGINS in step with manifest.json (host_permissions and the
 * connect content script).
 */
declare const __MD_APP_URL__: string;

export const DEFAULT_APP = __MD_APP_URL__;
export const APP_ORIGINS = ['http://localhost:4100', 'https://meetingdictation.com'];

export interface Auth {
  token: string;
  email: string;
  name?: string | null;
  app: string;
}
