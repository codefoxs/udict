<p align="right"><b>English</b> | <a href="./README.zh-CN.md">中文</a></p>

<h1 align="center">udict</h1>

<p align="center">
  A uTools plugin for offline MDX/MDD dictionary lookup, with a built-in wordbook.
</p>

---

## Install

Search for **udict** in the uTools plugin marketplace and click install.

## Features

- **Offline MDX/MDD lookup** — directly parses local `.mdx` / `.mdd` files, no network needed
- **Multi-dictionary** — query across all configured dictionaries at once, grouped by source
- **Multi-volume MDD** — auto-discovers `.mdd` / `.1.mdd` / `.2.mdd` sibling volumes
- **Rich resources** — pronunciations, images, embedded fonts, cross-entry links all work
- **Prefix suggestions** — type a few letters for instant candidates
- **Key-index cache** — first-load extraction cached to disk; cold-start suggestions are instant
- **Wordbook** — collect words into multiple custom wordbooks, with difficulty (1–5) and notes
- **Collapsible sidebar** — dictionary jump list, font scaling, query history, wordbook manager
- **Claude-inspired theme** — warm cream + coral palette, dark-mode defeated for consistent reading

## Usage

### Query

- Open the plugin (default keyword `udict`) or type any Chinese / English word directly in the uTools main bar — click the `udict 查词` suggestion to enter.
- Press **Enter** to look up, **↑/↓** to navigate suggestions, **Esc** to clear input or exit.

### Wordbook

- Click the ☆ next to the search box to collect the current word. A modal lets you pick one or more wordbooks.
- Create new wordbooks with the `+` button in the sidebar; drag the `≡` handle to reorder; double-click a name to rename (default wordbook is locked).
- Click a wordbook to view its table — sort by word / time / difficulty, edit notes, adjust difficulty via the dropdown.
- The **Default Wordbook** aggregates every collected word across all wordbooks, with a "Source" column showing where each word lives.

### Settings

- Click the ⚙ icon to manage dictionaries. Drag `≡` to reorder dictionaries (affects result ordering).
- `Pick directory…` scans a folder and auto-adds every `.mdx` found.
- Press **Esc** to return to the query page.

### Easter egg

Type `udict` as the query word to see the About page.

## Acknowledgments

udict stands on the shoulders of these open-source projects:

- [**js-mdict**](https://github.com/terasum/js-mdict) — pure-JS MDX/MDD parser, the heart of the lookup engine
- [**uTools**](https://u.tools/) — the plugin host providing keyboard-first app launching

Thanks to the authors of LDOCE, Oxford Advanced Learner's, and the many community-maintained `.mdx` dictionaries that make offline lookup possible.

## License

MIT
