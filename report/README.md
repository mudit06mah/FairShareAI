# Report files

- `FairShareAI_Major_Project_Report.docx` / `.pdf`: final major project report (JIIT capstone template). Rebuild with `uv run --no-project --with numpy --with scipy --with matplotlib python make_report_figures.py` (figures) then `./build_report.sh` (document, contents lists, PDF preview). Edit `build_report.js` for content changes, or edit the .docx directly.
- `FairShareAI_Major_Project_Synopsis.docx` / `.pdf`: major project synopsis (edit the .docx directly, or edit `build_synopsis.js` and rebuild)
- `FairShareAI_Cheatsheet.docx` / `.pdf`: plain-language explanation of the project for viva preparation

Rebuild (from this folder):

```bash
../poc/.venv/bin/python make_diagrams.py                     # architecture and workflow diagrams
(cd ../poc && SIMPLE=1 NO_TITLES=1 FIGDIR=../report/figures .venv/bin/python analyze.py)   # result charts
./build.sh                                                   # synopsis (two passes for contents page numbers) + cheatsheet
```

`build.sh` builds the synopsis once, reads where each section starts from the PDF (`toc_pages.py`), then builds it again so the contents table has the right page numbers. `update_toc.py` exports the PDF through LibreOffice and needs the system Python (`/usr/bin/python3`), which has the `uno` module. If you edit the .docx by hand instead, update the page numbers in the contents table yourself.
