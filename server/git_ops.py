import sys
from pathlib import Path
from dulwich import porcelain

repo_path = Path(__file__).parent.parent.resolve()
print("Repo directory:", repo_path)

# Initialize repo if not already
dot_git = repo_path / ".git"
if not dot_git.exists():
    repo = porcelain.init(str(repo_path))
    print("Initialized git repository.")
else:
    repo = porcelain.open_repo_closing(str(repo_path))

# Add all files
status = porcelain.status(str(repo_path))
print("Untracked files count:", len(status.untracked))
print("Modified files count:", len(status.unstaged))

porcelain.add(str(repo_path))
print("Added files to staging.")

try:
    commit_id = porcelain.commit(
        str(repo_path),
        message=b"Fix dashboard simplification, invoice mark paid, business type selection, and currency conversion workflow",
        author=b"Muhsin <muhsin@example.com>",
        committer=b"Muhsin <muhsin@example.com>"
    )
    print("Committed successfully with ID:", commit_id.decode() if isinstance(commit_id, bytes) else commit_id)
except Exception as e:
    print("Commit info / error:", e)
