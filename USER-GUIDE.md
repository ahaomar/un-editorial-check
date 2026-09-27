# User Guide — Check Your Document Before You Share It

**For United Nations staff, researchers, students and professionals. No coding knowledge needed.**

This is the simple version of this project. Developers should read [README.md](README.md) instead, which covers installation, all rule identifiers and advanced options.

## What the tool does, in plain words

You point it at an English document. It reads the text the way an editorial reviewer would and reports:

- spelling and grammar problems, such as a word typed twice or a missing space between two sentences;
- wording that may sound impolite, too strong, promotional or one-sided;
- statements about sensitive topics, such as territorial disputes, that take one side — the report suggests neutral wording and treats every side of a claim the same way;
- date, number and United Nations terminology mistakes common in formal reports.

It then writes a PDF report named `un-editorial-review.pdf`. The report shows your current wording next to the suggested wording, so you can see every proposed change before you accept any of them.

**Your document is never changed on its own.** Your AI assistant must stop and ask for your permission first, and it must never invent wording that the report does not contain.

## What you need (one-time setup)

- **An AI assistant that can run tools on your computer.** This guide uses Claude Code as the example. Other assistants work too.
- **Node.js version 18 or newer.** It is a free tool that lets your computer run programs like this one. If your computer does not have it, ask your IT colleague to install it — it takes a few minutes.
- **Your document as a text file.** The tool reads Markdown (`.md`), plain text (`.txt`), web pages (`.html`) and script files. For a Word document or a PDF, copy the text into a `.txt` file first.

To confirm Node.js is ready, ask your AI assistant to run `node --version`. It should answer with version 18 or higher.

## Step 1 — Open your AI assistant in your document folder

Start your assistant inside the folder that holds your document. With Claude Code: open a terminal window, change into your document folder, type `claude`, and press Enter.

## Step 2 — Copy and paste the prompt below

Copy everything inside the box, paste it into your assistant, and replace `<PASTE YOUR FILE NAME HERE>` with the name of your file — for example `statement.md`.

```text
Check a document for me using the tool "un-editorial-check", a free open-source
editorial checker for United Nations style English copy. Follow these steps in order:

1. The tool needs no installation: it runs through npx (Node.js 18 or newer).
2. Check my file and write a PDF report:
   npx -y un-editorial-check "<PASTE YOUR FILE NAME HERE>" --report un-editorial-review.pdf
3. Summarise what was found: how many issues of each severity, the most important
   issues, and for each one the current wording beside the suggested wording.
   Tell me where the PDF report was saved.
4. Stop and ask me exactly one question: Apply these corrections?
   Do not modify any file before I explicitly approve.
5. Only after I approve, for example when I answer "go ahead":
   - apply the automatic corrections:
     npx -y un-editorial-check "<PASTE YOUR FILE NAME HERE>" --fix --apply
   - rewrite the remaining flagged passages using ONLY the suggested wording from the
     report. If the report gives no suggested wording for a finding, do not invent any:
     ask me what should be written instead.
6. Run the check one more time and tell me honestly what is left. Only say the document
   is clean if the tool reports exit code 0.

My document is: <PASTE YOUR FILE NAME HERE>
```

## Step 3 — Read the summary, then decide

Your assistant checks the document, shows you what it found, and points you to the PDF report. It then asks one question: `Apply these corrections?`

- Answer **go ahead** and the suggested changes are applied.
- Answer **no**, or anything else, and it stops without touching your file.

## Step 4 — Review the final result

Your assistant runs the check one more time and tells you which issues remain. It only says your document is clean when the tool reports exit code 0.

## You stay in control

- Nothing in your document changes before you approve it.
- Suggested wording comes only from the report. If the report has no suggestion, the assistant asks you instead of writing something of its own.
- The tool reviews how text is written. It does not decide whether a statement is true.
- The tool runs on your own computer and never sends your document anywhere. Your assistant has its own privacy policy, which is separate.
- Keep a copy of your original file if you want to be able to go back.

## Things worth knowing

- **Cost:** the tool itself is free to download and use, under the MIT licence. Your AI assistant subscription is separate.
- **Language:** the checks are written for English copy in United Nations style.
- **File formats:** Markdown, plain text, HTML and script files. For Word or PDF, paste the text into a `.txt` or `.md` file first.
- **Slash command:** if your assistant supports commands, a technical colleague can install the `/un-diplomatic-agent` command once by following [README.md](README.md). After that you can start by typing that command instead of pasting the prompt.
- **Where the rules come from:** the full list of checks, with institutional sources, is in [rules/catalogue.json](rules/catalogue.json) and explained in the README.

## For technical readers

Developers, and anyone who wants the full rule list, CI integration, configuration profiles or the report format, should read [README.md](README.md).
