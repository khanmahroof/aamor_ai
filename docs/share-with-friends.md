# Share Aamor with a friend

From PowerShell:

```powershell
cd "C:\Users\Admin\Documents\Codex\2026-09-25\i\outputs\cedar-chat"
node scripts/share-trial.mjs
```

The script checks that port 3001 is free, applies migrations to a separate trial database, starts a localhost.run HTTPS tunnel and launches the production app. Wait for **AAMOR FRIEND TRIAL READY**, then copy the HTTPS link into a message to your friend. They open it and create a new Aamor account. They do not install Node, Ollama or download project files.

Keep this terminal, Ollama, your internet connection and your computer running. Prevent sleep for the trial. Press Ctrl+C in this terminal to end sharing. A stopped or expired link no longer works; run the command again and send the new link. This is a temporary demo link, not permanent hosting. Free tunnel addresses can change or expire.

The script uses the existing production build; after code changes, stop app processes and run `npm run build` before sharing again. Node.js and Windows OpenSSH must be installed.

Trial accounts, messages, uploads and a separate authentication secret are under `storage/friend-trial/`. Your personal `dev.db`, uploads and authentication secret are not used. Optional cloud keys and Google OAuth are disabled for this trial. Inference runs on your local Ollama, so your computer's performance limits response speed and concurrent use.

The HTTPS connection terminates at localhost.run, which forwards traffic through SSH to your computer. Share the link only with intended testers. Anyone who obtains the link can reach the registration page. Ask testers to use a unique test password and avoid confidential information. As the host, you can access the trial database. Neither SQLite nor uploads are encrypted by this app.

Suggested message:

> Try my AI chat project, Aamor: [paste the link]. Create a new test account, ask a few questions, and let me know how easy it is to use, how helpful the answers are, and any errors you encounter. Please avoid private or sensitive information. It runs on my computer, so the link works only while I keep it online.

A separate feedback checklist is provided in `Aamor-friend-feedback.md` beside the project folder.

## Double-click launcher

You can also double-click `Start-Aamor-sharing.cmd` in the parent `outputs` folder.
It starts the same sharing script and keeps the console visible so you can copy
the link. Use it after the current sharing session has stopped; only one trial
can run on port 3001 at a time. Keep the launcher beside the `cedar-chat` folder.
