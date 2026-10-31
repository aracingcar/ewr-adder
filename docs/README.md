# EWR adder (static site)

`index.html` is a self-contained page that loads `parameter_sheet.csv` (a copy of `py_ewr/parameter_metadata/parameter_sheet.csv`),
validates user-defined `U_` EWRs, appends their rows to the sheet live and offers the merged CSV for download.
Refresh the copy with: `cp py_ewr/parameter_metadata/parameter_sheet.csv docs/parameter_sheet.csv`.
Serve locally with `python3 -m http.server --directory docs`.
