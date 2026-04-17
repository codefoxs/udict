# udict

A uTools plugin (and standalone dev server) for looking up MDX/MDD dictionaries offline.

## Features

- Parses MDX + multiple MDD files per dictionary
- Resolves `sound://`, `file://`, `entry://` and relative resource URLs
- Resources are loaded from MDD first, then mdx sibling directory
- Click audio icons to play; click entry cross-refs to re-query
- Prefix suggestions while typing
- CSS isolation via iframe srcdoc

## Files

- `src/dict.js` — mdx/mdd loader, lookup, prefix, resource resolution
- `src/resolver.js` — rewrites dictionary HTML to route resources through local server
- `src/server.js` — http server exposing `/api/lookup`, `/api/prefix`, `/res/<dict>/<key>`
- `ui/` — browser UI
- `preload.js` — uTools preload: starts embedded server
- `plugin.json` — uTools manifest
- `config.json` — list of dictionaries

## Dev run

```
node src/server.js
# open http://127.0.0.1:7219/
```

## Install in uTools

1. Open uTools settings -> plugins -> dev -> create new.
2. Point to `D:\code\Claude_code\udict\plugin.json`.
3. Type keyword `udict` in uTools main box.

## Configure dictionaries

Edit `config.json`:

```json
{
  "dictionaries": [
    { "name": "LDOCE5++", "mdx": "D:/path/to/your.mdx" }
  ]
}
```

The loader auto-discovers sibling `.mdd` / `.1.mdd` / `.2.mdd` based on the mdx basename.
