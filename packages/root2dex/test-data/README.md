# root2dex reference fixtures

The `*.pyrobird.json` files are the DEX documents pyrobird produces for the ROOT
files in `pyrobird/tests/unit_tests/data/`. `parity.spec.ts` converts the same
entries with this package and compares value by value — that comparison is the
definition of "root2dex matches pyrobird".

Regenerate them after a deliberate change to either converter:

```bash
pyrobird convert pyrobird/tests/unit_tests/data/reco_2024-09_craterlake_2evt.edm4eic.root \
  -e 0-1 -o packages/root2dex/test-data/reco_2024-09_craterlake_2evt.pyrobird.json
pyrobird convert pyrobird/tests/unit_tests/data/k_lambda_10x100_2evt.edm4hep.root \
  -t edm4hep -e 0-1 -o packages/root2dex/test-data/k_lambda_10x100_2evt.pyrobird.json
```

The `origin.file` field holds the path passed on that command line and is not
part of the comparison.
