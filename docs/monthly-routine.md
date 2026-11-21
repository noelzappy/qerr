# Monthly routine

The steps a person follows each month. Part 1 is done once. Part 2 is done the very first time the tool talks to the
real Buffer, because that has never happened yet. Part 3 is the monthly loop.

Commands run from the repository folder. Nothing publishes anything until step 12 of part 3 (images are made in step 2 and never leave the machine until you host or upload them in step 4).

Nothing in this routine has been run against a real Buffer account or a real storage bucket yet. Part 2 is where that
changes, one post at a time.

## Part 1: first-time setup

**Before you start: the brand.** The images, the series and the AI's brand brief come from the brand pack named by
`BRAND_DIR` (in `.env` or the environment). Without it the tool uses the demo pack, `brands/demo` (the fictional Acme
Savings), which is fine for trying the commands but not for real posts. Make your own pack first; see "Brand packs" in the
README.

1. **Create the key.** Sign in to Buffer and open <https://publish.buffer.com/settings/api>. Create a key. Copy it once;
   treat it like a password.
2. **Create `.env`.**
   ```sh
   cp .env.example .env
   ```
   Edit `.env` and set `BUFFER_API_KEY=` to the key. Leave `BUFFER_ORG_ID` empty unless the key sees several
   organisations. `.env` is ignored by git. Never paste the key anywhere else.
3. **Run `check`.**
   ```sh
   node packages/engine/buffer.mjs check
   ```
   Expect: "The key works", your organisations, your channels, a suggested `channels.json`, the schema summary and
   `Mismatches: none`. If it lists mismatches, stop: the tool sends something Buffer will reject. Compare with
   [buffer-api-notes.md](buffer-api-notes.md) and fix the code and its tests before going on. If it reports several
   organisations, put one id in `BUFFER_ORG_ID` and run it again.
4. **Fill in the channel ids.**
   ```sh
   cp channels.example.json channels.json
   ```
   Paste the ids `check` suggested, after confirming each one is the right account (for example, that the Instagram id
   is the business account and not a personal one). `channels.json` is ignored by git. This is the one-account setup.

   **Several Buffer accounts instead.** If the channels are spread over more than one Buffer account (for example X and
   LinkedIn in one, Facebook and Instagram in another), do steps 1 to 4 differently:
   1. Create one key per account (each in its own Buffer login). Keys expire, so note the date; create a new one when it
      stops working.
   2. Put each in `.env` under its own name, for example `BUFFER_KEY_MAIN=` and `BUFFER_KEY_SECOND=`.
   3. `cp accounts.example.json accounts.json` and list the accounts there with `"keyEnv": "BUFFER_KEY_MAIN"` (the
      name of the variable, never the key). Leave the `routing` channel ids empty for now.
   4. Run `node packages/engine/buffer.mjs check`. It tests every key, lists each account's channels and prints a `routing` block.
      Paste the ids into `accounts.json` after confirming each is the right profile, then run `check` again: it must say
      that every channel is held by the account it is routed to.
   While `accounts.json` exists, `BUFFER_API_KEY`, `BUFFER_ORG_ID` and `channels.json` are not used. Delete it to go back
   to the one-account setup.
