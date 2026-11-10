import { describe, expect, it } from 'vitest';
import { FRUSTRATION_CHIPS, SIZES } from '../../src/content/config/allow-lists';
import { InterestBody } from '../../functions/_shared/schemas';
import {
  FRUSTRATION_LABELS,
  INTEREST_FIELDS,
  INTEREST_FIELD_ORDER,
  SIZE_LABELS,
  frustrationOptions,
  interestControlId,
  interestErrorId,
  sizeOptions,
  whatsappForSubmit,
} from '../../src/lib/launch-forms';

describe('frustrationOptions', () => {
  it('lists the eight Frustration_Chips in allow-list order with unique ids and plain labels', () => {
    const o = frustrationOptions();
    expect(o.map((x) => x.value)).toEqual([...FRUSTRATION_CHIPS]);
    expect(o).toHaveLength(8);
    expect(new Set(o.map((x) => x.id)).size).toBe(8);
    for (const x of o) expect(x.label).toBe(FRUSTRATION_LABELS[x.chip]);
  });
});

describe('sizeOptions', () => {
  it('offers XS to XXL plus "Prefer not to say"', () => {
    const o = sizeOptions();
    expect(o.map((x) => x.value)).toEqual([...SIZES]);
    expect(o.map((x) => x.label)).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Prefer not to say']);
    expect(Object.keys(SIZE_LABELS)).toHaveLength(SIZES.length);
  });
});

describe('interest field names and ids', () => {
  it('uses the names the island expects', () => {
    expect(Object.values(INTEREST_FIELDS).sort()).toEqual(
      ['consent-adult', 'consent-email', 'consent-link', 'consent-whatsapp', 'email', 'size', 'whatsapp'].sort(),
    );
    expect([...INTEREST_FIELD_ORDER].sort()).toEqual(Object.values(INTEREST_FIELDS).sort());
  });

  it('gives each field a distinct control id and error id', () => {
    const ids = INTEREST_FIELD_ORDER.flatMap((n) => [interestControlId(n), interestErrorId(n)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('whatsappForSubmit', () => {
  it('returns an empty string for blank input', () => {
    expect(whatsappForSubmit('')).toBe('');
    expect(whatsappForSubmit('   ')).toBe('');
  });

  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['98765-43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
  ])('turns %s into %s', (raw, expected) => {
    expect(whatsappForSubmit(raw)).toBe(expected);
  });

  it('produces a value the shared interest schema accepts for a valid Indian mobile', () => {
    const body = {
      anonId: '123e4567-e89b-42d3-a456-426614174000',
      whatsapp: whatsappForSubmit('98765 43210'),
      consents: { email: false, whatsapp: true, link: false, adult: true },
      noticeVersion: '0.1',
      turnstileToken: 't',
    };
    expect(InterestBody.safeParse(body).success).toBe(true);
  });

  it('leaves an invalid number for the shared schema to reject', () => {
    const body = {
      anonId: '123e4567-e89b-42d3-a456-426614174000',
      whatsapp: whatsappForSubmit('12345'),
      consents: { email: false, whatsapp: true, link: false, adult: true },
      noticeVersion: '0.1',
      turnstileToken: 't',
    };
    expect(InterestBody.safeParse(body).success).toBe(false);
  });
});
