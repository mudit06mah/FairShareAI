#!/bin/sh
# Rebuild the synopsis (two passes so the contents table gets page numbers) and the cheatsheet.
set -e
cd "$(dirname "$0")"
rm -f toc_pages.json
node build_synopsis.js && /usr/bin/python3 update_toc.py FairShareAI_Major_Project_Synopsis.docx
python3 toc_pages.py FairShareAI_Major_Project_Synopsis.pdf
node build_synopsis.js && /usr/bin/python3 update_toc.py FairShareAI_Major_Project_Synopsis.docx
python3 toc_pages.py FairShareAI_Major_Project_Synopsis.pdf >/dev/null && cp toc_pages.json toc_check.json
node build_cheatsheet.js && /usr/bin/python3 update_toc.py FairShareAI_Cheatsheet.docx
