param([string]$Message = "")

Set-Location $PSScriptRoot

if ($Message -eq "") {
    $Message = "chore: update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}

Write-Host "=== Symmetry Deploy ===" -ForegroundColor Cyan
Write-Host "Message: $Message" -ForegroundColor Gray

# Remove stale git lock files if present
$lockFiles = @(".git\index.lock", ".git\HEAD.lock", ".git\MERGE_HEAD.lock")
foreach ($lock in $lockFiles) {
    if (Test-Path $lock) {
        Remove-Item $lock -Force
        Write-Host "Removed stale lock: $lock" -ForegroundColor Yellow
    }
}

Write-Host "Installing packages..." -ForegroundColor Gray
npm install --silent

git add -A
if ($LASTEXITCODE -ne 0) { Write-Host "git add failed" -ForegroundColor Red; exit 1 }

$changes = git status --porcelain
if ($changes) {
    git commit -m "$Message"
    if ($LASTEXITCODE -ne 0) { Write-Host "git commit failed" -ForegroundColor Red; exit 1 }
    Write-Host "Committed." -ForegroundColor Green
} else {
    Write-Host "Nothing new to commit, pushing existing commits." -ForegroundColor Yellow
}

git push origin main --force-with-lease
if ($LASTEXITCODE -eq 0) {
    Write-Host "Pushed! Vercel redeploys in ~60 seconds." -ForegroundColor Green
    Write-Host "https://vercel.com/symmetry-personal-training/symmetry-app" -ForegroundColor Cyan
} else {
    Write-Host "Retrying with force push..." -ForegroundColor Yellow
    git push origin main --force
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Force pushed. Vercel redeploys in ~60 seconds." -ForegroundColor Green
    } else {
        Write-Host "Push failed. Check git remote / auth." -ForegroundColor Red
        exit 1
    }
}
