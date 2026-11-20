// BroAnt does not track uninstalls via external Google Forms.
export const UNINSTALL_FORM = '';

/** Clears the uninstall URL at worker start. */
export function setUninstallPage(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.setUninstallURL) {
    void chrome.runtime.setUninstallURL('').catch(() => {});
  }
}
