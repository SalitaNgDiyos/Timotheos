# The Timotheos module catalog

`catalog.json` is the list that the **Download modules** window of Timotheos shows under the repository "Timotheos".
Anyone can publish a catalog of their own in the same format and add its address in that window.

```json
{
  "name": "Name of the repository",
  "about": "One sentence about it.",
  "modules": [
    {
      "title": "Shown to the reader (needed)",
      "url": "https://… address of the module file (needed, https only; may be relative to the catalog)",
      "file": "name.ont (the file name to save under; taken from the address when left out)",
      "language": "English",
      "kind": "Bible",
      "description": "One or two sentences.",
      "licence": "Who published it and under which terms.",
      "size": 1234567
    }
  ]
}
```

The module file can be anything Timotheos imports: theWord (`.ont .ot .nt .twm .twzip`), e-Sword (`.bblx .cmtx .dctx …`),
USFM or USFX, or a `.zip` holding these. List only modules you have the right to share.
