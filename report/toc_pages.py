"""Find the page on which each main section heading starts in the built PDF and write toc_pages.json."""
import json, re, subprocess, sys

pdf = sys.argv[1]
src = open("build_synopsis.js", encoding="utf8").read()
titles = re.findall(r'H1\("([^"]+)"\)', src)
pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
found = {}
for p in range(3, pages + 1):  # page 1 = cover, page 2 = contents
    lines = [l.strip() for l in subprocess.run(["pdftotext", "-f", str(p), "-l", str(p), "-layout", pdf, "-"],
                                               capture_output=True, text=True).stdout.splitlines()]
    for t in titles:
        if t not in found and t in lines:
            found[t] = p - 1  # page numbering starts after the cover
missing = [t for t in titles if t not in found]
json.dump(found, open("toc_pages.json", "w"), indent=1)
print("sections found:", len(found), "missing:", missing)