5. **Choose where the media lives.** Buffer cannot take uploads through this tool. It fetches each file from a public
   URL. Use any HTTPS host that returns the file with status 200 and an `image/*` or `video/*` content type, with no
   login and no redirect to a web page. Two ways:
   - **Your own host or bucket, by hand.** Set `MEDIA_BASE_URL` in `.env` to the URL of the folder that holds the
     batch's files, for example `https://media.example.com/example-launch`. The tool builds each URL as
     `MEDIA_BASE_URL/<file name>`, and you upload the files yourself.
   - **S3-compatible storage (Hetzner Object Storage was the target), by the tool.** Create a bucket (for example
     `example-bucket`) and an access key in the provider's console, allow public read on the `public/` prefix only (in the bucket policy; the tool never changes it), and
     put the `S3_*` settings in `.env` (see `.env.example`: endpoint such as `https://fsn1.your-objectstorage.com`,
     region = the location, bucket, access key id and secret, the bucket's public base URL). `node packages/engine/buffer.mjs upload`
     then uploads the files and records their URLs.
6. If you use the by-hand route, set `MEDIA_BASE_URL` as above. With `upload` you do not need it. A batch that has been
   uploaded uses the uploaded URLs; one that has not keeps using `MEDIA_BASE_URL`.

## Part 2: the first-ever run

Do this once, before the first real batch, because nothing here has been proved against real Buffer.

7. Take one post from a real batch. Make sure its media is hosted and `node packages/engine/buffer.mjs media <batch> --only <id>
   --channel instagram --verify` says `ok`.
8. Send it as a draft to one channel only:
   ```sh
   node packages/engine/buffer.mjs push batches/<month>.json --only <id> --channel instagram
   node packages/engine/buffer.mjs push batches/<month>.json --only <id> --channel instagram --yes
   ```
   The first command shows what would happen. The second sends. Never add `--live` here.
9. Open Buffer and look at the draft. Check:
   - the text is complete, with its line breaks and hashtags
   - the date and time are right, in the right time zone
   - the media shows, in the right order, and for a video, the thumbnail
   - the post type is right (post, reel or carousel) and the first comment, if any
   - the channel is the account you meant
10. Run `node packages/engine/buffer.mjs status batches/<month>.json`. It should list the draft and show it as `in Buffer (draft)`. If
    the draft is not listed, or the status call fails, note the message: the `draft` status value is one of the
    unverified points.

**Extra checks the first time you use several accounts, X or the upload** (none of them has run for real yet):

- Upload one file first: `node packages/engine/buffer.mjs upload batches/<month>.json --only <id> --yes`. Then open the printed URL in a
  private browser window: the picture must show without any login. `media --verify` must say `ok`. If the tool says
  `NOT PUBLIC`, fix the bucket's public read on that prefix; if it says `SignatureDoesNotMatch` or `403`, check the
  `S3_*` values (region is the location, for example `fsn1`).
- Send one draft through **each** account (`--only <id> --channel <network>`, once for a network routed to each
  account), look at each draft in the right Buffer login, and run `status`: each record must show as `in Buffer`
  under its own account.
- For X, check the draft's text length in Buffer against the plan's `used/limit`, and that Buffer calls the channel
  what `check` showed (the `service` name for X is unconfirmed).
- Write what you confirmed into `docs/buffer-api-notes.md`.

If anything is wrong, stop and fix the tool or the batch. Delete the test draft in Buffer by hand. Because the tool
recorded it, either keep it (the full push later skips it as "already a draft") or delete it and run the next push with `--force-new` for that
post. If everything is right, go on with the monthly loop. Record in `docs/buffer-api-notes.md` which points were
confirmed.

## Part 3: each month

1. **Write the batch.** Copy last month's file to `batches/<month>.json`. Change `name` (so the new posts get their
   own state file), the dates, captions and media. See [batch-format.md](batch-format.md). For each picture post add a
   `design` block with the words and the picture you want on it: pick a template (`cover`, `text`, `ledger`, `passbook`, `myth-fact`, `stats`, `screen`, `photo-story`, `closing`, `photo`, or a `carousel` of pages) and a `series` from the brand pack's `brand.json` (the demo's are `explainers`, `myth-vs-fact`, `the-numbers`, `on-record`, `news` and `community`). A carousel also writes a PDF of its pages next to the images, for LinkedIn documents (it is not added to `media`).
