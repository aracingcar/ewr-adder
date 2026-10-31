# EWR adder (static site)

A browser page for defining new, user-defined (`U_`) environmental water requirements (EWRs) for the
[EWR tool](https://github.com/MDBAuth/EWR_tool), and optionally proposing them to this repository.

## What the page does

- Loads `parameter_sheet.csv` and `ewr_calc_config.json` (copies of the files in `py_ewr/parameter_metadata/`).
- Lets you pick a gauge, planning units, objectives, a rule type and its parameters, and validates everything
  (code format and uniqueness, bounds, timing windows, handler-specific requirements, salinity conversion).
- Shows the resulting parameter-sheet rows live, highlighted in a preview of the merged sheet.
- **Deleting existing rows:** each row of the preview has a Delete button (and a filtered view can mark all matching rows). Rows are identified by Code + Gauge + PlanningUnitID, shown struck through until submitted, listed under "Marked for deletion" with Undo, and limited to 500 per submission. If a code loses all its rows, its `ewr_calc_config.json` keys are removed too and the code can be reused.
- **Download merged sheet (CSV)** and **Download calc config (JSON)** produce the two files py_ewr needs. Use them via the
  `parameter_sheet` and `calc_config_path` arguments of its evaluation functions. The CSV is Windows-1252, as py_ewr reads it.
- **Export / Import JSON** saves and restores your definitions. They are also remembered in the browser's local storage.
- **Submit to repository** opens a pre-filled GitHub issue (see below), covering both added and deleted rows. Nothing leaves the browser until the issue is submitted.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page and its UI. |
| `ewr-core.js` | CSV parsing, validation, row building and calc-config editing. Shared with the workflow script. |
| `parameter_sheet.csv`, `ewr_calc_config.json` | Copies of the upstream files, kept in step by the workflow. |

Serve locally with `python3 -m http.server --directory create_new_ewr`.
To resync the copies from upstream: `cp py_ewr/parameter_metadata/parameter_sheet.csv py_ewr/parameter_metadata/ewr_calc_config.json create_new_ewr/`.

## Submitting to the repository

1. **Submit to repository** opens a new issue on `aracingcar/ewr-adder` titled `EWR change: …` (the older `New EWR:` prefix also works) with the definitions and deletions as JSON.
   If that is too long for a URL (about 7 KB), the body is copied to the clipboard to paste instead.
2. `.github/workflows/new-ewr.yml` runs `.github/scripts/add_ewr.mjs` on issues whose title starts with `EWR change:`.
   It re-validates the definitions with `ewr-core.js` (the same code as the page) against the current sheet.
3. If valid, it removes any deleted rows (and now-unused calc-config keys), appends the new rows to `py_ewr/parameter_metadata/parameter_sheet.csv` and adds a `<Code>-<single|multigauge>-<F|V|L>`
   entry under the right handler in `ewr_calc_config.json`, updates the copies here, and opens a pull request that closes the issue.
   If invalid, it comments with the reason and closes the issue.

Existing bytes in the CSV and JSON are left untouched; only the new rows and entries are appended. Two pull requests open at once
will conflict at the end of the CSV, so merge one and update the other.

One-off repository setting: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
To change the target repository, edit `REPO` in `index.html` and move the workflow there.

This is an unofficial tool, not endorsed by the MDBA. A new rule is a definition for testing, not an approved requirement.
