# Deletion and withdrawal procedure

For the Admin. Use this when a request to delete data or withdraw consent arrives through the Grievance_Contact (Requirements 13.5, 13.6).

It deletes one person's email, WhatsApp number, consent records and any feedback linked to them, in D1 and at MailerLite. Feedback that was never linked to contact details is anonymous and cannot be traced to a person, so it stays. The Privacy_Notice says this.

`scripts/delete-person.ts` only prints. It does not open the database, run any delete or call the network. You run the printed commands yourself.

## Response times

| Step | Time | Status |
|---|---|---|
| Acknowledge the request | within 7 days | ⚠️ lawyer to confirm |
| Complete the deletion and reply | within 30 days | ⚠️ lawyer to confirm |

These must match the times stated in the Privacy_Notice (`privacy.yaml`).

## 1. Verify the requester

Do not delete on an unverified request.

- Email request: reply from the grievance mailbox to the address given, and ask the requester to confirm from that address. Delete only after they reply.
- Phone request: ask them to send a WhatsApp message from that number to the MoolResha number.
- If the requester cannot be verified, do not delete. Reply asking for confirmation by one of the two routes above.

## 2. Look the person up

Print the lookup command:

```
npx tsx scripts/delete-person.ts lookup <email | +91XXXXXXXXXX | 10-digit mobile>
```

Run the `npx wrangler d1 execute moolresha_feedback --remote --command "SELECT ..."` command it prints. The output is one row with `id`, `anon_id` and `linked`.

- No row: nothing is stored under that address or number. Check for a different spelling or the other identifier, then go to step 5 (MailerLite may still hold the address) and step 7.
- The lookup is by one identifier. If the requester gave both an email and a phone number and the two return different ids, run steps 3 to 4 for each id.

## 3. Generate and review the delete plan

Pass the values from step 2:

```
npx tsx scripts/delete-person.ts plan --id <id> --linked <0|1> --anon-id <anon_id>
```

For an unlinked row (`linked = 0`, `anon_id` empty), leave out `--anon-id`.

Read the output before running anything. Check that:

- The `id` and `anon_id` are the ones from step 2.
- A linked row has four statements, in this order: `concept_feedback`, `frustration`, `consents`, `interest`.
- An unlinked row has two statements: `consents` and `interest`. No feedback is deleted, because none is tied to this person.

The statements use bound parameters (`?1`), and each value is printed on the line below it. The "Runnable file" block contains the same statements for `wrangler`, which cannot bind values. It inlines only the integer id and the Anonymous_ID, never an email address or phone number.

`consents` also has `ON DELETE CASCADE`, but the plan deletes it explicitly so the record of what was removed is complete.

## 4. Run it

Save the runnable block as `delete.sql` in a private folder outside the repo, then run:

```
npx wrangler d1 execute moolresha_feedback --remote --file=delete.sql
```

Then run the lookup from step 2 again. It must return no rows. Delete `delete.sql` afterwards. Feedback written after this point belongs to a new Anonymous_ID and is not linked to the person.

## 5. Forget the subscriber at MailerLite

1. Find the subscriber by the requester's email: dashboard search, or `GET /api/subscribers/:email`. Note the subscriber id.
2. Call `POST /api/subscribers/:id/forget`. Do not use `DELETE`. `DELETE` keeps the data in case the person subscribes again, so it does not meet a deletion request.
3. MailerLite completes a forget within 30 days. Note that date for the reply.

A phone-only requester has no MailerLite record.

## 6. Log the request

Record the following in `docs/deletion-log.md`, kept outside the public repo or in a private admin note:

- request received date
- completion date
- whether D1 and MailerLite were both done
- a hash of the email, not the email itself

Do not record the email address, phone number, `anon_id` or any message text. ⚠️ lawyer to confirm whether a log is required and what it may hold.

## 7. Reply to the requester

Reply from the grievance mailbox, inside the time in the table above. Say what was deleted (contact details, consent records and linked feedback), that MailerLite completes its deletion within 30 days, and that feedback never linked to contact details cannot be traced to them and so remains.
