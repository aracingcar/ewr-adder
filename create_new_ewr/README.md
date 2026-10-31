# EWR adder (static site)

`index.html` is a self-contained page that loads `parameter_sheet.csv` (a copy of `py_ewr/parameter_metadata/parameter_sheet.csv`),
validates user-defined `U_` EWRs, appends their rows to the sheet live and offers the merged CSV for download.
Refresh the copy with: `cp py_ewr/parameter_metadata/parameter_sheet.csv py_ewr/parameter_metadata/ewr_calc_config.json create_new_ewr/`.
Serve locally with `python3 -m http.server --directory create_new_ewr`.

## Submitting to the repository

"Submit to repository" opens a pre-filled GitHub issue titled `New EWR: …` containing the definitions as JSON.
`.github/workflows/new-ewr.yml` runs `.github/scripts/add_ewr.mjs`, which re-validates them with `ewr-core.js`
(the same code the page uses), appends the rows (and a matching `ewr_calc_config.json` entry for each EWR) to `py_ewr/parameter_metadata/parameter_sheet.csv` and
`create_new_ewr/parameter_sheet.csv`, and opens a pull request that closes the issue. Invalid submissions get a comment and are closed.
One-off repo setting: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".
