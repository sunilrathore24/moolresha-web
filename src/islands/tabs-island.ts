/**
 * Behavior for `Tabs.astro`. Generalised from `design-lab.ts`'s select()/dots mechanism:
 * same shape (one visible panel, roving focus, Left/Right/Home/End), real tab semantics.
 *
 * Hooks (see Tabs.astro's header comment): [data-tabs], [data-tabs-list],
 * button[data-tab-id], [data-tab-panel].
 */

export const ENHANCED_CLASS = 'tabs-enhanced';

export function initTabs(root: HTMLElement): boolean {
  if (root.classList.contains(ENHANCED_CLASS)) return false;
  const list = root.querySelector<HTMLElement>('[data-tabs-list]');
  if (!list) return false;
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[data-tab-id]')];
  const panels = tabs.map((t) => root.querySelector<HTMLElement>(`[data-tab-panel="${t.dataset.tabId}"]`));
  if (tabs.length < 2 || panels.some((p) => !p)) return false;
  const ps = panels as HTMLElement[];
  let current = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));

  function select(index: number, focus: boolean): void {
    const n = tabs.length;
    const i = ((index % n) + n) % n;
    current = i;
    tabs.forEach((t, k) => {
      const active = k === i;
      t.setAttribute('aria-selected', String(active));
      t.tabIndex = active ? 0 : -1;
    });
    ps.forEach((p, k) => {
      p.hidden = k !== i;
    });
    if (focus) tabs[i]?.focus();
  }

  list.addEventListener('click', (e) => {
    const tab = (e.target as Element | null)?.closest<HTMLButtonElement>('[data-tab-id]');
    if (!tab) return;
    select(tabs.indexOf(tab), false);
  });

  list.addEventListener('keydown', (e) => {
    const to =
      e.key === 'ArrowRight' ? current + 1
      : e.key === 'ArrowLeft' ? current - 1
      : e.key === 'Home' ? 0
      : e.key === 'End' ? tabs.length - 1
      : null;
    if (to === null) return;
    e.preventDefault();
    select(to, true);
  });

  select(current, false);
  root.classList.add(ENHANCED_CLASS);
  return true;
}

export function initAllTabs(scope: ParentNode = document): void {
  scope.querySelectorAll<HTMLElement>('[data-tabs]').forEach((r) => initTabs(r));
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAllTabs(), { once: true });
  } else {
    initAllTabs();
  }
}
