@echo off

:: 1. Add all changes to the staging area
echo Staging all files...
git add .

:: 2. Create a timestamp and commit the changes
echo Committing with a timestamp...
git commit -m "Auto-commit on %date% at %time%"

:: 3. Push the changes to the remote repository
echo Pushing to remote...
git push

echo.
echo --- All done! ---
pause