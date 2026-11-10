/**
 * Privacy_Notice content schema and loader (Requirements 13.1, 13.2, 13.3, 13.7, 13.8).
 *
 * Pure module: Zod, `yaml` and Node file reading only, no Astro imports, so
 * Vitest and the Astro page can both call the loader.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

/** Text that marks a placeholder value awaiting founder and lawyer sign-off. */
export const CONFIRM_MARKER = '⚠️ founder and lawyer to confirm';

const Text = z.string().trim().min(1);

export const DataItem = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: Text,
  detail: Text,
  purpose: Text,
  storedIn: Text,
  retention: Text,
  /** True when the item can identify a person. */
  personal: z.boolean(),
  /** True when the retention value is a placeholder and must carry the marker. */
  placeholder: z.boolean(),
});
export type DataItemData = z.output<typeof DataItem>;

export const Processor = z.strictObject({
  name: Text,
  does: Text,
  receives: Text,
});

export const Privacy = z
  .strictObject({
    /** Source of NOTICE_VERSION. */
    version: z.string().regex(/^\d+(\.\d+)*$/, 'version must look like 1 or 1.2'),
    lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lastUpdated must be YYYY-MM-DD'),
    intro: Text,
    confirmMarker: z.literal(CONFIRM_MARKER),
    dataItems: z.array(DataItem).min(1),
    processors: z.array(Processor).min(1),
    withdrawal: z.strictObject({ summary: Text, steps: z.array(Text).min(1) }),
    deletion: z.strictObject({
      summary: Text,
      steps: z.array(Text).min(1),
      anonymousNote: Text,
    }),
    responseTimes: z.strictObject({
      acknowledgeDays: z.number().int().positive(),
      completeDays: z.number().int().positive(),
      note: Text,
    }),
    grievance: z.strictObject({
      label: Text,
      organisation: Text,
      email: z.string().email(),
      note: Text,
    }),
  })
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    p.dataItems.forEach((item, i) => {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: 'custom', path: ['dataItems', i, 'id'], message: `duplicate id ${item.id}` });
      }
      ids.add(item.id);
      if (item.placeholder && !item.retention.includes(CONFIRM_MARKER)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dataItems', i, 'retention'],
          message: `placeholder retention for "${item.id}" must contain "${CONFIRM_MARKER}"`,
        });
      }
    });
    if (!p.responseTimes.note.includes(CONFIRM_MARKER)) {
      ctx.addIssue({
        code: 'custom',
        path: ['responseTimes', 'note'],
        message: `response times are placeholders and must contain "${CONFIRM_MARKER}"`,
      });
    }
    if (p.responseTimes.completeDays < p.responseTimes.acknowledgeDays) {
      ctx.addIssue({
        code: 'custom',
        path: ['responseTimes', 'completeDays'],
        message: 'completeDays must not be less than acknowledgeDays',
      });
    }
    if (!p.grievance.note.includes(CONFIRM_MARKER)) {
      ctx.addIssue({
        code: 'custom',
        path: ['grievance', 'note'],
        message: `grievance contact is a placeholder and must contain "${CONFIRM_MARKER}"`,
      });
    }
  });
export type PrivacyData = z.output<typeof Privacy>;

const CONFIG_DIR = join(process.cwd(), 'src/content/config');

export function parsePrivacy(raw: unknown): PrivacyData {
  return Privacy.parse(raw);
}

/** Loads and validates `src/content/config/privacy.yaml`. */
export function loadPrivacy(dir: string = CONFIG_DIR): PrivacyData {
  return parsePrivacy(parse(readFileSync(join(dir, 'privacy.yaml'), 'utf8')));
}
