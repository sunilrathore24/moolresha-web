# Launch checklist

Complete this list before a public launch (`PUBLIC_LAUNCH=true`). A person does each review, then writes the date on the matching line below.

## How the records work

`scripts/launch-gate.ts` reads the list lines in the "Required records" section. A record counts as done only when the line ends with a real date written `YYYY-MM-DD`. A blank value, or anything that is not a valid date, means "not recorded". Leave a line blank until the review is finished. Do not guess a date.

The gate runs only when `PUBLIC_LAUNCH=true`. It fails the build if the lawyer review date or any Concept's on-model review is missing. It checks that the record exists. It does not check the quality of the review.

Example of the format (this block is ignored by the gate):

```
- lawyer-review-date: YYYY-MM-DD
- on-model-review: <concept-id>: YYYY-MM-DD
```

## Required records (checked by the launch gate)

### Lawyer review

A lawyer reviews the final copy and flow of: the Privacy_Notice, the consent flow (Interest_Form and withdrawal), the Price_Layers copy and the Market_Price_Context copy. Record the date the review was completed (Requirement 19.5).

- lawyer-review-date: 

### On-model no-face review

A person opens every `08-on-model` image for the Concept and confirms that no face is shown. Record the date per Concept (Requirement 8B.10).

- on-model-review: mens-cotton-shirt: 
- on-model-review: mens-cotton-linen-shirt: 
- on-model-review: mens-linen-shirt: 
- on-model-review: mens-relaxed-pant: 
- on-model-review: womens-coord-set: 

## Other records (for people, not checked by the launch gate)

### Alt text against images

A person compares each Concept_View's alt text with the image file now in the Concept's folder and confirms the alt text describes what is visible (Requirement 8A.13).

- alt-text-review: 

### Free-tier limits re-check

A person re-checks the current Cloudflare (Pages, Functions, D1, Turnstile, Web Analytics) and MailerLite free-tier limits against the figures in the design, because they change often.

- free-tier-limits-recheck: 