2. **Make the images.** Put your photos in `packages/engine/design/assets/photos/` (and write each one into `CREDITS.md` with its
   licence) and your app screenshots in `packages/engine/design/assets/screens/`. Then:
   ```sh
   node packages/engine/design.mjs lint batches/<month>.json     # brand text check, no Chrome
   node packages/engine/design.mjs render batches/<month>.json   # needs Google Chrome
   ```
   The images (and carousel PDFs) land in `media/<month>/` (the batch's `mediaRoot`) and `media` is filled in for posts that had none. Read
   every warning, and **open every image and look at it**: the tool measures contrast and fit, it cannot tell whether a
   picture is right for the words. Edit the words or the `focal` point and render again until each image is right
   (`--only <postId>` renders one). Videos, and images made elsewhere, go in the same folder by hand with lowercase
   URL-safe names. See [design.md](design.md) and [../media/README.md](../media/README.md).
3. **Plan.**
   ```sh
   node packages/engine/buffer.mjs plan batches/<month>.json
   ```
   Read the table and every warning. Check dates, times, types and caption lengths. Fix the batch and rerun until it
   is right. Nothing is sent.
4. **Host the media.** Either upload the folder's contents to your host so each file is at `MEDIA_BASE_URL/<file name>`,
   or let the tool do it:
   ```sh
   node packages/engine/buffer.mjs upload batches/<month>.json          # lists what would be uploaded, sends nothing
   node packages/engine/buffer.mjs upload batches/<month>.json --yes    # checks the bucket, uploads what is missing
   ```
   Read the key names in the first command. Running the second again is safe and uploads nothing new. If it says `NOT
   PUBLIC`, fix the bucket's public read on that prefix and run it again. Run `plan` once more after an upload: the
   media column's URLs are now the bucket's.
5. **Verify the media.**
   ```sh
   node packages/engine/buffer.mjs media batches/<month>.json --verify
   ```
   Every row must say `ok`. A missing file shows `MISSING`, a bad URL shows `FAIL`. It checks the URLs `push` will
   send: the uploaded ones where `upload` has run.
6. **Dry run the push.**
   ```sh
   node packages/engine/buffer.mjs push batches/<month>.json
   ```
   Every row should say `create`. Nothing is sent.
7. **Send drafts.**
   ```sh
   node packages/engine/buffer.mjs push batches/<month>.json --yes
   ```
   With several accounts each post goes to the account its channel belongs to, and the summary shows each account.
   If it stops with a message, read it: it names the account and channel, and lists the items that were not sent. If it says an attempt had no clear answer, follow the unknown-result steps in
   the README before doing anything else.
8. **Review the drafts in Buffer.** Same checks as step 9 of part 2, for every post.
9. **Fix problems.** To change a post that is already a draft, edit the batch, delete the draft in Buffer, and push that
   post again with `--only <id> --force-new --yes`. Without `--force-new` the tool refuses, on purpose.
10. **Check the live run.**
    ```sh
    node packages/engine/buffer.mjs push batches/<month>.json --live
    ```
    Every row should say `create live (from draft)`, with the note that the draft stays in Buffer. Check no row is
    refused for a past time.
11. **Get the owner's go-ahead** for going live. Then:
12. **Schedule for real.**
    ```sh
    node packages/engine/buffer.mjs push batches/<month>.json --live --yes
    ```
    This is the step that makes posts publish at their due times.
13. **Delete the leftover drafts in Buffer.** Going live creates new posts; it does not convert the drafts. `status`
    lists the drafts with their ids.
14. **Confirm.**
    ```sh
    node packages/engine/buffer.mjs status batches/<month>.json
    ```
    Every record should show `in Buffer (scheduled)`. Look in Buffer's queue for the month and confirm the count is the
    number of posts times channels. A record that shows "not in the scheduled/draft lists" is not necessarily wrong
    (the tool reads only the first page), so look in Buffer.

After publishing day, `state/` and `out/` can stay; they are ignored by git. Keep `state/<month>.json` until the month
is over, because it is the only record that stops a rerun from creating duplicates.
