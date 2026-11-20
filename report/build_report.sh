#!/bin/sh
# Build the final report: docx-js writes the document, then LibreOffice fills in the table of contents and the lists of
# figures and tables, saves the .docx and exports a PDF preview.
set -e
cd "$(dirname "$0")"
node build_report.js
/usr/bin/python3 update_toc.py FairShareAI_Major_Project_Report.docx
zip -d FairShareAI_Major_Project_Report.docx '*/' >/dev/null 2>&1 || true
