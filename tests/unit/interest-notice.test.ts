import { describe, expect, it } from 'vitest';
import { NOTICE_VERSION } from '../../src/lib/notice-version';
import { interestNotice } from '../../src/lib/interest-notice';
import { loadPrivacy } from '../../src/lib/privacy-schema';

describe('interestNotice', () => {
  const privacy = loadPrivacy();
  const n = interestNotice(privacy, NOTICE_VERSION);

  it('links to /privacy and shows the notice version', () => {
    expect(n.privacyHref).toBe('/privacy');
    expect(n.versionText).toContain(NOTICE_VERSION);
  });

  it('states what is collected, why, who handles it and how to withdraw', () => {
    expect(n.collected).toMatch(/email/i);
    expect(n.collected).toMatch(/WhatsApp/i);
    expect(n.purpose).toMatch(/results/i);
    expect(n.processors).toMatch(/MailerLite/);
    expect(n.withdraw).toMatch(/withdraw/i);
    expect(n.grievanceEmail).toBe(privacy.grievance.email);
  });

  it('repeats the retention text from privacy.yaml, placeholder marker included', () => {
    expect(n.retention.map((r) => r.label)).toEqual(['Email address', 'WhatsApp number', 'Usual size']);
    for (const r of n.retention) {
      const item = privacy.dataItems.find((d) => d.retention === r.text);
      expect(item).toBeDefined();
    }
  });

  it('uses no exclamation mark', () => {
    const all = JSON.stringify(n);
    expect(all).not.toContain('!');
  });

  it('throws when the version differs from privacy.yaml', () => {
    expect(() => interestNotice(privacy, '99.9')).toThrow(/NOTICE_VERSION/);
  });
});
