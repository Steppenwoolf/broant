// `save_file`: text the agent made, saved to the Downloads folder. The file name must end in an extension that matches
// its type, so a program or a script cannot be saved under a harmless name.
import type { AgentTool } from './tools';

/** The types a file may have, by extension. */
export const SAVE_TYPES: Record<string, string> = {
  csv: 'text/csv',
  md: 'text/markdown',
  json: 'application/json',
  txt: 'text/plain',
  html: 'text/html',
};

/** At most this much text; a file is a summary, a table or a report, not a dump. */
export const MAX_SAVE = 5 * 1024 * 1024;

export const SAVE_FILE_TOOL: AgentTool = {
  name: 'save_file',
  source: 'agent',
  group: 'files',
  description:
    "Save text you made as a file in the user's Downloads folder: CSV, Markdown, JSON, plain text or HTML. In Ask mode the user is asked first. An existing file is never overwritten.",
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'A plain file name ending in .csv, .md, .json, .txt or .html' },
      content: { type: 'string', description: 'The whole text of the file' },
      mimeType: { type: 'string', enum: Object.values(SAVE_TYPES) },
    },
    required: ['filename', 'content', 'mimeType'],
    additionalProperties: false,
  },
};

export type SaveCheck = { ok: true; filename: string; mimeType: string; bytes: number } | { ok: false; reason: string };

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Returns true for file types that can execute scripts locally (e.g. HTML) and always require user confirmation. */
export function requiresSaveConfirmation(filename: string, mimeType: string): boolean {
  return mimeType === 'text/html' || /\.html?$/i.test(filename);
}

/** Checks a `save_file` call before anything is saved. */
export function checkSave(args: Record<string, unknown>): SaveCheck {
  const rawInput = typeof args.filename === 'string' ? args.filename : '';
  const raw = rawInput.trim();
  const content = typeof args.content === 'string' ? args.content : null;
  const mimeType = typeof args.mimeType === 'string' ? args.mimeType : '';
  if (content === null) return { ok: false, reason: 'content must be text.' };
  // A plain name: no folders, no hidden file, no trailing dot/space, no Windows reserved names.
  // eslint-disable-next-line no-control-regex
  if (
    !raw ||
    /[/\\:*?"<>|\u0000-\u001f]/.test(raw) ||
    raw.startsWith('.') ||
    /[.\s]$/.test(rawInput) ||
    WINDOWS_RESERVED_NAME.test(raw) ||
    raw.length > 120
  ) {
    return { ok: false, reason: 'filename must be a plain file name, such as report.csv, without folders.' };
  }
  const extension = /\.([a-z0-9]+)$/i.exec(raw)?.[1]?.toLowerCase() ?? '';
  const expected = SAVE_TYPES[extension === 'htm' ? 'html' : extension];
  if (!expected) return { ok: false, reason: 'the file must end in .csv, .md, .json, .txt or .html.' };
  if (expected !== mimeType)
    return { ok: false, reason: `a .${extension} file has the type ${expected}, not ${mimeType || 'none'}.` };
  const bytes = new TextEncoder().encode(content).length;
  if (bytes > MAX_SAVE) return { ok: false, reason: 'the file is larger than 5 MB.' };
  return { ok: true, filename: raw, mimeType, bytes };
}
