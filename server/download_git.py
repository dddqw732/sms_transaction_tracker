import urllib.request
import zipfile
import os
import subprocess
from pathlib import Path

dest = Path(r"C:\Users\muhsin\AppData\Local\MinGit")
zip_path = Path(r"C:\Users\muhsin\AppData\Local\Temp\MinGit.zip")
git_exe = dest / "cmd" / "git.exe"

if not git_exe.exists():
    url = "https://github.com/git-for-windows/git/releases/download/v2.46.0.windows.1/MinGit-2.46.0-64-bit.zip"
    print(f"Downloading MinGit from {url}...")
    urllib.request.urlretrieve(url, str(zip_path))
    print("Extracting...")
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(str(zip_path), 'r') as zip_ref:
        zip_ref.extractall(str(dest))
    if zip_path.exists():
        zip_path.unlink()
    print("MinGit extracted successfully.")

res = subprocess.run([str(git_exe), "--version"], capture_output=True, text=True)
print("Git version:", res.stdout.strip())
