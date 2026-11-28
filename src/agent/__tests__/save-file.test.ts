import { describe, expect, it } from 'vitest';
import { checkSave, requiresSaveConfirmation } from '../save-file';

describe('save_file checks', () => {
  it('takes a plain name whose extension matches its type', () => {
    expect(checkSave({ filename: 'report.csv', content: 'a,b\n1,2', mimeType: 'text/csv' })).toEqual({
      ok: true,
      filename: 'report.csv',
      mimeType: 'text/csv',
      bytes: 7,
    });
    expect(checkSave({ filename: 'Notes 2026.md', content: '# Hi', mimeType: 'text/markdown' }).ok).toBe(true);
  });

  it('refuses a program or a script under a harmless name, a mismatched type, folders and hidden files', () => {
    for (const filename of ['setup.exe', 'run.sh', 'page.js', 'report.csv.exe', 'archive.zip']) {
      expect(checkSave({ filename, content: 'x', mimeType: 'text/plain' }).ok).toBe(false);
    }
    expect(checkSave({ filename: 'data.json', content: '{}', mimeType: 'text/html' })).toMatchObject({
      ok: false,
      reason: 'a .json file has the type application/json, not text/html.',
    });
    for (const filename of ['../evil.txt', 'a/b.txt', 'C:\\x.txt', '.bashrc', '', 'CON.txt', 'nul.csv', 'report.txt.', 'note.txt ']) {
      expect(checkSave({ filename, content: 'x', mimeType: 'text/plain' }).ok).toBe(false);
    }
  });

  it('requires confirmation for html files even in Auto mode', () => {
    expect(requiresSaveConfirmation('page.html', 'text/html')).toBe(true);
    expect(requiresSaveConfirmation('page.htm', 'text/plain')).toBe(true);
    expect(requiresSaveConfirmation('report.csv', 'text/csv')).toBe(false);
  });
});
