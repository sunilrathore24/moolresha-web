/**
 * Text of the notice shown BEFORE the Interest_Form fields (Requirement 12.2).
 *
 * Retention lines come from `privacy.yaml`, so the notice and the Privacy_Notice page cannot
 * disagree, and a placeholder carries the same "confirm" marker in both places.
 * Pure: takes the already-loaded Privacy data, reads no files.
 */
import type { PrivacyData } from './privacy-schema';

export interface InterestNotice {
  heading: string;
  collected: string;
  purpose: string;
  processors: string;
  retention: Array<{ label: string; text: string }>;
  withdraw: string;
  grievanceLabel: string;
  grievanceEmail: string;
  privacyHref: string;
  privacyLinkText: string;
  versionText: string;
}

/** Data items whose retention the notice repeats. */
const RETENTION_ITEMS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'contact-email', label: 'Email address' },
  { id: 'contact-whatsapp', label: 'WhatsApp number' },
  { id: 'contact-size', label: 'Usual size' },
];

export function interestNotice(privacy: PrivacyData, noticeVersion: string): InterestNotice {
  if (privacy.version !== noticeVersion) {
    throw new Error(
      `NOTICE_VERSION (${noticeVersion}) does not match privacy.yaml#version (${privacy.version}).`,
    );
  }
  const retention = RETENTION_ITEMS.map(({ id, label }) => {
    const item = privacy.dataItems.find((d) => d.id === id);
    if (!item) throw new Error(`privacy.yaml has no data item "${id}" for the Interest_Form notice.`);
    return { label, text: item.retention };
  });
  return {
    heading: 'What we collect and why',
    collected:
      'Only what you type here: an email address, a WhatsApp number and a usual size, each optional. ' +
      'For every box you tick we also keep which box it was, the notice version and the time.',
    purpose: 'To send you the results of this research and updates about the launch.',
    processors:
      'Your email address goes to MailerLite, our email provider, which first sends you a confirmation email. ' +
      'Everything else is stored with Cloudflare, which hosts this site.',
    retention,
    withdraw:
      'You can withdraw any consent at any time. Use the unsubscribe link in any email, or write to the ' +
      `${privacy.grievance.label} at`,
    grievanceLabel: privacy.grievance.label,
    grievanceEmail: privacy.grievance.email,
    privacyHref: '/privacy',
    privacyLinkText: 'Read the full privacy notice',
    versionText: `Privacy notice version ${privacy.version}`,
  };
}
