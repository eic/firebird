# Firebird DEX schema

JSON Schema for the Firebird Data Exchange (DEX) format.

- `firebird-dex-v1.schema.json` — DEX version 1.0 (current). Draft 2020-12.

## What the schema checks

- File structure: `type`, `version`, `events[]`, each event has `id` and `pieces[]`.
- Piece structure: `name`, `type`, `version`, `count`, `columns{}` of parallel
  arrays, optional `refs{}` declarations.
- Known piece types (`BoxHit`, `PointTrajectory`): their required columns and
  type-specific payloads (`pointColumns`, ragged `points`).
- Unknown piece types (extensions): base piece structure only. Extension
  column sets are open by design — a writer declares the columns it has.

## What the schema cannot check

JSON Schema has no cross-field arithmetic, so column length consistency
(scalar columns hold `count` values, flattened vector columns a whole multiple
of `count`, `points` holds `count` lists) and reference validity (`refs`
targets exist, index values are in range) are checked by readers:

- the frontend reader raises on malformed files at load,
- pyrobird tests validate converter output structurally beyond the schema.

## Format documentation

The annotated format description lives in the documentation site page
`docs/dex.md` (published at https://eic.github.io/firebird/dex).

## Validating a file

```bash
python -c "
import json, jsonschema
schema = json.load(open('dex-schema/firebird-dex-v1.schema.json'))
data = json.load(open('myfile.firebird.json'))
jsonschema.validate(data, schema)
print('valid')
"
```
