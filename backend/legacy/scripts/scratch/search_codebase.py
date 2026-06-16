import os
import re

def search():
    root_dir = r"c:\Users\Admin\Desktop\ITSM_case_management"
    patterns = [
        r"organization.*product",
        r"product.*organization",
        r"getProductsForOrganization"
    ]
    compiled = [re.compile(p, re.IGNORECASE) for p in patterns]

    for dirpath, _, filenames in os.walk(root_dir):
        if "node_modules" in dirpath or ".git" in dirpath or ".gemini" in dirpath:
            continue
        for f in filenames:
            if not f.endswith((".js", ".jsx", ".css", ".html")):
                continue
            path = os.path.join(dirpath, f)
            try:
                with open(path, "r", encoding="utf-8") as file:
                    for i, line in enumerate(file, 1):
                        for pattern, r_comp in zip(patterns, compiled):
                            if r_comp.search(line):
                                print(f"Match in {f}:{i} (Pattern: {pattern}): {line.strip()[:100]}")
            except Exception as e:
                pass

if __name__ == "__main__":
    search()
