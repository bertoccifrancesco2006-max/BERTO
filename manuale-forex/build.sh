#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 render_pdf.py  src MANUALE-FOREX-Da-Base-a-Pro.pdf
python3 render_docx.py src MANUALE-FOREX-Da-Base-a-Pro.docx
echo "Fatto."
